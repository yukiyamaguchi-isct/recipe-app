"use client";

import { useEffect, useRef, useState } from "react";

/**
 * S-04 の固定ヘッダー（`UI_DESIGN.md` S-04 / design.md 6.1）。
 *
 * **デザインは3段構成だが、Phase 3 は2段。** 上段に置くのは `← 一覧`（→ S-02 は Phase 4）と
 * `編集`（→ S-05 は Phase 5）の2つだけで、**どちらもこのフェーズでは出さないと決まった**
 * （requirements.md 決着2・3）。**空の段を高さだけ残さず、段ごと描かない。**
 *
 * **Phase 4 / 5 で上段を戻すときは、design.md 6.1 の padding 6px 12px を復元すること。**
 */

type Section = "ingredients" | "steps";

const LINKS: readonly { id: Section; label: string }[] = [
  { id: "ingredients", label: "材料 ↓" },
  { id: "steps", label: "作り方 ↓" },
];

/** `app/globals.css` の `:root` にフォールバック値がある。ここで実測値に置き換える。 */
const HEADER_HEIGHT_VAR = "--recipe-header-h";

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
  const headerRef = useRef<HTMLElement>(null);
  const [current, setCurrent] = useState<Section>("ingredients");

  useEffect(() => {
    const header = headerRef.current;

    if (!header) {
      return;
    }

    let frame = 0;

    const update = () => {
      frame = 0;

      // **高さは毎回測り直す。** タイトルが2行になるとヘッダーが約31px高くなり、
      // 固定値では着地点がヘッダーの下に潜る（design.md 6.4 の ⚠️ をここで潰した）。
      const height = header.offsetHeight;
      document.documentElement.style.setProperty(HEADER_HEIGHT_VAR, `${height}px`);

      // **高さの計測と現在位置の追跡は切り離す。** 以前は #steps が無いと早期 return して
      // いたため、**高さの計測まで巻き添えで止まっていた**（テストが捕まえた）。
      // 飛び先の scroll-margin は現在位置とは無関係に必要になる。
      const steps = document.getElementById("steps");

      if (!steps) {
        return;
      }

      // **セクションは2つしかない。** IntersectionObserver の rootMargin を調整するより、
      // 「作り方の先頭がヘッダー線を越えたか」を直接見るほうが正確で、
      // **作り方が短いレシピでも取りこぼさない**（design.md 6.6）。
      //
      // `<` は等号を含めない。jsdom はレイアウトを持たず全部 0 を返すため、
      // `<=` にすると初期状態で「作り方」が現在位置になってしまう。
      // 実ブラウザでの差は1pxで、体感には出ない。
      setCurrent(steps.getBoundingClientRect().top < height ? "steps" : "ingredients");
    };

    // スクロールのたびに測るので rAF でまとめる。passive はスクロールを妨げないため
    const onScroll = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(update);
      }
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      if (frame !== 0) {
        cancelAnimationFrame(frame);
      }
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      // 画面を離れたら CSS 変数を戻す。他の画面に S-04 のヘッダー高さを残さない
      document.documentElement.style.removeProperty(HEADER_HEIGHT_VAR);
    };
    // タイトルが変わるとヘッダーの高さも変わりうる（Req7 の改名）。測り直す
  }, [title]);

  return (
    <header
      ref={headerRef}
      className="bg-header border-border shadow-e1 sticky top-0 z-10 border-b"
    >
      <div className="mx-auto w-full max-w-[640px]">
        {/*
         * 中段: タイトル 22px/700/lh1.4。仕様の padding は 0 16px 8px だが、
         * **上段が無いぶんの上余白（12px）をここで持つ。** 無いと画面の縁に文字が貼り付く。
         * これは仕様値ではなくこちらの判断（design.md 6.4）。
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
          {LINKS.map(({ id, label }) => {
            const active = id === current;

            return (
              // hover 装飾を足さない（引き継ぎ資料 Interactions:「移動系リンクにhover装飾を足さない」）
              //
              // **現在位置も面では示さない。** 面を付けると絞り込みのピルと同じ見た目になり、
              // 「移動 / 操作 / 絞り込み」の描き分けが壊れる（落とし穴 #14）。
              // 太さと文字色だけで差をつける。
              <a
                key={id}
                href={`#${id}`}
                aria-current={active ? "location" : undefined}
                className={`flex h-[var(--size-tap)] items-center px-3 text-body transition-colors duration-[120ms] ${
                  active ? "text-ink font-bold" : "text-link"
                }`}
              >
                {label}
              </a>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
