"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { editPath, recipePath } from "./mode";

/**
 * 確認モード（S-04c）の最下部固定バー（`UI_DESIGN.md` S-04c / design.md 6.1）。
 *
 * **スマホでは固定表示にする。** 材料が多いレシピだと最下部が遠く、
 * 決定に辿り着けない（`UI_DESIGN.md` S-04c の注意点）。
 *
 * **どちらを選ぶ前でもレシピは保存済み**（Phase 2 で担保済み）。
 * このバーは「読んだ」ことを示すだけで、保存はしない。
 */

/** `app/globals.css` の `:root` にフォールバック値がある。ここで実測値に置き換える。 */
const BAR_HEIGHT_VAR = "--recipe-bottom-bar-h";

type Props = {
  recipeId: string;
};

export function ConfirmBar({ recipeId }: Props) {
  const router = useRouter();
  const barRef = useRef<HTMLDivElement>(null);

  // **本文の下に、バーの高さぶんの余白が要る。** 無いと最後の手順がバーに隠れる
  // （design.md 落とし穴 #11）。ヘッダーと同じく実測値を CSS 変数に流す。
  useEffect(() => {
    const bar = barRef.current;

    if (!bar) {
      return;
    }

    let frame = 0;

    const measure = () => {
      frame = 0;
      document.documentElement.style.setProperty(BAR_HEIGHT_VAR, `${bar.offsetHeight}px`);
    };

    const onResize = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(measure);
      }
    };

    measure();
    window.addEventListener("resize", onResize, { passive: true });

    return () => {
      if (frame !== 0) {
        cancelAnimationFrame(frame);
      }
      window.removeEventListener("resize", onResize);
      // 画面を離れたら戻す。通常モードに余白が残らないように
      document.documentElement.style.removeProperty(BAR_HEIGHT_VAR);
    };
  }, []);

  /**
   * 「この内容で決定」。**保存はしない**（すでに保存済み）。
   *
   * クエリを外して通常モードに移る。`replace` なので、**戻るボタンで
   * 確認モードに戻ってこない**。読み終えた画面へ戻す意味が無いため。
   */
  function confirm() {
    router.replace(recipePath(recipeId));
  }

  return (
    <div
      ref={barRef}
      className="border-border bg-surface fixed inset-x-0 bottom-0 z-20 border-t p-4 shadow-[0_-4px_12px_rgba(11,45,57,.06)]"
    >
      {/* 本文と同じ幅で中央寄せ。バーだけ端まで広がると位置が揃わない */}
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-2.5">
        {/* 主要ボタン（design.md 6.1）。ラベルは体言止め・最大8文字 */}
        <button
          type="button"
          onClick={confirm}
          className="bg-primary hover:bg-primary-dark h-[var(--size-tap-lg)] w-full rounded-md px-6 text-lead font-bold text-white transition-colors duration-[120ms]"
        >
          この内容で決定
        </button>

        {/*
         * 副次ボタン「編集する」（README「Screens 5」: [この内容で決定]（主要）→[編集する]（副次）の順）。
         * **Phase 5 で戻した**（recipe-edit 決定②）。Phase 3 は遷移先の S-05 が無いため出していなかった。
         *
         * 見た目は副次（面 白・枠 1.5px link・文字 link 19px 500・56px）。押すと編集画面へ移るだけなので
         * 要素は `Link`（S-04 ヘッダーの `編集` と同じ判断。recipe-edit design.md 5.9）。
         *
         * **確認モードの出口はこのバーの2つだけ**（決定②。ヘッダーの上段は出さない）
         */}
        <Link
          href={editPath(recipeId)}
          className="border-link text-link hover:bg-primary-soft bg-surface flex h-[var(--size-tap-lg)] w-full items-center justify-center rounded-md border-[1.5px] text-lead font-medium transition-colors duration-[120ms]"
        >
          編集する
        </Link>
      </div>
    </div>
  );
}
