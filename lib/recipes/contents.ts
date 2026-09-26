/**
 * レシピの材料と手順の、下書き → 保存形の変換と検証（recipe-edit design.md 5.1）。
 *
 * **サーバーとクライアントの両方から使う。** 編集画面（S-05）は保存前の整形と
 * 欄ごとの案内に、`PUT /api/recipes/[id]` は検証に使う。
 * **規則と文言を二重に書かない**（`lib/recipes/title.ts` と同じ位置づけ）。
 *
 * **このファイルはサーバー専用の依存を持たない。** `Category` の値は
 * `@/generated/prisma/enums` から取る。`@/generated/prisma/client` から値を取ると
 * Prisma のランタイムがブラウザ向けバンドルに入り、ビルドが落ちる（recipe-view 落とし穴 #27）。
 */
import { Category } from "@/generated/prisma/enums";

/** 画面が持つ材料の下書き。**入力欄の文字列そのまま**（空白も空文字も残っている） */
export type IngredientDraft = {
  /** React の key。保存済みの行は DB の id、追加した行はクライアントで振る */
  key: string;
  name: string;
  /**
   * 入力欄の文字列。**null ではなく空文字で持つ。** `<input value>` に null を渡すと
   * React が制御/非制御の切り替えを警告する（design.md 落とし穴 #N16）
   */
  amount: string;
  category: Category;
};

/** 画面が持つ手順の下書き。 */
export type StepDraft = { key: string; text: string };

/** API に送り、DB に書く材料の形。**`order` は持たない**（配列の添字が order になる） */
export type IngredientInput = { name: string; amount: string | null; category: Category };

/** API に送り、DB に書く形。`PUT` はこれで材料と手順を丸ごと置き換える（design.md 4.1） */
export type RecipeContentsInput = { ingredients: IngredientInput[]; steps: string[] };

/**
 * 追加した行のカテゴリ（design.md 4.4）。
 *
 * 迷ったときの置き場所。野菜・調味料を既定にすると、分類を誤ったまま保存されやすい。
 */
export const NEW_INGREDIENT_CATEGORY: Category = Category.OTHER;

// ---- 上限 ----
//
// ⚠️ **どれも根拠のある数値ではない**（`MAX_TITLE_LENGTH` と同じ扱い。design.md 5.1）。
// DB は Postgres の text で無制限。**無制限の配列・文字列を受け取らないための柵**として置いた。
// 実データを見て決め直してよい。

export const MAX_INGREDIENTS = 100;
export const MAX_STEPS = 50;
export const MAX_INGREDIENT_NAME_LENGTH = 100;
/** 分量欄は幅96px。「大さじ1と1/2（約22g）」程度で足りる */
export const MAX_AMOUNT_LENGTH = 50;
export const MAX_STEP_LENGTH = 1000;

// ---- 文言 ----
//
// ⚠️ **`ValidationError` に渡してよいのはここの定数だけ**（recipe-view design.md 5.6）。
// 外部入力やライブラリの例外メッセージを混ぜない。

/** 欄ごとのエラー表示の補助文。📄 引き継ぎ資料 README「フォーム入力」のエラー時 */
export const EMPTY_FIELD_MESSAGE = "未入力";

export const TOO_LONG_NAME_MESSAGE = `${MAX_INGREDIENT_NAME_LENGTH}文字以内`;
export const TOO_LONG_AMOUNT_MESSAGE = `${MAX_AMOUNT_LENGTH}文字以内`;
export const TOO_LONG_STEP_MESSAGE = `${MAX_STEP_LENGTH}文字以内`;

export const TOO_MANY_INGREDIENTS_MESSAGE = `材料は${MAX_INGREDIENTS}件以内にしてください。`;
export const TOO_MANY_STEPS_MESSAGE = `手順は${MAX_STEPS}件以内にしてください。`;
export const EMPTY_NAME_CONTENTS_MESSAGE =
  "材料名が入力されていない行があります。材料名を入力するか、その行を削除してください。";
export const TOO_LONG_NAME_CONTENTS_MESSAGE = `材料名は${MAX_INGREDIENT_NAME_LENGTH}文字以内で入力してください。`;
export const TOO_LONG_AMOUNT_CONTENTS_MESSAGE = `分量は${MAX_AMOUNT_LENGTH}文字以内で入力してください。`;
export const INVALID_CATEGORY_MESSAGE =
  "カテゴリの指定が正しくありません。もう一度お試しください。";
export const EMPTY_STEP_CONTENTS_MESSAGE =
  "内容が入力されていない手順があります。本文を入力するか、その手順を削除してください。";
export const TOO_LONG_STEP_CONTENTS_MESSAGE = `手順は1つあたり${MAX_STEP_LENGTH}文字以内で入力してください。`;

/**
 * 文字数を数える。**`length` ではなくコードポイントで数える。**
 *
 * `"🍳".length` は 2（サロゲートペア）で、`length` で弾くと絵文字入りの文字列が
 * 半分の長さで引っかかる。書記素単位ではない割り切りは `lib/recipes/title.ts` と同じ。
 */
function countChars(text: string): number {
  return [...text].length;
}

