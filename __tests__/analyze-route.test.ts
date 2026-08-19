// @vitest-environment node
//
// ⚠️ このファイルだけ node 環境で走らせる。既定の jsdom だと `File` が jsdom 実装、
// `Request.formData()` の中身は undici 実装になり、両者が噛み合わない。
// 具体的には jsdom の File を FormData に入れて `formData()` で読み直すと、
// 中身が文字列 "undefined" に化ける（バイト列が `[117,110,100,101,...]` になる）。
// Route Handler のテストに DOM は要らないので、実行環境を揃えるほうが素直。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock のファクトリは巻き上げられるため、参照するモックも vi.hoisted で一緒に巻き上げる。
const { authMock, serviceMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  serviceMock: vi.fn(),
}));

// 実体を読むと lib/prisma.ts などが評価され、環境変数の無い環境で落ちる。
// `requireUserId()` は実物を使い、その土台の auth() だけ差し替える
// （401 への変換が本当に効いているかを見たいので、session.ts はモックしない）。
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/recipe-analysis", () => ({ analyzeAndSaveRecipe: serviceMock }));

import { POST, maxDuration } from "@/app/api/recipes/analyze/route";
import {
  AnalysisFailedError,
  AnalysisTimeoutError,
  ImageTooLargeError,
  StorageFailedError,
  UnsupportedFormatError,
} from "@/lib/errors";
import { MAX_IMAGE_BYTES } from "@/lib/images/constants";

const USER_ID = "clx1a2b3c4d5e6f7g8h9";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x11, 0x22]);

/** multipart/form-data のリクエストを組み立てる。 */
function requestWithImage(bytes: Uint8Array = JPEG, field = "image"): Request {
  const form = new FormData();
  form.set(field, new File([bytes as BlobPart], "recipe.jpg", { type: "image/jpeg" }));
  return new Request("http://localhost/api/recipes/analyze", { method: "POST", body: form });
}

beforeEach(() => {
  authMock.mockReset();
  serviceMock.mockReset();
  authMock.mockResolvedValue({ user: { id: USER_ID } });
  serviceMock.mockResolvedValue({ recipeId: "recipe_1" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("設定", () => {
  it("maxDuration が SDK のタイムアウト（50秒）より長い", () => {
    // これを削ると Vercel Hobby の既定（10秒）に戻り、解析が終わる前に切れる
    expect(maxDuration).toBe(60);
  });
});

describe("認証（requirements.md Req7 / HANDOVER.md の持ち越し）", () => {
  it("未ログインなら 401", async () => {
    authMock.mockResolvedValue(null);

    const res = await POST(requestWithImage());

    expect(res.status).toBe(401);
  });

  it("未ログインなら解析を始めない（APIコストを払わない）", async () => {
    authMock.mockResolvedValue(null);

    await POST(requestWithImage());

    expect(serviceMock).not.toHaveBeenCalled();
  });

  it("401 も { success, data, error } の形で返る", async () => {
    authMock.mockResolvedValue(null);

    const body = await (await POST(requestWithImage())).json();

    expect(body).toEqual({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED", message: expect.stringContaining("ログイン") },
    });
  });

  it("セッションはあるが id が無い場合も 401", async () => {
    authMock.mockResolvedValue({ user: {} });

    expect((await POST(requestWithImage())).status).toBe(401);
  });

  it("セッションの userId を Service に渡す", async () => {
    await POST(requestWithImage());

    expect(serviceMock.mock.calls[0][0].userId).toBe(USER_ID);
  });

  /**
   * **Phase 1 からの持ち越しの本体**（HANDOVER.md 1章）。
   * ボディに他人の userId を入れても、自分のレシピとして作られること。
   */
  it("ボディの userId を無視してセッションの userId を使う", async () => {
    const form = new FormData();
    form.set("image", new File([JPEG as BlobPart], "recipe.jpg", { type: "image/jpeg" }));
    form.set("userId", "victim_user_id");
    const request = new Request("http://localhost/api/recipes/analyze", {
      method: "POST",
      body: form,
    });

    await POST(request);

    expect(serviceMock.mock.calls[0][0].userId).toBe(USER_ID);
    expect(serviceMock.mock.calls[0][0].userId).not.toBe("victim_user_id");
  });
});

describe("成功時", () => {
  it("200 と recipeId を返す", async () => {
    const res = await POST(requestWithImage());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { recipeId: "recipe_1" },
      error: null,
    });
  });

  it("受け取った画像をそのまま Service に渡す", async () => {
    await POST(requestWithImage());

    const passed = serviceMock.mock.calls[0][0].image;
    expect(Buffer.isBuffer(passed)).toBe(true);
    expect(Uint8Array.from(passed)).toEqual(JPEG);
  });

  it("解析結果の中身は返さない（確認画面は Phase 3 が取りに行く）", async () => {
    const body = await (await POST(requestWithImage())).json();

    expect(Object.keys(body.data)).toEqual(["recipeId"]);
  });
});

describe("リクエストの不備", () => {
  it("multipart でないボディは 400", async () => {
    const request = new Request("http://localhost/api/recipes/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: "not a file" }),
    });

    const res = await POST(request);

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_IMAGE");
  });

  it("image フィールドが無ければ 400", async () => {
    const res = await POST(requestWithImage(JPEG, "photo"));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_IMAGE");
  });

  it("中身が空のファイルは 400", async () => {
    const res = await POST(requestWithImage(new Uint8Array(0)));

    expect(res.status).toBe(400);
  });

  it("10MB を超えるファイルは 413（requirements.md Req2）", async () => {
    const tooLarge = new Uint8Array(MAX_IMAGE_BYTES + 1);
    tooLarge.set([0xff, 0xd8, 0xff], 0);

    const res = await POST(requestWithImage(tooLarge));

    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("IMAGE_TOO_LARGE");
  });

  it("不備があれば解析を始めない", async () => {
    await POST(requestWithImage(new Uint8Array(0)));

    expect(serviceMock).not.toHaveBeenCalled();
  });
});

describe("Service の失敗を HTTP に変換する（design.md 5.4）", () => {
  const cases = [
    { error: new UnsupportedFormatError(), status: 415, code: "UNSUPPORTED_FORMAT" },
    { error: new ImageTooLargeError(), status: 413, code: "IMAGE_TOO_LARGE" },
    { error: new AnalysisFailedError(), status: 422, code: "ANALYSIS_FAILED" },
    { error: new AnalysisTimeoutError(), status: 504, code: "ANALYSIS_TIMEOUT" },
    { error: new StorageFailedError(), status: 502, code: "STORAGE_FAILED" },
  ];

  it.each(cases)("$code は $status", async ({ error, status, code }) => {
    serviceMock.mockRejectedValue(error);

    const res = await POST(requestWithImage());

    expect(res.status).toBe(status);
    await expect(res.json()).resolves.toEqual({
      success: false,
      data: null,
      error: { code, message: expect.any(String) },
    });
  });

  it("想定外の例外は 500 で、内部情報を漏らさない", async () => {
    serviceMock.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5 password=hunter2"));

    const res = await POST(requestWithImage());

    expect(res.status).toBe(500);
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toContain("ECONNREFUSED");
    expect(raw).not.toContain("hunter2");
    expect(raw).not.toContain("10.0.0.5");
  });

  it("例外が Route Handler の外へ漏れない（必ず Response を返す）", async () => {
    serviceMock.mockRejectedValue(new Error("boom"));

    await expect(POST(requestWithImage())).resolves.toBeInstanceOf(Response);
  });
});
