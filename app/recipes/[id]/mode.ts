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
