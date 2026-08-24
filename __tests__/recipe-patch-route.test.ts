// @vitest-environment node
//
// ⚠️ このファイルだけ node 環境で走らせる。既定の jsdom だと `Request` / `Response` が
// jsdom 実装と undici 実装で噛み合わず、**実装が悪いように見える**
// （`.kiro/specs/recipe-analysis/design.md` 9.3 で12件が落ちた前例がある）。
// Route Handler のテストに DOM は要らないので、実行環境を揃えるほうが素直。
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock のファクトリは巻き上げられるため、参照するモックも vi.hoisted で一緒に巻き上げる。
const { authMock, updateMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  updateMock: vi.fn(),
}));

// 実体を読むと lib/prisma.ts が評価され、DATABASE_URL の無い環境で落ちる。
// `requireUserId()` は実物を使い、その土台の auth() だけ差し替える
// （401 への変換が本当に効いているかを見たいので、session.ts はモックしない）。
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/repositories/recipe", () => ({ updateRecipeTitle: updateMock }));

import { PATCH } from "@/app/api/recipes/[id]/route";
import { MAX_TITLE_LENGTH } from "@/lib/recipes/title";

const USER_ID = "clx1a2b3c4d5e6f7g8h9";
const RECIPE_ID = "clr1a2b3c4d5e6f7g8h9";

/** `RouteContext` と同じ形（params は Promise）。 */
function context(id = RECIPE_ID) {
  return { params: Promise.resolve({ id }) };
}

function request(body: unknown, { raw = false } = {}) {
  return new Request(`http://localhost/api/recipes/${RECIPE_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

async function call(body: unknown, id = RECIPE_ID) {
  const response = await PATCH(request(body), context(id));
  return { response, body: await response.json() };
}

beforeEach(() => {
  authMock.mockReset();
  updateMock.mockReset();

  authMock.mockResolvedValue({ user: { id: USER_ID } });
  updateMock.mockResolvedValue(1);
});

describe("成功時", () => {
  it("200 と保存後のタイトルを返す", async () => {
    const { response, body } = await call({ title: "肉じゃが" });

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, data: { title: "肉じゃが" }, error: null });
  });

  it("前後の空白を落として保存する", async () => {
    await call({ title: "  肉じゃが  " });

    expect(updateMock).toHaveBeenCalledWith(USER_ID, RECIPE_ID, "肉じゃが");
  });

  it("中の空白は触らない（表記をこちらで詰めない）", async () => {
    await call({ title: "肉じゃが （母の味）" });

    expect(updateMock).toHaveBeenCalledWith(USER_ID, RECIPE_ID, "肉じゃが （母の味）");
  });

  it("URL の id をそのまま使う（params を await している。落とし穴 #22）", async () => {
    await call({ title: "肉じゃが" }, "clother00000000000000");

    expect(updateMock.mock.calls[0][1]).toBe("clother00000000000000");
  });
});

/**
 * 認可。**クライアントが送ってきた userId は見ない。**
 * `.kiro/steering/architecture.md`「クライアントから渡された userId を信用しない」。
 */
describe("認証・認可", () => {
  it("未ログインなら 401", async () => {
    authMock.mockResolvedValue(null);

    const { response, body } = await call({ title: "肉じゃが" });

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("未ログインなら更新を試みない", async () => {
    authMock.mockResolvedValue(null);

    await call({ title: "肉じゃが" });

    expect(updateMock).not.toHaveBeenCalled();
  });

  it("セッションの userId でスコープする", async () => {
    await call({ title: "肉じゃが" });

    expect(updateMock.mock.calls[0][0]).toBe(USER_ID);
  });

  it("body に userId を混ぜても無視する", async () => {
    await call({ title: "肉じゃが", userId: "clattacker0000000000" });

    expect(updateMock.mock.calls[0][0]).toBe(USER_ID);
  });
});

describe("見つからない（design.md 5.2）", () => {
  it("更新件数が 0 なら 404", async () => {
    updateMock.mockResolvedValue(0);

    const { response, body } = await call({ title: "肉じゃが" });

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("RECIPE_NOT_FOUND");
  });

  it("他人のものか存在しないかを文言で出し分けない", async () => {
    updateMock.mockResolvedValue(0);

    const { body } = await call({ title: "肉じゃが" });

    expect(body.error.message).not.toMatch(/権限|他のユーザー|他人|存在しません/);
  });
});

describe("入力の検証（requirements.md Req7）", () => {
  it("空のタイトルは 400", async () => {
    const { response, body } = await call({ title: "" });

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("空白だけのタイトルは 400（trim 後に空になる）", async () => {
    const { response } = await call({ title: "   " });

    expect(response.status).toBe(400);
  });

  it("空のときは更新を試みない", async () => {
    await call({ title: "" });

    expect(updateMock).not.toHaveBeenCalled();
  });

  it(`${MAX_TITLE_LENGTH} 文字ちょうどは通る`, async () => {
    const { response } = await call({ title: "あ".repeat(MAX_TITLE_LENGTH) });

    expect(response.status).toBe(200);
  });

  it(`${MAX_TITLE_LENGTH + 1} 文字は 400`, async () => {
    const { response, body } = await call({ title: "あ".repeat(MAX_TITLE_LENGTH + 1) });

    expect(response.status).toBe(400);
    expect(body.error.message).toContain(String(MAX_TITLE_LENGTH));
  });

  it("サロゲートペアを1文字として数える（length ではなくコードポイント）", async () => {
    // "🍳".length は 2（サロゲートペア）だが1コードポイント。
    // length で数えると 50 個で弾かれてしまい、厳しすぎる
    const { response } = await call({ title: "🍳".repeat(MAX_TITLE_LENGTH) });

    expect(response.status).toBe(200);
  });

  it("⚠️ ZWJ で結合した絵文字は見た目より多く数える（既知の割り切り）", async () => {
    // "👩‍🍳" は 👩 + ZWJ + 🍳 の3コードポイント。**書記素単位では数えていない。**
    // Intl.Segmenter を使えば正確になるが、レシピ名に結合絵文字が並ぶ場面は
    // 想定しにくいので入れていない（lib/recipes/title.ts）
    const { response } = await call({ title: "👩‍🍳".repeat(MAX_TITLE_LENGTH / 2) });

    expect(response.status).toBe(400);
  });

  it("title が無いリクエストは 400", async () => {
    const { response, body } = await call({});

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("title が文字列でないリクエストは 400", async () => {
    const { response } = await call({ title: 123 });

    expect(response.status).toBe(400);
  });

  it("JSON でない body は 400", async () => {
    const response = await PATCH(request("これはJSONではない", { raw: true }), context());

    expect(response.status).toBe(400);
  });
});

describe("内部情報を漏らさない（design.md 5.5）", () => {
  it("JSON パースの失敗でも生メッセージを返さない", async () => {
    const response = await PATCH(request("{壊れた", { raw: true }), context());
    const body = await response.json();

    // パーサの英語メッセージ（Unexpected token など）が出ていないこと
    expect(body.error.message).not.toMatch(/Unexpected|JSON|SyntaxError/);
  });

  it("想定外の例外は 500 の固定文言になる", async () => {
    updateMock.mockRejectedValue(new Error("connection terminated: host=db.internal"));

    const { response, body } = await call({ title: "肉じゃが" });

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).not.toMatch(/db\.internal|connection/);
  });
});
