/**
 * S-04（通常モード）と S-04c（確認モード）の切り替え。
 *
 * **同じ画面の状態違いであって、別画面ではない**（`UI_DESIGN.md` S-04c:
 * 「S-04通常モードと同一の表示を使う」）。**別コンポーネントに分けない**
 * （design.md 落とし穴 #12）。片方だけ直して表示がずれる。
 */
export type RecipeViewMode = "view" | "confirm";

/**
 * 確認モードを URL でどう伝えるか。
 *
 * **クエリにした**（`/recipes/<id>?confirm=1`）。別ルート（`/recipes/<id>/confirm`）は
 * ページを2つ持つことになり、**同一表示という前提が崩れやすい**。詳細は design.md 6.8。
 */
export const CONFIRM_PARAM = "confirm";

/** `searchParams` から表示モードを決める。**値は見ない。キーの有無だけ。** */
export function modeFromSearchParams(params: Record<string, string | string[] | undefined>) {
  return params[CONFIRM_PARAM] === undefined ? "view" : ("confirm" as const);
}

/** 通常モードのパス。 */
export function recipePath(recipeId: string): string {
  return `/recipes/${recipeId}`;
}

/**
 * 確認モードのパス。
 *
 * **解析直後の着地先**（`UI_DESIGN.md` 2章: S-03 → S-04c）。
 * `/upload` と `ConfirmBar` の両方がここを通す。**クエリ名を各所に直書きしない。**
 */
export function confirmPath(recipeId: string): string {
  return `${recipePath(recipeId)}?${CONFIRM_PARAM}=1`;
}

/**
 * 編集画面（S-05）のパス（recipe-edit design.md 4.3）。
 *
 * **別ルートにした。** 確認モードは「同じ表示の状態違い」なのでクエリにしたが、
 * S-05 はヘッダーも本文も別物（`REQUIREMENTS.md` 4.7「編集画面と表示画面は別画面」）。
 * S-04 の `編集`・確認バーの「編集する」がここを通す。**パスを各所に直書きしない。**
 */
export function editPath(recipeId: string): string {
  return `${recipePath(recipeId)}/edit`;
}
