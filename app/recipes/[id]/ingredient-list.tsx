"use client";

import { useState } from "react";

// ⚠️ 値の `Category` は **`enums` から**取る。`client` から取ると `node:process` /
// `node:path` / `node:url` と Prisma のランタイムごとブラウザ向けバンドルに入り、
// **ビルドが `does not support external modules (request: node:module)` で落ちる**
// （design.md 落とし穴 #27。実際に踏んだ）。
// `enums.ts` は import を1つも持たない定数だけのファイルで、Prisma 自身が
// 「🟢 You can import this file directly」と書いている。
import { Category } from "@/generated/prisma/enums";
// 型は `import type` なのでコンパイル時に消える。ランタイムには残らない。
import type { Ingredient } from "@/generated/prisma/client";

/**
 * 「材料」セクション（`UI_DESIGN.md` S-04）。
 *
 * 視覚仕様は design.md 6.1 の確定値。**推測で変えない。**
 *
 * **このフェーズで最初のクライアントコンポーネント。** 絞り込みの状態を持つため。
 * Server Component から渡ってくるのは `Ingredient[]`（string / number / null だけ）と
 * `servings` で、**`Date` は渡していない**（design.md 落とし穴 #15）。
 */

/**
 * **画面での並び順。`Object.values(Category)` を使わない**（design.md 落とし穴 #6）。
 *
 * `schema.prisma` の enum は `SEASONING / VEGETABLE / OTHER` の順だが、
 * 画面は **野菜 → 調味料 → その他**（`UI_DESIGN.md` S-04）。**両者は一致していない。**
 * enum の順に依存すると、スキーマを触った瞬間に画面の並びが変わり、
 * しかも**型でもテストでも捕まらない**。
 */
const CATEGORY_VIEW = [
  { value: Category.VEGETABLE, label: "野菜", band: "bg-cat-veg text-cat-veg-ink" },
  { value: Category.SEASONING, label: "調味料", band: "bg-cat-season text-cat-season-ink" },
  { value: Category.OTHER, label: "その他", band: "bg-cat-other text-cat-other-ink" },
] as const;

/**
 * カテゴリを増やしたときに、この配列への追加を忘れると**ここで型エラーになる**。
 * 忘れたまま動くと、その材料が画面から静かに消える。
 */
const _EXHAUSTIVE: Record<Category, true> = {
  [Category.VEGETABLE]: true,
  [Category.SEASONING]: true,
  [Category.OTHER]: true,
};
void _EXHAUSTIVE;

/** 絞り込みの選択肢。**並び順は `CATEGORY_VIEW` から作る**（順序の正を1箇所に保つ）。 */
const ALL = "ALL" as const;
type Filter = typeof ALL | Category;

const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: ALL, label: "全体" },
  ...CATEGORY_VIEW.map(({ value, label }) => ({ value: value as Filter, label })),
];

type Props = {
  /** `order` の昇順で渡ってくる（`findRecipeForUser` が指定している） */
  ingredients: Ingredient[];
  /** 何人分。**取れなかったレシピは `null`**（`REQUIREMENTS.md` 9章） */
  servings: number | null;
};

/**
 * 見出しの人数（design.md 5.5）。
 *
 * **`null` を 0 や 1 に丸めない。** 「2〜3人分」のような幅のある表記や、
 * そもそも人数が書かれていないレシピがあるため `Int?` にしてある。
 * 勝手な数字を出すのは、読み取れなかったことを隠すことになる。
 */
function headingText(servings: number | null): string {
  return servings === null ? "材料" : `材料（${servings}人分）`;
}

/**
 * 材料1行。**材料名が左（左寄せ）、分量が右（右寄せ）**。
 *
 * ⚠️ **引き継ぎ資料とは左右が逆。** 資料は「分量が左」で、理由を
 * 「買い物中に数量だけを縦に追えるようにするため」としていた。
 * **2026-08-24 にユーザーが実機で見て、名前を左にすると決定**（design.md 6.5）。
 * **元に戻さない。**
 *
 * 数量は**右寄せ・幅固定のまま**にしてあるので、右端で桁が揃い、
 * 縦に追う利点は右側で残る。
 */
function IngredientRow({ ingredient }: { ingredient: Ingredient }) {
  return (
    <li className="border-track flex items-baseline gap-4 border-b px-[18px] py-4">
      {/* 材料名: 可変幅・左寄せ。長い名前はここで折り返す */}
      <span className="text-ink flex-1 text-lead leading-[1.6] text-pretty">{ingredient.name}</span>
      {/*
       * 分量: 幅 5.5em 固定・右寄せ・tabular-nums で桁を揃える。
       * 分量が無い行でも幅は保つ（右端が揃う）。
       */}
      <span className="text-ink w-[5.5em] flex-none text-right text-lead font-bold tabular-nums">
        {ingredient.amount}
      </span>
    </li>
  );
}

