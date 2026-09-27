"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * 確認ダイアログの外枠（引き継ぎ資料 README「確認ダイアログ」/ recipe-edit design.md 3.1・5.8）。
 *
 * **利用者は3つ**: 一覧のレシピ削除（`app/delete-dialog.tsx`）、編集画面の行の削除、編集の破棄確認。
 * 「2つ目の利用者が現れてから動かす」（recipe-view design.md 3.1）に従い、Phase 5 で切り出した。
 *
 * **外枠が持つもの**: 背景・`role="dialog"` / `aria-modal`・見出しとの対応付け・
 * `Escape` と背景クリックで閉じる・開いた直後に**上のボタン（非破壊側）**へフォーカス・縦並びのボタン2つ。
 * **中身（本文・失敗の表示）と、押したあとの処理は呼び出し側が持つ。**
 *
 * **開閉の state も呼び出し側が持つ。** 開いているときだけ描画する（`{open && <ConfirmDialog …/>}`）。
 *
 * **⚠️ ネイティブ `<dialog>` は使わない。** jsdom 30 は `showModal` / `close` を
 * **実装していない**ため、使うとテストが全滅する（recipe-list design.md 6.4 / 落とし穴 #29）。
 * その代わり Escape・背景クリック・初期フォーカスは自前（フォーカストラップは MVP では見送り）。
 */

type Props = {
  /** 見出し。22px 700。**何をするのか**（「レシピを削除」「この行を削除」「編集を破棄」） */
  heading: string;
  /** 本文と、必要なら失敗の表示。**どれが対象かを書く**（「本当に〜しますか」だけにしない） */
  children: ReactNode;
  /** 上のボタン（非破壊側）。ラベルは体言止め・最大8文字（README「ボタン」） */
  cancelLabel: string;
  /** 下のボタン（破壊側） */
  confirmLabel: string;
  /** 処理中の下のボタンのラベル（「削除中…」）。省略すると `confirmLabel` のまま */
  busyLabel?: string;
  /**
   * 処理中。**両方のボタンを押せなくし、Escape・背景クリックでも閉じない。**
   * 閉じても処理は止まらず、結果が見えなくなるだけなので（recipe-list design.md 6.4）
   */
  busy?: boolean;
  /** 閉じる（上のボタン・Escape・背景クリック）。**何も消さない** */
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  heading,
  children,
  cancelLabel,
  confirmLabel,
  busyLabel,
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  const headingId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  // ⚠️ Escape で閉じる。**ネイティブ dialog なら無料で付くが、素の div では自前。**
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        onCancel();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel]);

  // 開いたら上のボタン（非破壊側）に焦点を移す。**破壊的でないほうを初期位置にする**
  // （資料「破壊的動作を上に置かない」と同じ考え方）。**開いたときの1回だけ**
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <div
      // 背景クリックで閉じる。**閉じるだけで何も消えない**（処理中は閉じない）
      onClick={() => !busy && onCancel()}
      className="fixed inset-0 z-50 grid place-items-center bg-[rgba(11,45,57,0.45)] p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        // 中身のクリックで閉じない
        onClick={(event) => event.stopPropagation()}
        className="bg-surface shadow-e2 flex w-full max-w-[340px] flex-col gap-3 rounded-md p-6"
      >
        <h2 id={headingId} className="text-ink text-title font-bold">
          {heading}
        </h2>

        {children}

        {/*
         * ボタンは縦並び（gap 10px、各56px）。
         * **⚠️ 破壊的動作を上に置かない**（引き継ぎ資料「確認ダイアログ」）。
         * 資料の見本（v2.dc.html L414-415）は逆だが、README の規則を採る（recipe-edit 食い違い10）。
         */}
        <div className="mt-1 flex flex-col gap-2.5">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="border-link text-link hover:bg-primary-soft bg-surface flex h-[var(--size-tap-lg)] items-center justify-center rounded-md border-[1.5px] text-lead font-medium transition-colors duration-[120ms]"
          >
            {cancelLabel}
          </button>

          {/* 破壊側は README「ボタン」の「危険」（面は白・文字と枠が赤系）。見本の赤塗りは採らない */}
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="border-danger-border text-danger hover:bg-danger-soft bg-surface flex h-[var(--size-tap-lg)] items-center justify-center rounded-md border-[1.5px] text-lead font-medium transition-colors duration-[120ms] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy && busyLabel !== undefined ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
