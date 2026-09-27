import { errorResponse, successResponse } from "@/lib/api-response";
import { requireUserId } from "@/lib/auth/session";
import { deleteRecipeImage } from "@/lib/clients/s3";
import { RecipeNotFoundError, ValidationError } from "@/lib/errors";
import {
  contentsProblem,
  isCategory,
  type IngredientInput,
  type RecipeContentsInput,
} from "@/lib/recipes/contents";
import { normalizeTitle, titleProblem } from "@/lib/recipes/title";
import {
  deleteRecipeForUser,
  replaceRecipeContents,
  updateRecipeTitle,
} from "@/lib/repositories/recipe";

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

/**
 * PUT /api/recipes/[id]
 *
 * レシピの材料と手順を、送った内容で**丸ごと置き換える**（recipe-edit requirements.md Req5 /
 * design.md 4.1・5.3）。**送らなかった行は消える。** タイトルは含めない（S-04 の `PATCH` で直す）。
 * **`analyze`（POST）・`PATCH`・`DELETE` に続く4つ目の保護付きエンドポイント。**
 *
 * body: `{ ingredients: [{ name, amount, category }], steps: [text] }`。
 * `order` は送らない。配列の順序がそのまま `order` になる。
 *
 * **空行の除去や前後の空白の整形はしない。** クライアントが `toContentsInput()` で整えてから送る。
 * 空の材料名・空の手順が届いたら 400（整えずに送るクライアントのバグを隠さない。design.md 5.3）。
 */
export async function PUT(request: Request, context: RouteContext<"/api/recipes/[id]">) {
  try {
    // ⚠️ Route Handler の params も Promise（recipe-view 落とし穴 #22）
    const { id } = await context.params;

    // クライアントが送ってきた userId は見ない。**セッションだけが根拠**
    const userId = await requireUserId();

    const contents = await readContents(request);

    const replaced = await replaceRecipeContents(userId, id, contents);

    // 0 は「存在しない」か「他人のもの」。**区別せず 404**（Phase 3 と同じ理由）
    if (replaced === 0) {
      throw new RecipeNotFoundError();
    }

    return successResponse({ id });
  } catch (error) {
    return errorResponse(error);
  }
}

/** 形が違うときの文言。**`PATCH` と同じ固定文言**（どこが違うかは明かさない） */
const MALFORMED_MESSAGE = "リクエストの形式が正しくありません。";

/**
 * body から材料と手順を取り出して検証する。
 *
 * **`unknown` から型を1つずつ確かめる。** キャストで済ませると、配列でない値や
 * 文字列でない材料名がそのまま Prisma まで届き、500 になる（利用者には原因が分からない）。
 * 規則（空・上限・カテゴリ）は `lib/recipes/contents.ts` の `contentsProblem()` が見る。
 * **文言をここに直書きしない**（`readTitle` と同じ流儀）。
 *
 * @throws {ValidationError} JSONでない / 形が違う / 規則に反する
 */
async function readContents(request: Request): Promise<RecipeContentsInput> {
  let body: unknown;

  try {
    body = await request.json();
  } catch (cause) {
    // **cause に隔離する。** パーサの生メッセージを画面に出さない
    throw new ValidationError(MALFORMED_MESSAGE, { cause });
  }

  if (!isRecord(body) || !Array.isArray(body.ingredients) || !Array.isArray(body.steps)) {
    throw new ValidationError(MALFORMED_MESSAGE);
  }

  const ingredients: IngredientInput[] = [];

  for (const item of body.ingredients) {
    const ingredient = readIngredient(item);

    if (ingredient === null) {
      throw new ValidationError(MALFORMED_MESSAGE);
    }

    ingredients.push(ingredient);
  }

  const steps: string[] = [];

  for (const item of body.steps) {
    if (typeof item !== "string") {
      throw new ValidationError(MALFORMED_MESSAGE);
    }

    steps.push(item);
  }

  const contents = { ingredients, steps };
  const problem = contentsProblem(contents);

  if (problem !== null) {
    // **文言は lib/recipes/contents.ts の定数。** 外部入力を混ぜない（lib/errors.ts の注意）
    throw new ValidationError(problem);
  }

  return contents;
}

/**
 * 材料1件を取り出す。形が違えば `null`。
 *
 * **必要な3列だけを新しいオブジェクトに詰め直す。** 送られてきたオブジェクトをそのまま
 * 使うと、余計なキー（`id` や他人の `recipeId`）まで Repository に届く。
 * enum に無いカテゴリは「形が違う」と同じ扱いにする（画面の操作では起きない）。
 */
function readIngredient(item: unknown): IngredientInput | null {
  if (!isRecord(item)) {
    return null;
  }

  const { name, amount, category } = item;

  if (typeof name !== "string") {
    return null;
  }

  // 分量は「無い」を null で表す。**キーが無い（undefined）も受けない**（送り手の形を1つに保つ）
  if (typeof amount !== "string" && amount !== null) {
    return null;
  }

  if (!isCategory(category)) {
    return null;
  }

  return { name, amount, category };
}

/** `typeof null === "object"` と配列を外したオブジェクトの判定 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
