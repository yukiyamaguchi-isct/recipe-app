// @vitest-environment node
//
// ⚠️ このファイルだけ node 環境で走らせる。既定の jsdom だと `Request` / `Response` が
// jsdom 実装と undici 実装で噛み合わず、**実装が悪いように見える**
// （recipe-list design.md 落とし穴 #25 / `recipe-patch-route.test.ts` と同じ）。
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock のファクトリは巻き上げられるため、参照するモックも vi.hoisted で一緒に巻き上げる。
const { authMock, deleteRecipeMock, deleteImageMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  deleteRecipeMock: vi.fn(),
  deleteImageMock: vi.fn(),
}));

// 実体を読むと lib/prisma.ts が評価され、DATABASE_URL の無い環境で落ちる。
// `requireUserId()` は実物を使い、その土台の auth() だけ差し替える
// （401 への変換が本当に効いているかを見たいので、session.ts はモックしない）。
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/repositories/recipe", () => ({
  deleteRecipeForUser: deleteRecipeMock,
  updateRecipeTitle: vi.fn(),
}));
vi.mock("@/lib/clients/s3", () => ({ deleteRecipeImage: deleteImageMock }));

import { DELETE } from "@/app/api/recipes/[id]/route";

const USER_ID = "clx1a2b3c4d5e6f7g8h9";
const RECIPE_ID = "clr9z8y7x6w5v4u3t2s1";
const IMAGE_KEY = `${USER_ID}/01abc5ef-06e6-40e0-bbe5-a1bedde6b3fa.jpg`;

/** Route Handler の `params` は Promise（落とし穴 #23）。実物と同じ形で渡す。 */
function contextFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

function request() {
  return new Request(`http://localhost/api/recipes/${RECIPE_ID}`, { method: "DELETE" });
}

beforeEach(() => {
  authMock.mockReset();
  deleteRecipeMock.mockReset();
  deleteImageMock.mockReset();

  authMock.mockResolvedValue({ user: { id: USER_ID } });
  deleteRecipeMock.mockResolvedValue({ imageKey: IMAGE_KEY });
  deleteImageMock.mockResolvedValue(undefined);
});

describe("DELETE /api/recipes/[id]（requirements.md Req5）", () => {
  it("自分のレシピを消せる（200）", async () => {
    const response = await DELETE(request(), contextFor(RECIPE_ID));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { id: RECIPE_ID },
      error: null,
    });
  });

  it("セッションの userId でスコープして消す（クライアントの値を信用しない）", async () => {
    await DELETE(request(), contextFor(RECIPE_ID));

    expect(deleteRecipeMock).toHaveBeenCalledWith(USER_ID, RECIPE_ID);
  });

  it("params を await している（Promise のまま Repository へ渡さない）", async () => {
    await DELETE(request(), contextFor(RECIPE_ID));

    const [, passedId] = deleteRecipeMock.mock.calls[0];
    expect(passedId).toBe(RECIPE_ID);
    expect(passedId).not.toBeInstanceOf(Promise);
  });
});

describe("S3 の後片付け（design.md 5.3）", () => {
  it("消えたレシピの imageKey で画像も消す", async () => {
    await DELETE(request(), contextFor(RECIPE_ID));

    expect(deleteImageMock).toHaveBeenCalledWith(IMAGE_KEY);
  });

  /**
   * ⚠️ 落とし穴 #7。**順序を逆にしない。**
   *
   * S3 → DB にすると、S3 が成功して DB が失敗したときに**画像の無いレシピが
   * ユーザーに残る**。DB → S3 なら、残るのはユーザーに見えない孤児だけ。
   */
  it("DB を消してから S3 を消す（逆にしない）", async () => {
    const order: string[] = [];
    deleteRecipeMock.mockImplementation(async () => {
      order.push("db");
      return { imageKey: IMAGE_KEY };
    });
    deleteImageMock.mockImplementation(async () => {
      order.push("s3");
    });

    await DELETE(request(), contextFor(RECIPE_ID));

    expect(order).toEqual(["db", "s3"]);
  });

  it("消せなかったときは S3 を触らない（他人の画像を消さない）", async () => {
    deleteRecipeMock.mockResolvedValue(null);

    await DELETE(request(), contextFor(RECIPE_ID));

    expect(deleteImageMock).not.toHaveBeenCalled();
  });
});

describe("認可（requirements.md Req6）", () => {
  it("未ログインなら 401（Repository を呼ばない）", async () => {
    authMock.mockResolvedValue(null);

    const response = await DELETE(request(), contextFor(RECIPE_ID));

    expect(response.status).toBe(401);
    expect(deleteRecipeMock).not.toHaveBeenCalled();
  });

  /**
   * 「存在しない」と「他人のもの」を**区別しない**（design.md 5.3 / Phase 3 と同じ）。
   * 出し分けると、IDを総当たりして他人のレシピの存在を確かめられる。
   */
  it("他人のレシピ・存在しないIDはどちらも 404 で、応答が同一になる", async () => {
    deleteRecipeMock.mockResolvedValue(null);

    const other = await DELETE(request(), contextFor(RECIPE_ID));
    const missing = await DELETE(request(), contextFor("clzzzzzzzzzzzzzzzzzzz"));

    expect(other.status).toBe(404);
    expect(missing.status).toBe(404);
    // ボディまで同じであること。文言で匂わせない
    await expect(other.json()).resolves.toEqual(await missing.json());
  });

  it("404 の文言が「存在しない」か「他人のもの」かを匂わせない", async () => {
    deleteRecipeMock.mockResolvedValue(null);

    const body = await (await DELETE(request(), contextFor(RECIPE_ID))).json();

    expect(body.error.message).not.toMatch(/他人|他のユーザー|権限/);
  });
});

describe("失敗時", () => {
  /**
   * ⚠️ 落とし穴 #8。**S3 の失敗でリクエストを失敗させない。**
   *
   * DB からは消えているので、ユーザーにとって操作は完了している。
   * 「失敗しました」と出して再試行させると、2回目は 404 になる。
   */
  it("S3 の削除が失敗してもリクエストは 200（ユーザーの操作は完了している）", async () => {
    // 実物の deleteRecipeImage は投げない契約。**その契約が破れても 200 を返す**ことを固定する
    // （ルート側で寄りかからずに担保している。route.ts の try/catch）
    deleteImageMock.mockRejectedValue(new Error("Access Denied"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await DELETE(request(), contextFor(RECIPE_ID));

    expect(response.status).toBe(200);
    // 握り潰していないこと
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it("想定外の例外は 500 になり、内部情報を漏らさない", async () => {
    deleteRecipeMock.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.1:5432"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await DELETE(request(), contextFor(RECIPE_ID));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.message).not.toContain("ECONNREFUSED");
    expect(body.error.message).not.toContain("10.0.0.1");

    errorSpy.mockRestore();
  });
});