export function IngredientList({ ingredients, servings }: Props) {
  // **既定は「全体」**（`UI_DESIGN.md` S-04）。開いた直後に全材料が見えるほうが
  // 買い物にも調理にも都合がよい。**「選択なし」の状態は作らない。**
  const [filter, setFilter] = useState<Filter>(ALL);

  const visible = filter === ALL ? ingredients : ingredients.filter((i) => i.category === filter);

  return (
    /*
     * ヘッダーの `材料 ↓` の着地点。
     *
     * **`scroll-margin-top` が要る。** 固定ヘッダーは sticky で本文の上に重なるので、
     * これが無いと**飛んだ先の見出しがヘッダーの下に潜る**（エラーは出ない。落とし穴 #9）。
     *
     * 値は `--recipe-header-h`。`globals.css` の 112px がフォールバックで、
     * **実際の高さは `recipe-header.tsx` が測って上書きする**ので、
     * タイトルが2行になっても追従する（design.md 6.4）。
     */
    <section
      id="ingredients"
      aria-labelledby="ingredients-heading"
      className="scroll-mt-[var(--recipe-header-h)]"
    >
      <h2 id="ingredients-heading" className="text-ink text-title font-bold">
        {headingText(servings)}
      </h2>

      {ingredients.length === 0 ? (
        <p className="text-ink-sub mt-4 text-body">材料が登録されていません。</p>
      ) : (
        <>
          {/*
           * 絞り込み = **塗りピル**（design.md 6.2「移動 / 操作 / 絞り込み」）。
           * ヘッダーの「移動」（面なし）と混ざらないよう、**材料見出しの直下**に置く。
           * 配置でも役割を示すのがこのデザインの規則。**4種類目の見た目を足さない。**
           *
           * ARIA の tablist にはしない。あれは矢印キーでの移動が要求されるが、
           * ここでは実装していない。**実装していない操作を約束しない**ため、
           * ボタン＋ aria-pressed にしてある。
           */}
          <div role="group" aria-label="材料の絞り込み" className="mt-4 flex flex-wrap gap-2">
            {FILTERS.map(({ value, label }) => {
              const selected = value === filter;

              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setFilter(value)}
                  className={`h-[var(--size-tap)] rounded-full px-[18px] text-body transition-colors duration-[120ms] ${
                    selected
                      ? "bg-primary font-medium text-white"
                      : "bg-surface text-ink-control border-border border"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {visible.length === 0 ? (
            // 絞り込んだ結果が0件。**空白のまま放置しない**（requirements.md Req2）。
            // 段階5 の「空のカテゴリは帯ごと出さない」とは別の話で、
            // こちらはユーザーが自分で選んだ結果なので、何も出ないと故障に見える。
            <p className="text-ink-sub mt-4 text-body">該当する材料はありません。</p>
          ) : filter === ALL ? (
            <div className="mt-4 flex flex-col gap-4">
              {CATEGORY_VIEW.map(({ value, label, band }) => {
                const rows = ingredients.filter((ingredient) => ingredient.category === value);

                // 空のカテゴリは帯ごと出さない。買い物中に読む画面なので、
                // 中身の無い見出しが挟まると目が滑る。
                if (rows.length === 0) {
                  return null;
                }

                return (
                  <section key={value} aria-labelledby={`category-${value}`}>
                    <h3
                      id={`category-${value}`}
                      className={`flex items-center gap-2.5 rounded-sm px-4 py-2.5 text-body font-bold ${band}`}
                    >
                      <span
                        aria-hidden="true"
                        className="size-2.5 flex-none rounded-full bg-current"
                      />
                      {label}
                      <span className="ml-auto text-meta font-normal">{rows.length}</span>
                    </h3>

                    <ul>
                      {rows.map((ingredient) => (
                        <IngredientRow key={ingredient.id} ingredient={ingredient} />
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          ) : (
            // 1カテゴリだけのときは帯を出さない。**点灯しているピルが既に
            // どのカテゴリかを示している**ので、見出しを重ねると同じ情報が2つ並ぶ。
            <ul className="mt-4">
              {visible.map((ingredient) => (
                <IngredientRow key={ingredient.id} ingredient={ingredient} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
