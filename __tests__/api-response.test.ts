import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  errorResponse,
  failureBody,
  statusFor,
  successBody,
  successResponse,
} from "@/lib/api-response";
import * as errors from "@/lib/errors";
import {
  AnalysisFailedError,
  AnalysisRefusedError,
  AnalysisTimeoutError,
  AppError,
  ImageTooLargeError,
  InvalidImageError,
  StorageFailedError,
  UnauthorizedError,
  UnsupportedFormatError,
} from "@/lib/errors";

// errorResponse は想定外の例外をログに出す。テスト出力を汚さないよう抑える。
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("successBody / successResponse", () => {
  it("{ success: true, data, error: null } を返す", () => {
    expect(successBody({ recipeId: "r_1" })).toEqual({
      success: true,
      data: { recipeId: "r_1" },
      error: null,
    });
  });

  it("成功は 200 を返す", async () => {
    const res = successResponse({ recipeId: "r_1" });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { recipeId: "r_1" },
      error: null,
    });
  });
});

describe("エラーコードと HTTP ステータスの対応（design.md 5.4）", () => {
  // 表を書き写したのではなく、実際にエラーを投げて確かめる。
  const cases: { error: AppError; status: number }[] = [
    { error: new UnauthorizedError(), status: 401 },
    { error: new InvalidImageError(), status: 400 },
    { error: new ImageTooLargeError(), status: 413 },
    { error: new UnsupportedFormatError(), status: 415 },
    { error: new AnalysisFailedError(), status: 422 },
    { error: new AnalysisRefusedError(), status: 422 },
    { error: new AnalysisTimeoutError(), status: 504 },
    { error: new StorageFailedError(), status: 502 },
  ];

  it.each(cases)("$error.code は $status を返す", async ({ error, status }) => {
    const res = errorResponse(error);

    expect(res.status).toBe(status);
    await expect(res.json()).resolves.toEqual({
      success: false,
      data: null,
      error: { code: error.code, message: error.message },
    });
  });

  it("対応表に無いコードは 500 になる", () => {
    expect(statusFor("NOT_IN_THE_TABLE")).toBe(500);
  });

  /**
   * lib/errors.ts にエラーを足したのに対応表へ足し忘れると、
   * 実装は通るのに本番で 500 が返る。型では捕まらないのでテストで固定する。
   */
  it("lib/errors.ts のすべてのエラーが対応表に載っている", () => {
    const subclasses = Object.values(errors).filter(
      (exported) =>
        typeof exported === "function" &&
        exported !== AppError &&
        exported.prototype instanceof AppError,
    );

    // 取りこぼしていないことの確認。増えたらこの数も増える。
    expect(subclasses).toHaveLength(8);

    for (const Subclass of subclasses) {
      // どのサブクラスも引数なしで作れる（message は各クラスが固定で持つ）。
      const error = new (Subclass as new () => AppError)();
      expect(statusFor(error.code), `${error.code} が対応表に無い`).not.toBe(500);
    }
  });
});

describe("内部情報を漏らさない（design.md 7章 / requirements.md Req6）", () => {
  it("AppError 以外は中身を見ずに固定文言の 500 を返す", async () => {
    const raw = new Error("connect ECONNREFUSED 10.0.0.5:5432 password=hunter2");

    const res = errorResponse(raw);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).not.toContain("ECONNREFUSED");
    expect(body.error.message).not.toContain("hunter2");
    expect(JSON.stringify(body)).not.toContain("10.0.0.5");
  });

  it("cause に入れた内部情報はレスポンスに載らない", async () => {
    const error = new StorageFailedError({
      cause: new Error("Access Denied: bucket recipe-app-prod-images, key AKIAIOSFODNN7"),
    });

    const res = errorResponse(error);

    const body = JSON.stringify(await res.json());
    expect(body).not.toContain("recipe-app-prod-images");
    expect(body).not.toContain("AKIAIOSFODNN7");
    expect(body).not.toContain("Access Denied");
  });

  it("cause はサーバー側のログには残る", () => {
    const cause = new Error("Access Denied");

    errorResponse(new StorageFailedError({ cause }));

    expect(console.error).toHaveBeenCalledWith("[api] STORAGE_FAILED", cause);
  });

  it("スタックトレースを body に含めない", async () => {
    const body = failureBody(new AnalysisFailedError({ cause: new Error("boom") }));

    expect(Object.keys(body.error)).toEqual(["code", "message"]);
  });
});

describe("エラー文言（requirements.md Req6）", () => {
  const all = [
    new UnauthorizedError(),
    new InvalidImageError(),
    new ImageTooLargeError(),
    new UnsupportedFormatError(),
    new AnalysisFailedError(),
    new AnalysisRefusedError(),
    new AnalysisTimeoutError(),
    new StorageFailedError(),
  ];

  it.each(all)("$code の文言が日本語で、英語のエラー文をそのまま含まない", (error) => {
    // ひらがな・カタカナ・漢字のいずれかを含む＝日本語として書かれている
    expect(error.message).toMatch(/[ぁ-んァ-ヶ一-龠]/);
    expect(error.message).not.toMatch(/Error|error|failed|Exception/);
  });

  it("HEIC を弾く文言が、代わりに何をすればよいか示している", () => {
    const message = new UnsupportedFormatError().message;

    expect(message).toContain("JPEG");
    expect(message).toContain("PNG");
  });

  it("読み取り失敗の文言が撮り直しの具体的な指示を含む（Req6）", () => {
    const message = new AnalysisFailedError().message;

    expect(message).toContain("明るい場所");
    expect(message).toContain("ページ全体");
  });

  it("タイムアウトの文言が原因と次の行動の両方を含む（Req6）", () => {
    const message = new AnalysisTimeoutError().message;

    // 原因は「タイムアウトしました」（2026-08-16 ユーザー決定）
    expect(message).toContain("タイムアウトしました");
    // これだけでは次にどうすればいいか分からないので、再試行の案内が要る
    expect(message).toContain("もう一度");
  });
});
