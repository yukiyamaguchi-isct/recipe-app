/**
 * S-04 の固定ヘッダー（`UI_DESIGN.md` S-04 / design.md 6.1）。
 *
 * **デザインは3段構成だが、Phase 3 は2段。** 上段に置くのは `← 一覧`（→ S-02 は Phase 4）と
 * `編集`（→ S-05 は Phase 5）の2つだけで、**どちらもこのフェーズでは出さないと決まった**
 * （requirements.md 決着2・3）。**空の段を高さだけ残さず、段ごと描かない。**
 *
 * **Phase 4 / 5 で上段を戻すときは、design.md 6.1 の padding 6px 12px を復元すること。**
 */

type Props = {
  title: string;
};

/**
 * `position: sticky` を使う（`fixed` ではない）。
 *
 * `sticky` は通常のフローに残るので、**本文がヘッダーの下に潜り込まない。**
 * `fixed` にすると本文の先頭がヘッダーに隠れ、その分の `padding-top` を手で足すことになり、
 * ヘッダーの高さが変わるたびにズレる。
 */
export function RecipeHeader({ title }: Props) {
  return (
    <header className="bg-header border-border shadow-e1 sticky top-0 z-10 border-b">
      <div className="mx-auto w-full max-w-[640px]">
        {/*
         * 中段: タイトル 22px/700/lh1.4。仕様の padding は 0 16px 8px だが、
         * **上段が無いぶんの上余白（12px）をここで持つ。** 無いと画面の縁に文字が貼り付く。
         * これは仕様値ではなくこちらの判断（design.md 6.1 の ⚠️）。
         */}
        <div className="px-4 pt-3 pb-2">
          <h1 className="text-ink text-title leading-[1.4] font-bold">{title}</h1>
        </div>

        {/*
         * 下段: ページ内の移動。**「移動」は面なし・枠なし・文字色 --color-link ＋ 方向記号**
         * （design.md 6.2 の中核ルール）。材料タブの「絞り込み」（塗りピル）と混ざらないよう、
         * **4種類目の見た目を足さない。**
         *
         * 素の <a href="#..."> で組む。JS を挟まずに動き、リンクとして読み上げにも伝わる。
         * 着地点がヘッダーの下に潜らないようにするのは、飛び先の scroll-margin-top の仕事。
         */}
        <nav aria-label="ページ内の移動" className="flex px-3 pb-1.5">
          {/* hover 装飾を足さない（引き継ぎ資料 Interactions:「移動系リンクにhover装飾を足さない」） */}
          <a
            href="#ingredients"
            className="text-link flex h-[var(--size-tap)] items-center px-3 text-body"
          >
            材料 ↓
          </a>
          <a
            href="#steps"
            className="text-link flex h-[var(--size-tap)] items-center px-3 text-body"
          >
            作り方 ↓
          </a>
        </nav>
      </div>
    </header>
  );
}
