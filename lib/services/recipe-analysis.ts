import { analyzeRecipeImage } from "@/lib/clients/claude";
import { uploadRecipeImage } from "@/lib/clients/s3";
import { normalizeImage } from "@/lib/images/normalize";
import { saveRecipe } from "@/lib/repositories/recipe";

/**
 * 写真1枚を受け取り、レシピとして保存できる状態にするまでの一連の流れ。
 *
 * **この層は HTTP を知らない**（`.kiro/steering/architecture.md`）。
 * `Request` も `Response` もステータスコードも扱わず、失敗は型付きエラーを投げて表す。
 */

export type AnalyzeAndSaveInput = {
  /** **セッションから取った値。** クライアントが送ってきた値を渡してはいけない（Req7） */
  userId: string;
  /** アップロードされた画像。まだ正規化されていない */
  image: Buffer;
};

export type AnalyzeAndSaveResult = {
  recipeId: string;
};

/**
 * 正規化 → 解析 → S3 → 保存。
 *
 * **この順序に意味がある**（design.md 4.1）。S3 を解析の後に置くのは、失敗の頻度が違うため。
 * 解析失敗（文字が読めない・タイムアウト）は日常的に起きるが、S3 の失敗は稀。
 * **頻度の高いほうで後始末が要らない順序**を選んでいる。
 *
 * | 順序               | 解析失敗時                       | S3失敗時               |
 * | ------------------ | -------------------------------- | ---------------------- |
 * | S3 → 解析 → DB     | S3に孤児の画像が残る（要削除）   | 解析前なので損失なし   |
 * | **解析 → S3 → DB** | S3に何も残らない                 | 解析結果を失う         |
 *
 * 保存が終わってから返すので、**呼び出し側が確認画面を出す時点では必ず保存済み**になる
 * （`REQUIREMENTS.md` 4.6 / requirements.md Req4）。
 */
export async function analyzeAndSaveRecipe({
  userId,
  image,
}: AnalyzeAndSaveInput): Promise<AnalyzeAndSaveResult> {
  // 1. サーバー側の最終防衛線。形式・サイズを検証し、長辺2576px / JPEG品質85に揃える
  const normalized = await normalizeImage(image);

  // 2. 最も高価で最も失敗しやすい。ここで失敗したら S3 にも DB にも何も残らない
  const analysis = await analyzeRecipeImage(normalized);

  // 3. 解析が通ってから保存する。元画像ではなく変換後の画像だけを置く
  const imageKey = await uploadRecipeImage(userId, normalized);

  // 4. 確認画面を出す前に保存を終える
  const recipe = await saveRecipe({ userId, imageKey, analysis });

  return { recipeId: recipe.id };
}
