import { beforeEach, describe, expect, it, vi } from "vitest";

import { Category } from "@/generated/prisma/enums";
import type { RecipeContentsInput } from "@/lib/recipes/contents";

// vi.mock のファクトリは巻き上げられるため、参照するモックも vi.hoisted で一緒に巻き上げる。
const { transactionMock } = vi.hoisted(() => ({ transactionMock: vi.fn() }));

// 実体を読むと lib/prisma.ts が評価され、DATABASE_URL が無い環境で落ちる。
// **prisma 直下には $transaction しか置かない。** トランザクションの外で
// クエリを投げたら「関数が無い」で落ちるので、全部が tx 経由であることも担保できる。
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: transactionMock } }));

import { replaceRecipeContents } from "@/lib/repositories/recipe";

const USER_ID = "clx1a2b3c4d5e6f7g8h9";
const OTHER_USER_ID = "clzzz9y8x7w6v5u4t3s2";
const MY_RECIPE = "clr1a2b3c4d5e6f7g8h9";
const THEIR_RECIPE = "clrzzz9y8x7w6v5u4t3s";

type RecipeRow = { id: string; userId: string; updatedAt: Date };
type IngredientRow = {
  id: string;
  recipeId: string;
  name: string;
  amount: string | null;
  category: Category;
  order: number;
};
type StepRow = { id: string; recipeId: string; text: string; order: number };

const OLD_DATE = new Date("2026-08-20T00:00:00.000Z");

/**
 * **クエリの形を見るだけのモックにしない**（recipe-list-query.test.ts の `fakeFindMany` と同じ考え方）。
 *
 * 渡された `where` を**実際に適用する**偽の DB。`updateMany` の `where` から `userId` を
 * 落とせば、**他人のレシピが本当に書き換わる**ので、結果を見るテストが落ちる。
 *
 * ロールバックは再現しない。**それは Postgres と Prisma の責務**（design.md 8章）。
 */
let db: { recipes: RecipeRow[]; ingredients: IngredientRow[]; steps: StepRow[] };
let seq = 0;

function seed() {
  seq = 0;
  db = {
    recipes: [
      { id: MY_RECIPE, userId: USER_ID, updatedAt: OLD_DATE },
      { id: THEIR_RECIPE, userId: OTHER_USER_ID, updatedAt: OLD_DATE },
    ],
    ingredients: [
      {
        id: "i1",
        recipeId: MY_RECIPE,
        name: "にんじん",
        amount: "1本",
        category: Category.VEGETABLE,
        order: 0,
      },
      {
        id: "i2",
        recipeId: MY_RECIPE,
        name: "しょうゆ",
        amount: "大さじ2",
        category: Category.SEASONING,
        order: 1,
      },
      {
        id: "i3",
        recipeId: THEIR_RECIPE,
        name: "他人の材料",
        amount: null,
        category: Category.OTHER,
        order: 0,
      },
    ],
    steps: [
      { id: "s1", recipeId: MY_RECIPE, text: "切る。", order: 0 },
      { id: "s2", recipeId: THEIR_RECIPE, text: "他人の手順", order: 0 },
    ],
  };
}

const tx = {
  recipe: {
    updateMany: vi.fn(
      async (args: { where: { id?: string; userId?: string }; data: { updatedAt?: Date } }) => {
        const hits = db.recipes.filter(
          (row) =>
            (args.where.id === undefined || row.id === args.where.id) &&
            (args.where.userId === undefined || row.userId === args.where.userId),
        );
        for (const row of hits) {
          Object.assign(row, args.data);
        }
        return { count: hits.length };
      },
    ),
  },
  ingredient: {
    deleteMany: vi.fn(async (args: { where: { recipeId?: string } }) => {
      const before = db.ingredients.length;
      db.ingredients = db.ingredients.filter((row) => row.recipeId !== args.where.recipeId);
      return { count: before - db.ingredients.length };
    }),
    createMany: vi.fn(async (args: { data: Omit<IngredientRow, "id">[] }) => {
      db.ingredients.push(...args.data.map((row) => ({ id: `new-i${++seq}`, ...row })));
      return { count: args.data.length };
    }),
  },
  step: {
    deleteMany: vi.fn(async (args: { where: { recipeId?: string } }) => {
      const before = db.steps.length;
      db.steps = db.steps.filter((row) => row.recipeId !== args.where.recipeId);
      return { count: before - db.steps.length };
    }),
    createMany: vi.fn(async (args: { data: Omit<StepRow, "id">[] }) => {
      db.steps.push(...args.data.map((row) => ({ id: `new-s${++seq}`, ...row })));
      return { count: args.data.length };
    }),
  },
};

const CONTENTS: RecipeContentsInput = {
  ingredients: [
    { name: "玉ねぎ", amount: "1/2個", category: Category.VEGETABLE },
    { name: "塩", amount: null, category: Category.SEASONING },
    { name: "鶏もも肉", amount: "300g", category: Category.OTHER },
  ],
  steps: ["玉ねぎを切る。", "炒める。\n塩で味を調える。"],
};

/**
 * 自分のレシピの行を order 順に並べ、**id を落として**比べやすくする。
 * id は保存のたびに振り直される（design.md 1.7）ので、比べる意味が無い。
 */
function mine<T extends { recipeId: string; id: string; order: number }>(rows: T[]) {
  return rows
    .filter((row) => row.recipeId === MY_RECIPE)
    .sort((a, b) => a.order - b.order)
    .map((row) => {
      const copy: Partial<T> = { ...row };
      delete copy.id;
      return copy;
    });
}

beforeEach(() => {
  seed();
  vi.clearAllMocks();
  transactionMock.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
});

