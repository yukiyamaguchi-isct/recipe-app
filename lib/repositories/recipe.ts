import type { Recipe } from "@/generated/prisma/client";
import type { RecipeAnalysis } from "@/lib/clients/claude";
import { prisma } from "@/lib/prisma";

/**
 * レシピの保存。
 *
 * **この層は Prisma だけを知る**（`.kiro/steering/architecture.md`）。
 * セッションも HTTP も知らないので、`userId` は引数で受け取る。
 */

export type SaveRecipeInput = {
  /** **呼び出し側がセッションから取る。** ここでは検証しない（Route Handler の責務） */
  userId: string;
  /** S3 のオブジェクトキー（`lib/clients/s3.ts`）。URLではない（design.md 5.6） */
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
      imageUrl: imageKey,
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
