/**
 * 材料のカテゴリの**画面での並び順とラベル**（recipe-edit design.md 3.1）。
 *
 * **利用者は2つ**: S-04 の絞り込みタブとカテゴリ見出し（`ingredient-list.tsx`）、
 * S-05 のカテゴリのプルダウン。**ラベルを二重に書かない。** 片方だけ直すと
 * タブ「野菜」と選択肢「野菜」がずれる（落とし穴 #N12）。
 *
 * **色（Tailwind のクラス）はここに置かない。** 見た目は S-04 だけのもので、
 * このファイルはサーバー・クライアントどちらからも読まれる純粋な定数に保つ。
 *
 * **このファイルはサーバー専用の依存を持たない。** `Category` の値は
 * `@/generated/prisma/enums` から取る（recipe-view 落とし穴 #27）。
 */
import { Category } from "@/generated/prisma/enums";

/**
 * **画面での並び順。`Object.values(Category)` を使わない**（recipe-view 落とし穴 #6）。
 *
 * `schema.prisma` の enum は `SEASONING / VEGETABLE / OTHER` の順だが、
 * 画面は **野菜 → 調味料 → その他**（`UI_DESIGN.md` S-04 / 引き継ぎ資料「フォーム入力」の
 * プルダウン）。**両者は一致していない。** enum の順に依存すると、スキーマを触った瞬間に
 * 画面の並びが変わり、しかも型でもテストでも捕まらない。
 */
export const CATEGORY_ORDER = [Category.VEGETABLE, Category.SEASONING, Category.OTHER] as const;

/**
 * カテゴリを増やしたのに `CATEGORY_ORDER` に足し忘れると、**ここで型エラーになる。**
 * 忘れたまま動くと、S-04 ではその材料が画面から静かに消え、S-05 では選べなくなる。
 */
type MissingFromOrder = Exclude<Category, (typeof CATEGORY_ORDER)[number]>;
const _ORDER_COVERS_ALL: [MissingFromOrder] extends [never] ? true : never = true;
void _ORDER_COVERS_ALL;

/** 画面に出すラベル。`Record<Category, …>` なので、足し忘れは型エラーになる */
export const CATEGORY_LABELS: Record<Category, string> = {
  [Category.VEGETABLE]: "野菜",
  [Category.SEASONING]: "調味料",
  [Category.OTHER]: "その他",
};