describe("replaceRecipeContents", () => {
  it("自分のレシピなら 1 を返し、材料と手順が送った内容に置き換わる", async () => {
    await expect(replaceRecipeContents(USER_ID, MY_RECIPE, CONTENTS)).resolves.toBe(1);

    expect(mine(db.ingredients)).toEqual([
      {
        recipeId: MY_RECIPE,
        name: "玉ねぎ",
        amount: "1/2個",
        category: Category.VEGETABLE,
        order: 0,
      },
      { recipeId: MY_RECIPE, name: "塩", amount: null, category: Category.SEASONING, order: 1 },
      { recipeId: MY_RECIPE, name: "鶏もも肉", amount: "300g", category: Category.OTHER, order: 2 },
    ]);
    expect(mine(db.steps)).toEqual([
      { recipeId: MY_RECIPE, text: "玉ねぎを切る。", order: 0 },
      { recipeId: MY_RECIPE, text: "炒める。\n塩で味を調える。", order: 1 },
    ]);
  });

  it("**他人の材料・手順は1行も変わらない**（自分のレシピを保存したとき）", async () => {
    await replaceRecipeContents(USER_ID, MY_RECIPE, CONTENTS);

    expect(db.ingredients.filter((row) => row.recipeId === THEIR_RECIPE)).toEqual([
      {
        id: "i3",
        recipeId: THEIR_RECIPE,
        name: "他人の材料",
        amount: null,
        category: Category.OTHER,
        order: 0,
      },
    ]);
    expect(db.steps.filter((row) => row.recipeId === THEIR_RECIPE)).toEqual([
      { id: "s2", recipeId: THEIR_RECIPE, text: "他人の手順", order: 0 },
    ]);
  });

  it("**他人のレシピIDなら 0 を返し、そのレシピの材料・手順が1行も変わらない**", async () => {
    const snapshot = structuredClone(db);

    await expect(replaceRecipeContents(USER_ID, THEIR_RECIPE, CONTENTS)).resolves.toBe(0);

    expect(db).toEqual(snapshot);
  });

  it("存在しないIDなら 0 を返し、何も消さない", async () => {
    const snapshot = structuredClone(db);

    await expect(replaceRecipeContents(USER_ID, "clnotexist0000000000", CONTENTS)).resolves.toBe(0);

    expect(db).toEqual(snapshot);
    expect(tx.ingredient.deleteMany).not.toHaveBeenCalled();
    expect(tx.step.deleteMany).not.toHaveBeenCalled();
  });

  it("所有チェックは userId を where に入れた updateMany で行う", async () => {
    await replaceRecipeContents(USER_ID, MY_RECIPE, CONTENTS);

    expect(tx.recipe.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: MY_RECIPE, userId: USER_ID } }),
    );
  });

  it("レシピの updatedAt を進める（材料だけ変えても @updatedAt は動かないため）", async () => {
    await replaceRecipeContents(USER_ID, MY_RECIPE, CONTENTS);

    const updated = db.recipes.find((row) => row.id === MY_RECIPE)!;
    expect(updated.updatedAt.getTime()).toBeGreaterThan(OLD_DATE.getTime());
  });

  it("所有を確かめてから消す（updateMany が deleteMany より先）", async () => {
    await replaceRecipeContents(USER_ID, MY_RECIPE, CONTENTS);

    const ownedAt = tx.recipe.updateMany.mock.invocationCallOrder[0];
    expect(tx.ingredient.deleteMany.mock.invocationCallOrder[0]).toBeGreaterThan(ownedAt);
    expect(tx.step.deleteMany.mock.invocationCallOrder[0]).toBeGreaterThan(ownedAt);
  });

  it("**すべてのクエリが1つのトランザクションの中で走る**", async () => {
    await replaceRecipeContents(USER_ID, MY_RECIPE, CONTENTS);

    // prisma 直下には $transaction しか無いので、外で投げていたら TypeError で落ちている
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(tx.ingredient.createMany).toHaveBeenCalledTimes(1);
    expect(tx.step.createMany).toHaveBeenCalledTimes(1);
  });

  it("材料0件・手順0件なら、消すだけで createMany を呼ばない（落とし穴 #N11）", async () => {
    await expect(
      replaceRecipeContents(USER_ID, MY_RECIPE, { ingredients: [], steps: [] }),
    ).resolves.toBe(1);

    expect(mine(db.ingredients)).toEqual([]);
    expect(mine(db.steps)).toEqual([]);
    expect(tx.ingredient.createMany).not.toHaveBeenCalled();
    expect(tx.step.createMany).not.toHaveBeenCalled();
  });

  it("材料の列は name / amount / category / order / recipeId だけを書く（余計なキーを通さない）", async () => {
    const withExtra = {
      ingredients: [{ ...CONTENTS.ingredients[0], id: "forged", recipeId: THEIR_RECIPE }],
      steps: [],
    } as unknown as RecipeContentsInput;

    await replaceRecipeContents(USER_ID, MY_RECIPE, withExtra);

    expect(tx.ingredient.createMany.mock.calls[0][0].data).toEqual([
      {
        recipeId: MY_RECIPE,
        name: "玉ねぎ",
        amount: "1/2個",
        category: Category.VEGETABLE,
        order: 0,
      },
    ]);
  });

  it("途中のクエリが失敗したら例外をそのまま投げる（握り潰さない）", async () => {
    tx.step.createMany.mockRejectedValueOnce(new Error("db down"));

    await expect(replaceRecipeContents(USER_ID, MY_RECIPE, CONTENTS)).rejects.toThrow("db down");
  });
});
