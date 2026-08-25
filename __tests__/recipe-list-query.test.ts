import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock のファクトリは巻き上げられるため、参照するモックも vi.hoisted で一緒に巻き上げる。
const { findManyMock } = vi.hoisted(() => ({ findManyMock: vi.fn() }));

// 実体を読むと lib/prisma.ts が評価され、DATABASE_URL が無い環境で落ちる。
// DBを立てずに「どんなクエリを組み立てたか」だけを見る（recipe-find.test.ts と同じ流儀）。
vi.mock("@/lib/prisma", () => ({ prisma: { recipe: { findMany: findManyMock } } }));

import { listRecipesForUser } from "@/lib/repositories/recipe";

const USER_ID = "clx1a2b3c4d5e6f7g8h9";
const OTHER_USER_ID = "clzzz9y8x7w6v5u4t3s2";

/** 直近の呼び出しで組み立てられた引数を取り出す。 */
function lastArgs() {
  return findManyMock.mock.calls[0][0];
}

const MINE_OLD = {
  id: "r1",
  userId: USER_ID,
  title: "肉じゃが",
  imageKey: `${USER_ID}/8f14e45f-ceea-467a-9575-5b1f5d21ad5c.jpg`,
  servings: 4,
  createdAt: new Date("2026-08-20T00:00:00.000Z"),
  updatedAt: new Date("2026-08-20T00:00:00.000Z"),
};

const MINE_NEW = {
  ...MINE_OLD,
  id: "r2",
  title: "カレー",
  createdAt: new Date("2026-08-24T00:00:00.000Z"),
};

const THEIRS = {
  ...MINE_OLD,
  id: "r3",
  userId: OTHER_USER_ID,
  title: "他人のレシピ",
  imageKey: `${OTHER_USER_ID}/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg`,
  createdAt: new Date("2026-08-25T00:00:00.000Z"),
};

const ALL_ROWS = [MINE_OLD, MINE_NEW, THEIRS];

/**
 * **クエリの形を見るだけのモックにしない。**
 *
 * `where` に `userId` があることを assert するだけだと、条件の意味までは担保できない。
 * ここでは渡された `where` / `orderBy` / `select` を**実際に適用する**ので、
 * **`where` から `userId` を落とせば他人のレシピが本当に混ざる。**
 *
 * Phase 3 の反省（Repository をモックすると `where` から `userId` を抜いても全部通る、
 * recipe-view design.md）に対する、この層での手当て。
 */
function fakeFindMany(args: {
  where?: { userId?: string };
  select?: Record<string, boolean>;
  orderBy?: { createdAt?: "asc" | "desc" };
}) {
  let rows = [...ALL_ROWS];

  if (args.where?.userId !== undefined) {
    rows = rows.filter((row) => row.userId === args.where!.userId);
  }

  if (args.orderBy?.createdAt !== undefined) {
    const direction = args.orderBy.createdAt === "desc" ? -1 : 1;
    rows.sort((a, b) => (a.createdAt.getTime() - b.createdAt.getTime()) * direction);
  }

  if (args.select === undefined) {
    return rows;
  }

  const columns = Object.keys(args.select).filter((key) => args.select![key]);
  return rows.map((row) =>
    Object.fromEntries(columns.map((key) => [key, row[key as keyof typeof row]])),
  );
}

beforeEach(() => {
  findManyMock.mockReset();
  findManyMock.mockImplementation(fakeFindMany);
});

describe("listRecipesForUser（recipe-list design.md 5.1）", () => {
  it("where に userId を入れる（クエリの外で所有チェックしない）", async () => {
    await listRecipesForUser(USER_ID);

    expect(lastArgs().where).toEqual({ userId: USER_ID });
  });

  /**
   * ⚠️ 落とし穴 #3。**`where` から `userId` を落としても動いてしまう。**
   *
   * このテストはクエリの形ではなく**結果**を見ている（上の fakeFindMany が
   * 条件を実際に適用する）ので、スコープが外れれば他人のレシピが混ざって落ちる。
   */
  it("他人のレシピが1件も含まれない", async () => {
    const recipes = await listRecipesForUser(USER_ID);

    expect(recipes).toHaveLength(2);
    expect(recipes.map((recipe) => recipe.id)).toEqual(["r2", "r1"]);
    expect(recipes.some((recipe) => recipe.title === "他人のレシピ")).toBe(false);
  });

  it("レシピを持たないユーザーには空配列を返す（null ではない）", async () => {
    const recipes = await listRecipesForUser("clnobody00000000000");

    expect(recipes).toEqual([]);
  });

  it("新しいものが先頭に来る（createdAt の降順）", async () => {
    const recipes = await listRecipesForUser(USER_ID);

    expect(lastArgs().orderBy).toEqual({ createdAt: "desc" });
    expect(recipes[0].title).toBe("カレー");
    expect(recipes[recipes.length - 1].title).toBe("肉じゃが");
  });

  it("カードが使う4列だけを取る", async () => {
    await listRecipesForUser(USER_ID);

    expect(lastArgs().select).toEqual({
      id: true,
      title: true,
      imageKey: true,
      createdAt: true,
    });
  });

  /**
   * カードに出すのはサムネイル・タイトル・作成日だけ（design.md 1.5）。
   * `include` で材料と手順まで引くと、**動くので気づかないまま**
   * カードに使わない行を運び続けることになる（落とし穴 #5）。
   */
  it("材料と手順を引かない", async () => {
    const recipes = await listRecipesForUser(USER_ID);

    expect(lastArgs()).not.toHaveProperty("include");
    expect(recipes[0]).not.toHaveProperty("ingredients");
    expect(recipes[0]).not.toHaveProperty("steps");
  });

  it("imageKey はキーのまま返す（URLではない）", async () => {
    const recipes = await listRecipesForUser(USER_ID);

    expect(recipes[0].imageKey).toMatch(/^clx1a2b3c4d5e6f7g8h9\/.+\.jpg$/);
    expect(recipes[0].imageKey).not.toMatch(/^https?:/);
    // 署名付きURLをDBに持たない（design.md 落とし穴 #2）
    expect(recipes[0].imageKey).not.toContain("X-Amz-Signature");
  });

  it("createdAt は Date のまま返す（整形は lib/recipes/date.ts の責務）", async () => {
    const recipes = await listRecipesForUser(USER_ID);

    expect(recipes[0].createdAt).toBeInstanceOf(Date);
  });
});
