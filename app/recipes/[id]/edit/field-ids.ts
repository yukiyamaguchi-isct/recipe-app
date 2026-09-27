/**
 * S-05 の入力欄の id（recipe-edit design.md 5.6）。
 *
 * **`RecipeEditor` と各節の両方から使う。** 節は欄に id を振り、`RecipeEditor` は保存時に
 * 「未入力」などの最初の欄へフォーカスを移すのに使う。**組み立て方を二重に書かない。**
 *
 * `prefix` は `RecipeEditor` の `useId()`。同じ画面に複数あっても衝突しない。
 */

export function ingredientNameId(prefix: string, key: string): string {
  return `${prefix}-ingredient-name-${key}`;
}

export function ingredientAmountId(prefix: string, key: string): string {
  return `${prefix}-ingredient-amount-${key}`;
}

export function stepTextId(prefix: string, key: string): string {
  return `${prefix}-step-text-${key}`;
}

/** 欄の下の補助文の id（`aria-describedby` で欄と結びつける） */
export function errorId(fieldId: string): string {
  return `${fieldId}-error`;
}
