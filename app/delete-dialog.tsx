"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { INTERNAL_ERROR, type ApiResponseBody } from "@/lib/api-response";

import { ConfirmDialog } from "./confirm-dialog";

/**
 * 削除の導線と確認ダイアログ（requirements.md Req5）。
 *
 * **「削除は常に確認ダイアログを経由」**（引き継ぎ資料 Interactions）。押し間違いで消えない。
 *
 * **⚠️ トリガーとダイアログを同じファイルに置いている。** トリガーはカードの `<a>` の
 * **外側**に置く必要があり（落とし穴 #13）、開閉の state はトリガーが持つのが自然なため。
 * 分けると、カード側に state を持たせて props で渡すことになり、かえって散らかる。
 *
 * **ダイアログの外枠は `./confirm-dialog.tsx`**（Phase 5 で切り出した。recipe-edit design.md 3.1）。
 * ここに残るのはトリガー・開閉と削除中の state・削除の通信・本文と失敗の表示。
 * ネイティブ `<dialog>` を使わない理由（jsdom 30 に `showModal` が無い）もあちらに書いてある。
 */

const NETWORK_MESSAGE = "通信に失敗しました。通信環境を確認して、もう一度お試しください。";

type DeleteResponse = ApiResponseBody<{ id: string }>;

/**
 * 失敗レスポンスから画面に出す文言を取り出す。
 *
 * **JSONですら無い場合がある**（プロキシのエラーページなど）。そのときは
 * `INTERNAL_ERROR` の文言に倒す。**クライアントで独自の文言を作らない**ので、
 * サーバーが 500 を返したときと見えるものが一致する（`recipe-title.tsx` と同じ流儀）。
 */
function messageFromResponse(text: string): string {
  try {
    const body = JSON.parse(text) as DeleteResponse;
    if (body.success === false && typeof body.error?.message === "string") {
      return body.error.message;
    }
  } catch {
    // JSON でなければ既定の文言に倒す
  }
  return INTERNAL_ERROR.message;
}

type Props = {
  recipeId: string;
  /** ダイアログに出す。**どれを消すのか分からないまま押させない**（Req5） */
  title: string;
};

export function DeleteDialog({ recipeId, title }: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function handleDelete() {
    // ⚠️ 二重送信を防ぐ。**2回目は 404 になる**（1回目で消えているため）ので、
    // 押せてしまうと「削除に失敗しました」と出てユーザーを混乱させる
    if (deleting) {
      return;
    }

    setDeleting(true);
    setProblem(null);

    try {
      const response = await fetch(`/api/recipes/${recipeId}`, { method: "DELETE" });

      if (!response.ok) {
        setProblem(messageFromResponse(await response.text()));
        return;
      }

      setIsOpen(false);

      // ⚠️ **クライアント側で配列から抜かない**（落とし穴 #14）。一覧は Server Component が
      // 持っているデータなので、抜くと画面とサーバーの状態がずれる。
      // `refresh()` なら署名付きURLの再発行と件数の更新も一緒に乗る
      router.refresh();
    } catch {
      // fetch が投げるのは通信そのものの失敗（オフライン等）。**原因を断定しない**
      setProblem(NETWORK_MESSAGE);
    } finally {
      setDeleting(false);
    }
  }

  function close() {
    setIsOpen(false);
    // 次に開いたときに前回の失敗が残っていないようにする
    setProblem(null);
  }

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
        // 外枠（背景・Escape・背景クリック・初期フォーカス・縦並びのボタン）は ConfirmDialog。
        // **削除中は閉じない**（busy）。閉じても処理は止まらず、結果が見えなくなるだけ
        <ConfirmDialog
          heading="レシピを削除"
          cancelLabel="やめる"
          confirmLabel="削除する"
          busyLabel="削除中…"
          busy={deleting}
          onCancel={close}
          onConfirm={handleDelete}
        >
          {/* **どれを消すのか出す。** 「本当に削除しますか」だけでは確認にならない */}
          <p className="text-ink-control text-body">「{title}」を削除します。元に戻せません。</p>

          {/*
           * 失敗したときだけ出す。**ダイアログは閉じない**ので、そのまま再試行できる。
           * 文言はサーバーのものをそのまま使う（`messageFromResponse`）。
           * 資料「エラー表示（軽微）」に寄せた見た目。
           */}
          {problem !== null && (
            <p
              role="alert"
              className="bg-danger-soft border-danger-border text-danger-body rounded-sm border px-4 py-3 text-body"
            >
              {problem}
            </p>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
