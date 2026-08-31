"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 削除の導線と確認ダイアログ（requirements.md Req5）。
 *
 * **「削除は常に確認ダイアログを経由」**（引き継ぎ資料 Interactions）。押し間違いで消えない。
 *
 * **⚠️ トリガーとダイアログを同じファイルに置いている。** トリガーはカードの `<a>` の
 * **外側**に置く必要があり（落とし穴 #13）、開閉の state はトリガーが持つのが自然なため。
 * 分けると、カード側に state を持たせて props で渡すことになり、かえって散らかる。
 *
 * **⚠️ ネイティブ `<dialog>` は使わない。** jsdom 30 は `showModal` / `close` を
 * **実装していない**（`undefined`。呼ぶと TypeError）ため、使うとテストが全滅する。
 * ✅ 実測 2026-08-25、段階10。詳細は design.md 6.4。
 */

type Props = {
  recipeId: string;
  /** ダイアログに出す。**どれを消すのか分からないまま押させない**（Req5） */
  title: string;
};

export function DeleteDialog({ recipeId, title }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // ⚠️ Escape で閉じる。**ネイティブ dialog なら無料で付くが、素の div では自前。**
  // 閉じるだけで、削除はしない（Req5「やめるでレシピが残っている」）。
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  // 開いたら「やめる」に焦点を移す。**破壊的でないほうを初期位置にする**
  // （資料「破壊的動作を上に置かない」と同じ考え方）。
  useEffect(() => {
    if (isOpen) {
      cancelRef.current?.focus();
    }
  }, [isOpen]);

  return (
    <>
      {/*
       * ⚠️ このボタンはカードの `<a>` の**外側**に置かれる（`recipe-card.tsx`）。
       * 中に入れるとインタラクティブ要素の入れ子でHTMLとして不正になり、
       * **削除を押したつもりがレシピが開く**（落とし穴 #13）。
       *
       * 見た目は「操作」。サムネイル右上に重ねる。
       */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label={`${title} を削除`}
        className="border-danger-border text-danger hover:bg-danger-soft bg-surface absolute top-2 right-2 z-10 grid size-11 place-items-center rounded-sm border-[1.5px] text-lead transition-colors duration-[120ms]"
      >
        <span aria-hidden="true">×</span>
      </button>

      {isOpen && (
        <div
          // 背景クリックで閉じる。**閉じるだけで消えない**
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-50 grid place-items-center bg-[rgba(11,45,57,0.45)] p-4"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`delete-heading-${recipeId}`}
            // 中身のクリックで閉じない
            onClick={(event) => event.stopPropagation()}
            className="bg-surface shadow-e2 flex w-full max-w-[340px] flex-col gap-3 rounded-md p-6"
          >
            <h2 id={`delete-heading-${recipeId}`} className="text-ink text-title font-bold">
              レシピを削除
            </h2>

            {/* **どれを消すのか出す。** 「本当に削除しますか」だけでは確認にならない */}
            <p className="text-ink-control text-body">「{title}」を削除します。元に戻せません。</p>

            {/*
             * ボタンは縦並び（gap 10px、各56px）。
             * **⚠️ 破壊的動作を上に置かない**（引き継ぎ資料「確認ダイアログ」）。
             * 「やめる」が上、「削除する」が下。
             */}
            <div className="mt-1 flex flex-col gap-2.5">
              <button
                ref={cancelRef}
                type="button"
                onClick={() => setIsOpen(false)}
                className="border-link text-link hover:bg-primary-soft bg-surface flex h-[var(--size-tap-lg)] items-center justify-center rounded-md border-[1.5px] text-lead font-medium transition-colors duration-[120ms]"
              >
                やめる
              </button>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="border-danger-border text-danger hover:bg-danger-soft bg-surface flex h-[var(--size-tap-lg)] items-center justify-center rounded-md border-[1.5px] text-lead font-medium transition-colors duration-[120ms]"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
