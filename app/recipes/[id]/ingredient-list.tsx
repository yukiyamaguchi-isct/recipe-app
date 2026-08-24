import { Category } from "@/generated/prisma/client";
import type { Ingredient } from "@/generated/prisma/client";

/**
 * 「材料」セクション（`UI_DESIGN.md` S-04）。
 *
 * 視覚仕様は design.md 6.1 の確定値。**推測で変えない。**
 * 絞り込みタブは段階6 で足す。この段階は全カテゴリを見出し付きで積む。
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

export function IngredientList({ ingredients, servings }: Props) {
  return (
    // id は段階7 のページ内移動（`材料 ↓`）の着地点になる
    <section id="ingredients" aria-labelledby="ingredients-heading">
      <h2 id="ingredients-heading" className="text-ink text-title font-bold">
        {headingText(servings)}
      </h2>

      {ingredients.length === 0 ? (
        <p className="text-ink-sub mt-4 text-body">材料が登録されていません。</p>
      ) : (
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
                  <span aria-hidden="true" className="size-2.5 flex-none rounded-full bg-current" />
                  {label}
                  <span className="ml-auto text-meta font-normal">{rows.length}</span>
                </h3>

                <ul>
                  {rows.map((ingredient) => (
                    <li
                      key={ingredient.id}
                      className="border-track flex items-baseline gap-4 border-b px-[18px] py-4"
                    >
                      {/*
                       * **分量が左、材料名が右**（design.md 落とし穴 #8）。
                       * 「買い物中に数量だけを縦に追えるようにするため」（引き継ぎ資料）。
                       * **左右を入れ替えない。**
                       *
                       * tabular-nums で桁を揃える。幅 5.5em は固定で、長い分量は
                       * 折り返して材料名の1行目に揃う。
                       */}
                      <span className="text-ink w-[5.5em] flex-none text-right text-lead font-bold tabular-nums">
                        {ingredient.amount}
                      </span>
                      <span className="text-ink flex-1 text-lead leading-[1.6] text-pretty">
                        {ingredient.name}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
