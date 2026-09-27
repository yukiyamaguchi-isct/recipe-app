// @vitest-environment node
//
// ⚠️ Route Handler のテストは node 環境で走らせる。既定の jsdom だと `Request` / `Response` が
// 噛み合わず、**実装が悪いように見える**（recipe-view 落とし穴 #21。recipe-patch-route.test.ts と同じ）。
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock のファクトリは巻き上げられるため、参照するモックも vi.hoisted で一緒に巻き上げる。
const { authMock, replaceMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  replaceMock: vi.fn(),
}));

// `requireUserId()` は実物を使い、その土台の auth() だけ差し替える（401 への変換を本当に通す）。
// ⚠️ **Repository をモックしているので、所有チェックはここでは担保しない。**
// それは recipe-replace-contents.test.ts の偽の DB が担保する（design.md 8章）。
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/repositories/recipe", () => ({ replaceRecipeContents: replaceMock }));

import { PUT } from "@/app/api/recipes/[id]/route";
import { Category } from "@/generated/prisma/enums";
import {
  EMPTY_NAME_CONTENTS_MESSAGE,
  EMPTY_STEP_CONTENTS_MESSAGE,
  MAX_STEPS,
  TOO_MANY_STEPS_MESSAGE,
} from "@/lib/recipes/contents";

const USER_ID = "clx1a2b3c4d5e6f7g8h9";
const OTHER_USER_ID = "clzzz9y8x7w6v5u4t3s2";
const RECIPE_ID = "clr1a2b3c4d5e6f7g8h9";
const MALFORMED = "リクエストの形式が正しくありません。";

const VALID = {
  ingredients: [
    { name: "玉ねぎ", amount: "1/2個", category: Category.VEGETABLE },
    { name: "塩", amount: null, category: Category.SEASONING },
  ],
  steps: ["切る。", "炒める。\n塩で味を調える。"],
};

/** `RouteContext` と同じ形（params は Promise）。 */
function context(id = RECIPE_ID) {
  return { params: Promise.resolve({ id }) };
}

function request(body: unknown, { raw = false } = {}) {
  return new Request(`http://localhost/api/recipes/${RECIPE_ID}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

async function call(body: unknown, { id = RECIPE_ID, raw = false } = {}) {
  const response = await PUT(request(body, { raw }), context(id));
  return { response, body: await response.json() };
}

beforeEach(() => {
  authMock.mockReset();
  replaceMock.mockReset();

  authMock.mockResolvedValue({ user: { id: USER_ID } });
  replaceMock.mockResolvedValue(1);
});

describe("成功時", () => {
  it("200 と id を返す", async () => {
    const { response, body } = await call(VALID);

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, data: { id: RECIPE_ID }, error: null });
  });

  it("送った内容をそのまま Repository に渡す（順序も分量の null も保つ）", async () => {
    await call(VALID);

    expect(replaceMock).toHaveBeenCalledWith(USER_ID, RECIPE_ID, VALID);
  });

  it("材料0件・手順0件でも保存できる（design.md 4.4）", async () => {
    const { response } = await call({ ingredients: [], steps: [] });

    expect(response.status).toBe(200);
    expect(replaceMock).toHaveBeenCalledWith(USER_ID, RECIPE_ID, { ingredients: [], steps: [] });
  });

  it("URL の id をそのまま使う（params を await している。落とし穴 #22）", async () => {
    await call(VALID, { id: "clother00000000000000" });

    expect(replaceMock.mock.calls[0][1]).toBe("clother00000000000000");
  });

  it("**材料の余計なキーを Repository に渡さない**（id や他人の recipeId を通さない）", async () => {
    await call({
      ingredients: [{ ...VALID.ingredients[0], id: "forged", recipeId: "clzzzzzzzzzzzzzzzzzz" }],
      steps: [],
    });

    expect(replaceMock.mock.calls[0][2].ingredients).toEqual([VALID.ingredients[0]]);
  });
});

/**
 * 認可。**クライアントが送ってきた userId は見ない。**
 * `.kiro/steering/architecture.md`「クライアントから渡された userId を信用しない」。
 */
describe("認証・認可", () => {
  it("未ログインなら 401 で、Repository を呼ばない", async () => {
    authMock.mockResolvedValue(null);

    const { response, body } = await call(VALID);

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("**body の userId を見ない。** セッションの userId で呼ぶ", async () => {
    await call({ ...VALID, userId: OTHER_USER_ID });

    expect(replaceMock.mock.calls[0][0]).toBe(USER_ID);
  });

  it("存在しない / 他人のレシピ（Repository が 0）なら 404。区別しない", async () => {
    replaceMock.mockResolvedValue(0);

    const { response, body } = await call(VALID);

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("RECIPE_NOT_FOUND");
  });
});

describe("形が違う（400・固定文言）", () => {
  it.each([
    ["JSON でない", "{not json", true],
    ["null", "null", true],
    ["配列", [], false],
    ["ingredients が無い", { steps: [] }, false],
    ["steps が無い", { ingredients: [] }, false],
    ["ingredients が配列でない", { ingredients: {}, steps: [] }, false],
    ["材料が null", { ingredients: [null], steps: [] }, false],
    [
      "材料名が文字列でない",
      { ingredients: [{ name: 1, amount: null, category: "OTHER" }], steps: [] },
      false,
    ],
    [
      "分量が数値",
      { ingredients: [{ name: "塩", amount: 1, category: "OTHER" }], steps: [] },
      false,
    ],
    ["分量のキーが無い", { ingredients: [{ name: "塩", category: "OTHER" }], steps: [] }, false],
    [
      "enum に無いカテゴリ",
      { ingredients: [{ name: "塩", amount: null, category: "FRUIT" }], steps: [] },
      false,
    ],
    ["手順が文字列でない", { ingredients: [], steps: [1] }, false],
  ])("%s", async (_label, body, raw) => {
    const { response, body: json } = await call(body, { raw });

    expect(response.status).toBe(400);
    expect(json.error).toEqual({ code: "VALIDATION_ERROR", message: MALFORMED });
    expect(replaceMock).not.toHaveBeenCalled();
  });
});

describe("規則に反する（400・直し方の文言）", () => {
  it("空の材料名は、整えずに送られてきたものとして弾く", async () => {
    const { response, body } = await call({
      ingredients: [{ name: "  ", amount: "少々", category: Category.OTHER }],
      steps: [],
    });

    expect(response.status).toBe(400);
    expect(body.error.message).toBe(EMPTY_NAME_CONTENTS_MESSAGE);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("空の手順を弾く（サーバーでは捨てない）", async () => {
    const { body } = await call({ ingredients: [], steps: [""] });

    expect(body.error.message).toBe(EMPTY_STEP_CONTENTS_MESSAGE);
  });

  it("件数の上限を超えると弾く", async () => {
    const { body } = await call({
      ingredients: [],
      steps: Array.from({ length: MAX_STEPS + 1 }, () => "切る。"),
    });

    expect(body.error.message).toBe(TOO_MANY_STEPS_MESSAGE);
  });
});

describe("想定外の失敗", () => {
  it("Repository が投げたら 500 で、内部の文言を出さない", async () => {
    replaceMock.mockRejectedValue(new Error("connection refused: secret-host"));

    const { response, body } = await call(VALID);

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain("secret-host");
  });
});
