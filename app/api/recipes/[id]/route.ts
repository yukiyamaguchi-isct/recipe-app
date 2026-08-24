import { errorResponse, successResponse } from "@/lib/api-response";
import { requireUserId } from "@/lib/auth/session";
import { RecipeNotFoundError, ValidationError } from "@/lib/errors";
import { normalizeTitle, titleProblem } from "@/lib/recipes/title";
import { updateRecipeTitle } from "@/lib/repositories/recipe";

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
