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

/**
 * タイトルを変更する。**他人のレシピは更新されない。**
 *
 * 更新できた件数を返す。**0 なら「存在しない」か「他人のもの」**（呼び出し側は区別しない）。
 *
 * **`update` ではなく `updateMany` を使う。**
 *
 * Prisma 7 の `update` は `where` に非一意フィールドも受ける
 * （`RecipeWhereUniqueInput` が `AtLeast<{...}, "id">` なので `userId` を足せる）ので、
 * `update({ where: { id, userId } })` でも所有チェックは効く。**それでも updateMany を選んだ**:
 *
 * - `update` は一致しないと例外（`P2025`）を投げる。**「見つからない」の判定が
 *   Prisma のエラーコードという実行時の詳細に依存する**
 * - `updateMany` は件数を返すだけ。**テストしやすく、コードが変わっても壊れにくい**
 *
 * **見分け方**: 他人の userId で呼んで戻り値が 0 になること。1 が返ったらスコープが外れている。
 */
export async function updateRecipeTitle(
  userId: string,
  recipeId: string,
  title: string,
): Promise<number> {
  const result = await prisma.recipe.updateMany({
    // ⚠️ userId を where に入れるのが唯一の所有チェック（design.md 落とし穴 #19）。
    // 落としても自分のレシピしか作らないテストは全部通ってしまう。
    where: { id: recipeId, userId },
    data: { title },
  });

  return result.count;
}

// ---- Phase 4: recipe-list ----

/**
 * 一覧のカード（S-02）が使う列だけ。
 *
 * **材料と手順を持たない。** カードに出すのはサムネイル・タイトル・作成日だけで
 * （引き継ぎ資料「レシピカード」）、10件のレシピに材料8件・手順6件が付くと
 * **カードに使わない140行を運ぶことになる**（recipe-list design.md 1.5）。
 */
export type RecipeListItem = {
  id: string;
  title: string;
  /** S3 のオブジェクトキー。**URLではない。** 表示用URLは参照時に署名付きで発行する */
  imageKey: string;
  /**
   * **`Date` のまま返す。** 表示用の整形は `lib/recipes/date.ts` の責務で、
   * この層は Prisma だけを知る（`.kiro/steering/architecture.md`）。
   * **Client Component へ渡す前に文字列にすること**（design.md 落とし穴 #12）。
   */
  createdAt: Date;
};

/**
 * userId でスコープした一覧の取得。**他人のレシピは1件も含まれない。**
 *
 * **`where` に `userId` を入れるのが唯一のスコープ**（`.kiro/steering/architecture.md`
 * 「レシピは必ず userId でスコープする」）。**落としても動いてしまい、
 * 1人分しかレシピを作らないテストでは気づけない**（design.md 落とし穴 #3）。
 *
 * **見分け方**: 2人分のレシピを作り、片方の userId で呼んで
 * **もう片方が1件も返らない**こと。返ったらスコープが外れている。
 *
 * **`orderBy` を省かない。** 並び順が DB 依存になり、**手元では偶然新しい順に見える**
 * （Phase 3 の落とし穴 #3 と同じ形）。
 */
export async function listRecipesForUser(userId: string): Promise<RecipeListItem[]> {
  return prisma.recipe.findMany({
    // ⚠️ ここが唯一の所有チェック（design.md 落とし穴 #3）
    where: { userId },
    // include ではなく select。カードに使わない材料・手順を運ばない（design.md 1.5）
    select: { id: true, title: true, imageKey: true, createdAt: true },
    // 新しいものが先頭。直前に撮ったレシピが一番上に来る（requirements.md Req1）
    orderBy: { createdAt: "desc" },
  });
}

/**
 * 削除の結果。`imageKey` は S3 の後片付けに使う。**消せなかったときは `null`。**
 *
 * 件数（`number`）ではなく `imageKey` を返すのは、**呼び出し側が S3 を消すのに要る**ため。
 */
export type DeletedRecipe = { imageKey: string } | null;

/**
 * レシピを削除する。**他人のレシピは消えない。**
 *
 * **⚠️ 消す前に `imageKey` を読む。** 消した後では取れず、**S3 の画像を後片付けできなくなる**
 * （recipe-list design.md 落とし穴 #10）。だから `deleteMany` 一発ではなく、取得 → 削除の2手にする。
 *
 * **`delete({ where: { id } })` を使わない。** 所有チェックがクエリの外に出ると、
 * 書き忘れても動いてしまい、自分のレシピしか作らないテストでは全部通ってしまう
 * （落とし穴 #9 / recipe-view の `updateRecipeTitle` と同じ形）。
 *
 * `Ingredient` / `Step` は `onDelete: Cascade` なので **DB 側が消す**（design.md 2章）。
 * **アプリ側で先に消す必要はない。**
 *
 * **見分け方**: 他人の userId で呼んで `null` が返ること。オブジェクトが返ったらスコープが外れている。
 */
export async function deleteRecipeForUser(
  userId: string,
  recipeId: string,
): Promise<DeletedRecipe> {
  // ⚠️ userId を where に入れるのが所有チェックの本体（落とし穴 #9）
  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, userId },
    select: { imageKey: true },
  });

  if (recipe === null) {
    return null;
  }

  // ここでも userId を落とさない。**where を1箇所だけ緩める癖を作らない**
  const result = await prisma.recipe.deleteMany({ where: { id: recipeId, userId } });

  // 取得と削除の間に消えていた場合（二重送信など）はここが 0 になる。
  // 呼び出し側からは「見つからない」と同じ扱いでよい
  return result.count === 0 ? null : { imageKey: recipe.imageKey };
}
