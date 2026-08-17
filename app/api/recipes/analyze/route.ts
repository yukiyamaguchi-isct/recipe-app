import { errorResponse, successResponse } from "@/lib/api-response";
import { requireUserId } from "@/lib/auth/session";
import { ImageTooLargeError, InvalidImageError } from "@/lib/errors";
import { MAX_IMAGE_BYTES } from "@/lib/images/constants";
import { analyzeAndSaveRecipe } from "@/lib/services/recipe-analysis";

/**
 * POST /api/recipes/analyze
 *
 * 写真を1枚受け取り、解析して保存する。**Phase 2 で最初の保護付きエンドポイント。**
 *
 * **ここにビジネスロジックを書かない**（`.kiro/steering/architecture.md`）。
 * 役割は3つだけ: セッションから `userId` を取る、リクエストから画像を取り出す、
 * Service の結果を HTTP に変換する。
 */

/**
 * Vercel の関数実行時間（`REQUIREMENTS.md` 7.1）。
 *
 * SDK のタイムアウトは50秒（design.md 1.4）なので、その外側に置く。
 * **これを削ると Hobby の既定（10秒）に戻り、解析が終わる前に切れる。**
 */
export const maxDuration = 60;

/** フォームのどのフィールドに画像が入っているか。クライアント側と揃える。 */
const IMAGE_FIELD = "image";

export async function POST(request: Request) {
  try {
    // クライアントが送ってきた userId は見ない。**セッションだけが根拠**（requirements.md Req7）。
    // 未ログインなら UnauthorizedError が飛び、errorResponse が 401 に変換する。
    const userId = await requireUserId();

    const image = await readImage(request);

    const { recipeId } = await analyzeAndSaveRecipe({ userId, image });

    // 保存が終わってから返る。**この時点で必ず保存済み**（requirements.md Req4）。
    return successResponse({ recipeId });
  } catch (error) {
    // 型付きエラーを HTTP に変換する唯一の場所（design.md 5.4）。
    // 想定外の例外もここで 500 の固定文言になり、内部情報は漏れない（5.5）。
    return errorResponse(error);
  }
}

/**
 * multipart/form-data から画像を取り出す。
 *
 * **形式とサイズの検証はここでやらない。** `normalizeImage()` が先頭バイトで判定するので、
 * ここで宣言された MIME を見て弾くと二重管理になる（design.md 5.3）。
 * ここが弾くのは「そもそも画像が入っていない」場合だけ。
 *
 * @throws {InvalidImageError} フォームでない / フィールドが無い / 中身が空
 */
async function readImage(request: Request): Promise<Buffer> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch (cause) {
    // Content-Type が multipart/form-data でない、境界が壊れている、など
    throw new InvalidImageError({ cause });
  }

  // ⚠️ `instanceof File` で判定しない。`formData()` が返すのは実行環境の File 実装
  // （Node なら undici の File）で、グローバルの `File` と同一とは限らない。
  // 仕様上 `get()` の戻りは `string | File` なので、**文字列でなければファイル**とみなす。
  const file = form.get(IMAGE_FIELD);
  if (file === null || typeof file === "string") {
    throw new InvalidImageError({
      cause: new Error(`フォームに ${IMAGE_FIELD} フィールドのファイルが無い`),
    });
  }

  // 中身を読む前に、宣言されたサイズで足切りする。10MB を大きく超えるものを
  // Buffer に展開しないため。**`normalizeImage()` も同じ判定をする**が、
  // あちらは実バイト数で見るので、宣言が嘘でも最終的には弾かれる。
  // requirements.md Req2 の「413 相当」に合わせて ImageTooLargeError を投げる。
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ImageTooLargeError({
      cause: new Error(`宣言されたサイズが上限を超えている: ${file.size}`),
    });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength === 0) {
    throw new InvalidImageError({ cause: new Error("ファイルの中身が空") });
  }

  return buffer;
}
