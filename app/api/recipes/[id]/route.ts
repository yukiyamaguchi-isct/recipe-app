import { errorResponse, successResponse } from "@/lib/api-response";
import { requireUserId } from "@/lib/auth/session";
import { deleteRecipeImage } from "@/lib/clients/s3";
import { RecipeNotFoundError, ValidationError } from "@/lib/errors";
import { normalizeTitle, titleProblem } from "@/lib/recipes/title";
import { deleteRecipeForUser, updateRecipeTitle } from "@/lib/repositories/recipe";

/**
 * PATCH /api/recipes/[id]
 *
 * レシピのタイトルを変更する（requirements.md Req7）。
 * **`app/api/recipes/analyze/route.ts` に続く2つ目の保護付きエンドポイント。**
 *
 * **ここにビジネスロジックを書かない**（`.kiro/steering/architecture.md`）。
 * 役割は3つだけ: セッションから `userId` を取る、body を検証する、
 * Repository の結果を HTTP に変換する。
 *
 * Service 層は置かない。検証と保存以外にやることが無いため（design.md 3章）。
 */

/** リクエストボディのフィールド名。クライアント側と揃える。 */
const TITLE_FIELD = "title";

export async function PATCH(request: Request, context: RouteContext<"/api/recipes/[id]">) {
  try {
    // ⚠️ Route Handler の params も Promise（design.md 1.2 / 落とし穴 #22）。
    // await を忘れると型は通り、実行時に undefined が Repository へ渡る
    const { id } = await context.params;

    // クライアントが送ってきた userId は見ない。**セッションだけが根拠**。
    // 未ログインなら UnauthorizedError が飛び、errorResponse が 401 に変換する。
    // **画面側と違い、ここでは requireUserId() が正しい**（design.md 落とし穴 #5）
    const userId = await requireUserId();

    const title = await readTitle(request);

    const updated = await updateRecipeTitle(userId, id, title);

    // 0 件は「存在しない」か「他人のもの」。**区別せず 404**（design.md 5.2）。
    // 出し分けると、IDを総当たりして他人のレシピの存在を確かめられる
    if (updated === 0) {
      throw new RecipeNotFoundError();
    }

    return successResponse({ title });
  } catch (error) {
    // 型付きエラーを HTTP に変換する唯一の場所。
    // 想定外の例外もここで 500 の固定文言になり、内部情報は漏れない
    return errorResponse(error);
  }
}

/**
 * body からタイトルを取り出して検証する。
 *
 * **検証の規則は `lib/recipes/title.ts` に置いてある。** 段階10 のクライアント側も
 * 同じものを使う。**文言をここに直書きしない**（`.kiro/specs/recipe-analysis/design.md` 落とし穴 #27）。
 *
 * @throws {ValidationError} JSONでない / フィールドが無い / 空 / 長すぎる
 */
async function readTitle(request: Request): Promise<string> {
  let body: unknown;

  try {
    body = await request.json();
  } catch (cause) {
    // Content-Type が違う、JSON が壊れている、body が空、など。
    // **cause に隔離する。** パーサの生メッセージを画面に出さない（design.md 5.5）
    throw new ValidationError("リクエストの形式が正しくありません。", { cause });
  }

  // typeof null === "object" なので null を先に外す
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("リクエストの形式が正しくありません。");
  }

  const raw = (body as Record<string, unknown>)[TITLE_FIELD];

  if (typeof raw !== "string") {
    throw new ValidationError("リクエストの形式が正しくありません。");
  }

  const title = normalizeTitle(raw);
  const problem = titleProblem(title);

  if (problem !== null) {
    // **文言は lib/recipes/title.ts のもの。** 外部入力を混ぜない（lib/errors.ts の注意）
    throw new ValidationError(problem);
  }

  return title;
}

/**
 * DELETE /api/recipes/[id]
 *
 * レシピを削除する（recipe-list requirements.md Req5）。
 * **`analyze`（POST）・上の `PATCH` に続く3つ目の保護付きエンドポイント。**
 *
 * **順序は DB → S3。逆にしない**（recipe-list design.md 5.3 / 落とし穴 #7）。
 * 逆にすると、S3 の削除が成功して DB が失敗したときに**画像の無いレシピが
 * ユーザーに残る**。一覧に壊れたカードが出続け、もう一度消すしか直せない。
 * DB を先に消せば、失敗して残るのは**ユーザーには見えない S3 の孤児**だけになる。
 */
export async function DELETE(_request: Request, context: RouteContext<"/api/recipes/[id]">) {
  try {
    // ⚠️ Route Handler の params も Promise（落とし穴 #23）
    const { id } = await context.params;

    // クライアントが送ってきた userId は見ない。**セッションだけが根拠**
    const userId = await requireUserId();

    const deleted = await deleteRecipeForUser(userId, id);

    // null は「存在しない」か「他人のもの」。**区別せず 404**（Phase 3 と同じ理由）。
    // 出し分けると、IDを総当たりして他人のレシピの存在を確かめられる
    if (deleted === null) {
      throw new RecipeNotFoundError();
    }

    // **DB の後。** ここで失敗してもレシピは消えているので、リクエストは成功で返す。
    //
    // ⚠️ `deleteRecipeImage()` 自身が「投げない」契約だが、**その契約に寄りかからない。**
    // 契約が破れると 500 が返り、ユーザーは再試行して 404 を見ることになる（落とし穴 #8）。
    // **「S3 の失敗で 200 を崩さない」のはこのエンドポイントの要件**なので、ここで担保する。
    try {
      await deleteRecipeImage(deleted.imageKey);
    } catch (cause) {
      // 通常ここには来ない（来たら s3.ts 側の契約違反）。**握り潰さずログに残す**
      console.error("[api] 画像の削除で想定外の例外", { recipeId: id, cause });
    }

    return successResponse({ id });
  } catch (error) {
    return errorResponse(error);
  }
}
