import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock のファクトリは巻き上げられるため、参照するモックも vi.hoisted で一緒に巻き上げる。
const { findFirstMock } = vi.hoisted(() => ({ findFirstMock: vi.fn() }));

// 実体を読むと lib/prisma.ts が評価され、DATABASE_URL が無い環境で落ちる。
// DBを立てずに「どんなクエリを組み立てたか」だけを見る（recipe-repository.test.ts と同じ流儀）。
vi.mock("@/lib/prisma", () => ({ prisma: { recipe: { findFirst: findFirstMock } } }));

import { findRecipeForUser } from "@/lib/repositories/recipe";

const USER_ID = "clx1a2b3c4d5e6f7g8h9";
const OTHER_USER_ID = "clzzz9y8x7w6v5u4t3s2";
const RECIPE_ID = "clr1a2b3c4d5e6f7g8h9";

/** 直近の呼び出しで組み立てられた引数を取り出す。 */
function lastArgs() {
  return findFirstMock.mock.calls[0][0];
}

const FOUND = {
  id: RECIPE_ID,
  userId: USER_ID,
  title: "肉じゃが",
  imageKey: `${USER_ID}/8f14e45f-ceea-467a-9575-5b1f5d21ad5c.jpg`,
  servings: 4,
  createdAt: new Date("2026-08-24T00:00:00.000Z"),
  updatedAt: new Date("2026-08-24T00:00:00.000Z"),
  ingredients: [
    {
      id: "i1",
      recipeId: RECIPE_ID,
      name: "じゃがいも",
      amount: "3個",
      category: "VEGETABLE",
      order: 0,
    },
    { id: "i2", recipeId: RECIPE_ID, name: "塩", amount: null, category: "SEASONING", order: 1 },
  ],
  steps: [
    { id: "s1", recipeId: RECIPE_ID, order: 0, text: "じゃがいもを切る" },
    { id: "s2", recipeId: RECIPE_ID, order: 1, text: "20分煮る" },
  ],
};

beforeEach(() => {
  findFirstMock.mockReset();
  findFirstMock.mockResolvedValue(FOUND);
});

describe("findRecipeForUser", () => {
  it("見つかったレシピを返す", async () => {
    await expect(findRecipeForUser(USER_ID, RECIPE_ID)).resolves.toEqual(FOUND);
  });

  it("1回のクエリで材料と手順まで取る（画面表示は1秒以内。requirements.md 非機能要件）", async () => {
    await findRecipeForUser(USER_ID, RECIPE_ID);

    expect(findFirstMock).toHaveBeenCalledTimes(1);
    expect(lastArgs().include).toHaveProperty("ingredients");
    expect(lastArgs().include).toHaveProperty("steps");
  });
});

/**
 * **このフェーズで最も重要なテスト群**（design.md 5.1 / 落とし穴 #2）。
 *
 * `where` から userId が落ちても、自分のレシピしか作らないテストは全部通ってしまう。
 * ここだけが所有チェックの防波堤になる。
 */
describe("所有チェック（.kiro/steering/architecture.md「レシピは必ず userId でスコープする」）", () => {
  it("where に userId が入っている（クエリの外で確認しない）", async () => {
    await findRecipeForUser(USER_ID, RECIPE_ID);

    expect(lastArgs().where).toEqual({ id: RECIPE_ID, userId: USER_ID });
  });

  it("他人の userId では null が返る（DBが一致するレコードを返さない）", async () => {
    // 他人のIDでは where が一致しないので、Prisma は null を返す
    findFirstMock.mockResolvedValue(null);

    await expect(findRecipeForUser(OTHER_USER_ID, RECIPE_ID)).resolves.toBeNull();
  });

  it("他人の userId をそのまま where に渡す（呼び出し側の userId を無視しない）", async () => {
    findFirstMock.mockResolvedValue(null);

    await findRecipeForUser(OTHER_USER_ID, RECIPE_ID);

    expect(lastArgs().where.userId).toBe(OTHER_USER_ID);
  });

  it("存在しないIDでは null が返る", async () => {
    findFirstMock.mockResolvedValue(null);

    await expect(findRecipeForUser(USER_ID, "clnotexist0000000000")).resolves.toBeNull();
  });

  it("「存在しない」と「他人のもの」で戻り値が同じ（区別できる情報を返さない。design.md 5.2）", async () => {
    findFirstMock.mockResolvedValue(null);

    const missing = await findRecipeForUser(USER_ID, "clnotexist0000000000");
    const someoneElses = await findRecipeForUser(OTHER_USER_ID, RECIPE_ID);

    expect(missing).toBe(someoneElses);
  });
});

describe("並び順（design.md 1.4 / 落とし穴 #3）", () => {
  it("材料を order の昇順で取る", async () => {
    await findRecipeForUser(USER_ID, RECIPE_ID);

    expect(lastArgs().include.ingredients.orderBy).toEqual({ order: "asc" });
  });

  it("手順を order の昇順で取る", async () => {
    await findRecipeForUser(USER_ID, RECIPE_ID);

    expect(lastArgs().include.steps.orderBy).toEqual({ order: "asc" });
  });

  it("並び順を DB 任せにしない（orderBy を省かない）", async () => {
    await findRecipeForUser(USER_ID, RECIPE_ID);

    // 省くと手元では偶然正しく見えて、行が増えたときに崩れる
    expect(lastArgs().include.ingredients).toHaveProperty("orderBy");
    expect(lastArgs().include.steps).toHaveProperty("orderBy");
  });
});

describe("この層が知らないこと（.kiro/steering/architecture.md）", () => {
  it("Prisma の例外を握り潰さずそのまま投げる", async () => {
    const failure = new Error("connection terminated unexpectedly");
    findFirstMock.mockRejectedValue(failure);

    await expect(findRecipeForUser(USER_ID, RECIPE_ID)).rejects.toBe(failure);
  });

  it("見つからないことを例外にしない（notFound() への変換は画面側の責務）", async () => {
    findFirstMock.mockResolvedValue(null);

    await expect(findRecipeForUser(USER_ID, RECIPE_ID)).resolves.toBeNull();
  });
});
