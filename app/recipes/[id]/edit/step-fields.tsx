"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import type { StepDraft } from "@/lib/recipes/contents";

import { ConfirmDialog } from "../../../confirm-dialog";
import {
  ADD_BUTTON_CLASS,
  CARD_CLASS,
  DANGER_SMALL_CLASS,
  FIELD_CLASS,
  SECTION_HEADING_CLASS,
} from "./field-styles";

/**
 * S-05「作り方」の節（決定① / recipe-edit design.md 6.2）。
 *
 * **資料に視覚仕様が無いので、既存の部品だけで組む**: 手順番号の丸（README「手順リスト」）＋
 * 本文の入力欄（行カードの入力欄と同じ見た目。**複数行**）＋ 削除（危険スタイル）。
 * 節の末尾に「＋ 手順を追加」（「＋ 行を追加」と同じ破線ボタン）。
 *
 * **並べ替えはできない**（決定①）。できるのは本文の修正・削除・末尾への追加だけ。
 * 番号は画面上の並び順（1から）で、削除すると詰め直される。
 *
 * 作りは `ingredient-fields.tsx` と揃えてある。**下書きの state は持たない**。
 */

type Props = {
  steps: StepDraft[];
  onChange: (key: string, text: string) => void;
  /** 末尾に空の手順を足し、その `key` を返す（フォーカスを移すのに使う） */
  onAdd: () => string;
  onRemove: (key: string) => void;
};

export function StepFields({ steps, onChange, onAdd, onRemove }: Props) {
  const idPrefix = useId();
  const headingId = `${idPrefix}-heading`;
  const textId = (key: string) => `${idPrefix}-text-${key}`;

  const addButtonRef = useRef<HTMLButtonElement>(null);

  /** 削除の確認中の手順（番号はダイアログの本文に使う）。`null` なら閉じている */
  const [pending, setPending] = useState<{ step: StepDraft; number: number } | null>(null);

  /**
   * 次に描いたあとでフォーカスを移す先（`ingredient-fields.tsx` と同じ仕組み。design.md 6.2）。
   * **state ではなく ref。** 移したら用済みで、それ自体は描画に影響しない。
   */
  const focusTarget = useRef<{ kind: "text"; key: string } | { kind: "add" } | null>(null);

  useEffect(() => {
    const target = focusTarget.current;

    if (target === null) {
      return;
    }

    focusTarget.current = null;

    if (target.kind === "text") {
      document.getElementById(textId(target.key))?.focus();
    } else {
      addButtonRef.current?.focus();
    }
  });

  function add() {
    focusTarget.current = { kind: "text", key: onAdd() };
  }

  function remove(step: StepDraft) {
    focusTarget.current = { kind: "add" };
    onRemove(step.key);
  }

  /** 「削除」。**空の手順はダイアログを出さずに消す**（失うものが無い。requirements.md Req4） */
  function requestRemove(step: StepDraft, number: number) {
    if (step.text.trim() === "") {
      remove(step);
    } else {
      setPending({ step, number });
    }
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3.5">
      <h2 id={headingId} className={SECTION_HEADING_CLASS}>
        作り方
      </h2>

      {steps.length > 0 && (
        // 順序リスト。読み上げに「何番目か」が伝わる（S-04 の step-list.tsx と同じ理由）
        <ol className="flex flex-col gap-3.5">
          {steps.map((step, index) => {
            const number = index + 1;

            return (
              // **key は配列の添字にしない**（落とし穴 #N4）
              <li key={step.key} className={CARD_CLASS}>
                {/* 1段目: 番号の丸 ＋ 本文（gap 16px、上揃え。README「手順リスト」） */}
                <div className="flex items-start gap-4">
                  {/*
                   * 番号: 40px の丸、面 primary-soft、文字 link 19px 700（README「手順リスト」）。
                   * 番号は入力欄のラベル（「手順3の本文」）でも伝わるので、読み上げからは外す
                   */}
                  <span
                    aria-hidden="true"
                    className="bg-primary-soft text-link mt-1.5 grid size-10 flex-none place-items-center rounded-full text-lead font-bold"
                  >
                    {number}
                  </span>
                  <StepText
                    id={textId(step.key)}
                    value={step.text}
                    number={number}
                    onChange={(text) => onChange(step.key, text)}
                  />
                </div>

                {/* 2段目: 右端に削除（行カードの「2段目の右端に削除」と揃える） */}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => requestRemove(step, number)}
                    aria-label={`手順${number}を削除`}
                    className={DANGER_SMALL_CLASS}
                  >
                    削除
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <button ref={addButtonRef} type="button" onClick={add} className={ADD_BUTTON_CLASS}>
        ＋ 手順を追加
      </button>

      {pending !== null && (
        <ConfirmDialog
          heading="この手順を削除"
          cancelLabel="やめる"
          confirmLabel="削除する"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            remove(pending.step);
            setPending(null);
          }}
        >
          {/* **「元に戻せません」を書かない**（落とし穴 #N15）。保存前は `← 中止` で戻せる */}
          <p className="text-ink-control text-body">手順{pending.number}を削除します。</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

/**
 * 手順の本文の入力欄。**複数行で、中身に合わせて高さが伸びる**（決定① / design.md 6.2）。
 *
 * 3行ぶんの高さから始め、それより長い本文は**欄ごと伸ばして全文を見せる**。
 * 固定の高さのままだと、料理本の手順（1つで4〜10行になる。✅ 段階9 の実データ）が欄の中で切れ、
 * スマホでは小さな欄の中をスクロールしながら直すことになる。
 *
 * 高さは描画のたびに `scrollHeight` を測って合わせる（いったん `auto` に戻してから測るので、
 * 文字を消したときは縮む）。**`useLayoutEffect`** にするのは、描画の前に高さを決めて
 * 1フレームだけ欄が潰れて見えるのを避けるため。
 */
function StepText({
  id,
  value,
  number,
  onChange,
}: {
  id: string;
  value: string;
  number: number;
  onChange: (text: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // 本文が変わったとき（打つ・消す）と、画面の幅が変わったとき（スマホの回転）に測り直す。
  // 幅が変わると折り返しが変わり、必要な高さも変わる
  useLayoutEffect(() => {
    const textarea = ref.current;

    if (!textarea) {
      return;
    }

    const fit = () => {
      textarea.style.height = "auto";

      // jsdom はレイアウトを持たず scrollHeight が 0 になる。0 を入れると欄が潰れるので、
      // 測れたときだけ合わせる（`rows={3}` の高さが下限として残る）
      //
      // `scrollHeight` は枠を含まないが、`box-sizing: border-box` の `height` は枠を含む。
      // 枠の厚み（上下 1.5px ずつ）を足さないと、最後の行が 3px 切れる（✅ 段階9 で実測）
      if (textarea.scrollHeight > 0) {
        const border = textarea.offsetHeight - textarea.clientHeight;
        textarea.style.height = `${textarea.scrollHeight + border}px`;
      }
    };

    fit();
    window.addEventListener("resize", fit, { passive: true });
    return () => window.removeEventListener("resize", fit);
  }, [value]);

  return (
    // 3行ぶんの高さから（rows）。行間は S-04 の手順本文（1.9）に揃える
    // （README「フォーム入力」に行間の指定が無いため）。**伸びるので手でのリサイズと内側のスクロールは切る**
    <textarea
      ref={ref}
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={3}
      placeholder="手順"
      aria-label={`手順${number}の本文`}
      className={`${FIELD_CLASS} min-w-0 flex-1 resize-none overflow-hidden text-lead leading-[1.9]`}
    />
  );
}
