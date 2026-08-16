import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock のファクトリは巻き上げられるため、参照するモックも vi.hoisted で一緒に巻き上げる。
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

// 実体を読むと lib/prisma.ts が評価され、DATABASE_URL が無い環境で落ちる。
// DBを立てずに「どんなクエリを組み立てたか」だけを見る。
vi.mock("@/lib/prisma", () => ({ prisma: { recipe: { create: createMock } } }));

import type { RecipeAnalysis } from "@/lib/clients/claude";
import { saveRecipe } from "@/lib/repositories/recipe";

const ANALYSIS: RecipeAnalysis = {
  isRecipe: true,
  title: "肉じゃが",
  servings: 4,
  ingredients: [
    { name: "じゃがいも", amount: "3個", category: "VEGETABLE" },
    { name: "牛こま切れ肉", amount: "200g", category: "OTHER" },
    { name: "塩", amount: null, category: "SEASONING" },
  ],
  steps: ["じゃがいもを切る", "肉を炒める", "20分煮る"],
};

const INPUT = {
  userId: "clx1a2b3c4d5e6f7g8h9",
  imageKey: "clx1a2b3c4d5e6f7g8h9/8f14e45f-ceea-467a-9575-5b1f5d21ad5c.jpg",
  analysis: ANALYSIS,
};

/** 直近の呼び出しで組み立てられた `data` を取り出す。 */
function lastData() {
  return createMock.mock.calls[0][0].data;
}

beforeEach(() => {
  createMock.mockReset();
  createMock.mockResolvedValue({ id: "recipe_1" });
});

describe("saveRecipe", () => {
  it("作成したレシピを返す", async () => {
    await expect(saveRecipe(INPUT)).resolves.toEqual({ id: "recipe_1" });
  });

  it("1回の create にまとめる（Prisma がネスト書き込みをトランザクションにする）", async () => {
    await saveRecipe(INPUT);

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(lastData().ingredients.create).toHaveLength(3);
    expect(lastData().steps.create).toHaveLength(3);
  });

  it("レシピを引数の userId に紐づける（他人のものにしない）", async () => {
    await saveRecipe(INPUT);

    expect(lastData().userId).toBe(INPUT.userId);
  });

  it("S3 のキーを imageUrl に入れる（design.md 5.6 の暫定）", async () => {
    await saveRecipe(INPUT);

    expect(lastData().imageUrl).toBe(INPUT.imageKey);
  });

  it("タイトルと人数をそのまま保存する", async () => {
    await saveRecipe(INPUT);

    expect(lastData().title).toBe("肉じゃが");
    expect(lastData().servings).toBe(4);
  });

  it("人数が読み取れなかったレシピは servings が null のまま", async () => {
    await saveRecipe({ ...INPUT, analysis: { ...ANALYSIS, servings: null } });

    expect(lastData().servings).toBeNull();
  });
});

describe("順序（design.md 2章）", () => {
  it("材料の order に配列の添字をそのまま入れる", async () => {
    await saveRecipe(INPUT);

    expect(lastData().ingredients.create.map((i: { order: number }) => i.order)).toEqual([0, 1, 2]);
  });

  it("手順の order に配列の添字をそのまま入れる", async () => {
    await saveRecipe(INPUT);

    expect(lastData().steps.create.map((s: { order: number }) => s.order)).toEqual([0, 1, 2]);
  });

  it("材料を Claude が返した順序のまま保つ（並べ替えない）", async () => {
    await saveRecipe(INPUT);

    expect(lastData().ingredients.create.map((i: { name: string }) => i.name)).toEqual([
      "じゃがいも",
      "牛こま切れ肉",
      "塩",
    ]);
  });

  it("手順を原文の順序のまま保つ", async () => {
    await saveRecipe(INPUT);

    expect(lastData().steps.create.map((s: { text: string }) => s.text)).toEqual([
      "じゃがいもを切る",
      "肉を炒める",
      "20分煮る",
    ]);
  });

  it("カテゴリ順に並べ替えたりしない（表示側の仕事）", async () => {
    await saveRecipe(INPUT);

    // 野菜 → その他 → 調味料 の順で来たものが、そのままの順で保存される
    expect(lastData().ingredients.create.map((i: { category: string }) => i.category)).toEqual([
      "VEGETABLE",
      "OTHER",
      "SEASONING",
    ]);
  });
});

describe("材料の中身", () => {
  it("分量をそのままの文字列で保存する（requirements.md Req3）", async () => {
    await saveRecipe({
      ...INPUT,
      analysis: {
        ...ANALYSIS,
        ingredients: [{ name: "こしょう", amount: "少々", category: "SEASONING" }],
      },
    });

    expect(lastData().ingredients.create[0].amount).toBe("少々");
  });

  it("分量が無い材料は amount が null", async () => {
    await saveRecipe(INPUT);

    expect(lastData().ingredients.create[2].amount).toBeNull();
  });

  it("カテゴリをそのまま渡す（付け替えない）", async () => {
    await saveRecipe(INPUT);

    expect(lastData().ingredients.create[0].category).toBe("VEGETABLE");
  });
});

describe("空の解析結果", () => {
  it("材料も手順も空でも保存できる（create に空配列を渡す）", async () => {
    await saveRecipe({ ...INPUT, analysis: { ...ANALYSIS, ingredients: [], steps: [] } });

    expect(lastData().ingredients.create).toEqual([]);
    expect(lastData().steps.create).toEqual([]);
  });
});

describe("この層が知らないこと（.kiro/steering/architecture.md）", () => {
  it("isRecipe を保存しない（解析の判定であってレシピの属性ではない）", async () => {
    await saveRecipe(INPUT);

    expect(lastData()).not.toHaveProperty("isRecipe");
  });

  it("createdAt / updatedAt を自分で入れない（DBの既定に任せる）", async () => {
    await saveRecipe(INPUT);

    expect(lastData()).not.toHaveProperty("createdAt");
    expect(lastData()).not.toHaveProperty("updatedAt");
  });

  it("Prisma の例外を握り潰さずそのまま投げる", async () => {
    const failure = new Error("unique constraint violation");
    createMock.mockRejectedValue(failure);

    await expect(saveRecipe(INPUT)).rejects.toBe(failure);
  });
});
