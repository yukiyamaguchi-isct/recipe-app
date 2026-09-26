"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { RecipeViewMode } from "./mode";
import { RecipeTitle } from "./recipe-title";

/**
 * S-04 の固定ヘッダー（`UI_DESIGN.md` S-04 / design.md 6.1）。
 *
 * **デザインは3段構成。Phase 4 で上段が戻り、通常モードは3段になった。**
 *
 * | 段   | 中身                       | 状態                                                     |
 * | ---- | -------------------------- | -------------------------------------------------------- |
 * | 上段 | `← 一覧` / ~~`編集`~~      | **`← 一覧` のみ。** `編集` は S-05 が Phase 5 のため未実装 |
 * | 中段 | タイトル ＋ `✎ 改題`       | Phase 3                                                  |
 * | 下段 | `材料 ↓` `作り方 ↓`        | Phase 3                                                  |
 *
 * **⚠️ 確認モードでは上段を出さない**（`UI_DESIGN.md` S-04c の差3）。確認モードは2段のまま。
 *
 * **Phase 5 で `編集` を戻すときは、上段を `justify-between` にして右端に置く**
 * （recipe-view design.md 6.1 の表: 左 `← 一覧` / 右 `編集`）。
 */

type Section = "ingredients" | "steps";

const LINKS: readonly { id: Section; label: string }[] = [
  { id: "ingredients", label: "材料 ↓" },
  { id: "steps", label: "作り方 ↓" },
];

/** `app/globals.css` の `:root` にフォールバック値がある。ここで実測値に置き換える。 */
const HEADER_HEIGHT_VAR = "--recipe-header-h";

type Props = {
  recipeId: string;
  /** 初期のタイトル。**改名するとここではなく `title` の state が正になる** */
  title: string;
  /** `confirm` なら確認バナーを載せる。**別コンポーネントに分けない**（落とし穴 #12） */
  mode: RecipeViewMode;
};

/**
 * `position: sticky` を使う（`fixed` ではない）。
 *
 * `sticky` は通常のフローに残るので、**本文がヘッダーの下に潜り込まない。**
 * `fixed` にすると本文の先頭がヘッダーに隠れ、その分の `padding-top` を手で足すことになり、
 * ヘッダーの高さが変わるたびにズレる。
 */
export function RecipeHeader({ recipeId, title: initialTitle, mode }: Props) {
  const headerRef = useRef<HTMLElement>(null);
  const [current, setCurrent] = useState<Section>("ingredients");

  // **確定済みのタイトルはここが持つ。** 改名でヘッダーの高さが変わりうるので、
  // 下の useEffect の依存に入れて測り直させる（design.md 6.4）。
  // 編集中の下書きは RecipeTitle 側に閉じている。
  const [title, setTitle] = useState(initialTitle);

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
      {/*
       * 確認バナー（design.md 6.1）。**ヘッダーの中に入れる。**
       *
       * デザインのモックではバナーがヘッダーの上に別要素として乗っているが、
       * あれはスマホ枠の中で両方が固定されている前提。実アプリでスクロールするのは
       * window なので、**別々に sticky させるとバナーの高さぶんの調整が要る。**
       * 中に入れれば1つの sticky ブロックになり、`--recipe-header-h` の実測値にも
       * 自動的に含まれる（アンカーの着地点がずれない）。
       */}
      {mode === "confirm" && (
        <p className="border-attention bg-warn-soft text-warn-ink border-b px-4 py-3.5 text-body font-bold">
          確認画面 — 内容をチェック
        </p>
      )}

      <div className="mx-auto w-full max-w-[640px]">
        {/*
         * 上段（recipe-list Req7 で復元。padding 6px 12px は recipe-view design.md 6.1 の表）。
         *
         * **Phase 3 では遷移先の S-02 が無いため段ごと描いていなかった。** Phase 4 で
         * 一覧ができたので `← 一覧` を戻す。
         *
         * - **`← 一覧` は「移動」**（面なし・枠なし・`--color-link` ＋ 方向記号）。
         *   4種類目の見た目を足さない（recipe-view design.md 6.2 の中核ルール）
         * - **右の `編集` は出さない。** 遷移先の S-05 は Phase 5（決着2）。
         *   **1つしか無いので段ごと消さない** — `← 一覧` があれば段は成立する
         * - **⚠️ 確認モードでは出さない**（`UI_DESIGN.md` S-04c の差3）。
         *   デザインHTMLのモックには描かれているが README が正。**空の段として高さも残さない**
         */}
        {mode === "view" && (
          <nav aria-label="画面の移動" className="flex px-3 py-1.5">
            <Link
              href="/"
              className="text-link flex h-[var(--size-tap)] items-center px-3 text-body transition-colors duration-[120ms]"
            >
              ← 一覧
            </Link>
          </nav>
        )}

        {/*
         * 中段: タイトル 22px/700/lh1.4 ＋ `✎ 改題`。padding は仕様どおり 0 16px 8px
         * （`RecipeTitle` 側が持つ）。上余白は**上段の padding-bottom 6px が担う**。
         *
         * **⚠️ 確認モードだけは上余白を自前で足す。** 確認モードには上段が無いので、
         * 何もしないとタイトルがバナーの境界線に貼り付く。**Phase 3 が中段に足していた
         * 12px は、いまや「上段が無いモード」だけに必要な値**になった
         * （recipe-view design.md 6.4「上余白12px は仕様値ではない」/ 落とし穴 #17）。
         */}
        <div className={mode === "confirm" ? "pt-3" : undefined}>
          <RecipeTitle recipeId={recipeId} title={title} onRenamed={setTitle} />
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