/**
 * enum の値のどれかか。
 *
 * **タブの並びには使わない**（recipe-view 落とし穴 #6）。所属の確認にだけ使う。
 */
export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (Object.values(Category) as string[]).includes(value);
}

/**
 * 全欄が空か。**カテゴリは見ない**（design.md 4.4 / 落とし穴 #N6）。
 *
 * プルダウンは常に何かが選ばれているので、カテゴリを含めると空の行が存在しなくなり、
 * 「＋ 行を追加」を押して使わなかった行で保存が止まる。
 */
export function isBlankIngredient(draft: IngredientDraft): boolean {
  return draft.name.trim() === "" && draft.amount.trim() === "";
}

/**
 * 下書きを保存形に変える（design.md 5.1）。
 *
 * - **全欄が空の材料行・空の手順を捨てる**（design.md 4.4）
 * - 前後の空白を落とす。**中の空白と改行は触らない**（手順の改行は保つ）
 * - 分量の空文字は `null` にする
 *
 * **検証はしない。** 材料名だけ空の行も残る。検証は `ingredientNameProblem` / `contentsProblem`。
 * 「変更があるか」の比較にも使う（design.md 5.5）ので、**例外を投げない純粋な変換**に保つ。
 */
export function toContentsInput(
  ingredients: readonly IngredientDraft[],
  steps: readonly StepDraft[],
): RecipeContentsInput {
  return {
    ingredients: ingredients
      .filter((draft) => !isBlankIngredient(draft))
      .map((draft) => {
        const amount = draft.amount.trim();
        return {
          name: draft.name.trim(),
          amount: amount === "" ? null : amount,
          category: draft.category,
        };
      }),
    steps: steps.map((step) => step.text.trim()).filter((text) => text !== ""),
  };
}

// ---- クライアント: 欄ごとの案内 ----
//
// **例外を投げず、文言か null を返す**（`titleProblem()` と同じ）。入力のたびに例外を作らない。

/**
 * 材料名の欄に出す文言。
 *
 * **全欄が空の行は問題にしない。** 保存時に捨てられる（design.md 4.4）。
 * 材料名だけが空（分量はある）なら「未入力」。
 */
export function ingredientNameProblem(draft: IngredientDraft): string | null {
  if (isBlankIngredient(draft)) {
    return null;
  }

  const name = draft.name.trim();

  if (name === "") {
    return EMPTY_FIELD_MESSAGE;
  }

  if (countChars(name) > MAX_INGREDIENT_NAME_LENGTH) {
    return TOO_LONG_NAME_MESSAGE;
  }

  return null;
}

/** 分量の欄に出す文言。**空は問題にしない**（`null` で保存する。design.md 4.4） */
export function amountProblem(draft: IngredientDraft): string | null {
  return countChars(draft.amount.trim()) > MAX_AMOUNT_LENGTH ? TOO_LONG_AMOUNT_MESSAGE : null;
}

/** 手順の本文の欄に出す文言。**空は問題にしない**（保存時に捨てる。design.md 4.4） */
export function stepTextProblem(step: StepDraft): string | null {
  return countChars(step.text.trim()) > MAX_STEP_LENGTH ? TOO_LONG_STEP_MESSAGE : null;
}

// ---- サーバー: 保存形全体の検証 ----

/**
 * 保存形全体に問題があれば最初の1つの文言を、無ければ `null` を返す。
 *
 * **空行の除去はしない。** クライアントが `toContentsInput()` で整えてから送る。
 * 空の材料名・空の手順が届いたら弾く（整えずに送るクライアントのバグを隠さない。design.md 5.3）。
 *
 * **空白だけの材料名・手順も空として弾く。** 保存される値に空白だけの名前が
 * 入らないことは、サーバーで保証する。
 */
export function contentsProblem(input: RecipeContentsInput): string | null {
  if (input.ingredients.length > MAX_INGREDIENTS) {
    return TOO_MANY_INGREDIENTS_MESSAGE;
  }

  if (input.steps.length > MAX_STEPS) {
    return TOO_MANY_STEPS_MESSAGE;
  }

  for (const ingredient of input.ingredients) {
    if (ingredient.name.trim() === "") {
      return EMPTY_NAME_CONTENTS_MESSAGE;
    }

    if (countChars(ingredient.name) > MAX_INGREDIENT_NAME_LENGTH) {
      return TOO_LONG_NAME_CONTENTS_MESSAGE;
    }

    if (ingredient.amount !== null && countChars(ingredient.amount) > MAX_AMOUNT_LENGTH) {
      return TOO_LONG_AMOUNT_CONTENTS_MESSAGE;
    }

    // 型の上では Category だが、サーバーは外から来た値を受け取る。念のため所属を確かめる
    if (!isCategory(ingredient.category)) {
      return INVALID_CATEGORY_MESSAGE;
    }
  }

  for (const text of input.steps) {
    if (text.trim() === "") {
      return EMPTY_STEP_CONTENTS_MESSAGE;
    }

    if (countChars(text) > MAX_STEP_LENGTH) {
      return TOO_LONG_STEP_CONTENTS_MESSAGE;
    }
  }

  return null;
}
