import type { Ingredient, Recipe, Step } from "@/generated/prisma/client";
import type { RecipeAnalysis } from "@/lib/clients/claude";
import { prisma } from "@/lib/prisma";

/**
 * レシピの保存と取得。
 *
 * **この層は Prisma だけを知る**（`.kiro/steering/architecture.md`）。
 * セッションも HTTP も知らないので、`userId` は引数で受け取る。
 */

export type SaveRecipeInput = {
  /** **呼び出し側がセッションから取る。** ここでは検証しない（Route Handler の責務） */
  userId: string;
  /** S3 のオブジェクトキー（`lib/clients/s3.ts`）。**URLではない**（design.md 5.6） */
  imageKey: string;
  analysis: RecipeAnalysis;
};

/**
 * 解析結果を Recipe / Ingredient / Step として保存する。
 *
 * **ネスト書き込みは Prisma が1トランザクションにまとめる。** 明示的な `$transaction` は不要で、
 * 材料の途中で失敗してレシピだけが残る、という状態にはならない。
 *
 * `order` には配列の添字をそのまま入れる（design.md 2章）。**Claude が返した順序が原文の順序**で、
 * 材料は買い物のときに、手順は調理のときに、その順で読むことになる。
 */
export async function saveRecipe({ userId, imageKey, analysis }: SaveRecipeInput): Promise<Recipe> {
  return prisma.recipe.create({
    data: {
      userId,
      title: analysis.title,
      imageKey,
      servings: analysis.servings,
      ingredients: {
        create: analysis.ingredients.map((ingredient, index) => ({
          name: ingredient.name,
          amount: ingredient.amount,
          category: ingredient.category,
          order: index,
        })),
      },
      steps: {
        create: analysis.steps.map((text, index) => ({
          text,
          order: index,
        })),
      },
    },
  });
}

/** 画面（S-04 / S-04c）が必要とする形。材料と手順を `order` の昇順で持つ。 */
export type RecipeWithDetails = Recipe & {
  ingredients: Ingredient[];
  steps: Step[];
};

/**
 * レシピ1件を取得する。**他人のレシピは null になる。**
 *
 * `where` に `userId` を入れるのが要点（`.kiro/steering/architecture.md` の
 * 「レシピは必ず userId でスコープする」）。
 *
 * **`findUnique({ where: { id } })` で取ってから `recipe.userId === userId` を
 * 確認する形にしない。** 所有チェックがクエリの外に出ると、書き忘れても動いてしまい、
 * 自分のレシピしか作らないテストでは全部通ってしまう（design.md 落とし穴 #2）。
 *
 * `findUnique` ではなく `findFirst` なのは、`{ id, userId }` が一意制約ではないため。
 * `findUnique` は主キーか一意制約でしか引けない。
 *
 * **見分け方**: 別ユーザーの userId で呼んで null が返ること。レコードが返ったら
 * スコープが外れている。
 */
export async function findRecipeForUser(
  userId: string,
  recipeId: string,
): Promise<RecipeWithDetails | null> {
  return prisma.recipe.findFirst({
    where: { id: recipeId, userId },
    include: {
      // order は Claude が返した配列の添字で、原文の順序そのもの（design.md 2章）。
      // 指定しないと DB が返す順序に依存し、手元では偶然正しく見えて後で崩れる。
      // 📄 出典: generated/prisma/models/Recipe.ts L1683（Recipe$ingredientsArgs.orderBy）
      ingredients: { orderBy: { order: "asc" } },
      steps: { orderBy: { order: "asc" } },
    },
  });
}
