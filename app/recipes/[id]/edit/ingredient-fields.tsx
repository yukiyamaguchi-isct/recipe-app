"use client";

import { useEffect, useId, useRef, useState } from "react";

import type { Category } from "@/generated/prisma/enums";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/recipes/category";
import { isBlankIngredient, type IngredientDraft } from "@/lib/recipes/contents";

import { ConfirmDialog } from "../../../confirm-dialog";
import {
  ADD_BUTTON_CLASS,
  CARD_CLASS,
  DANGER_SMALL_CLASS,
  FIELD_ERROR_CLASS,
  SECTION_HEADING_CLASS,
  fieldClass,
} from "./field-styles";
import { errorId, ingredientAmountId, ingredientNameId } from "./field-ids";

/**
 * S-05「材料」の節（引き継ぎ資料 README「Screens 6」/ recipe-edit design.md 6.1・6.2）。
 *
 * 材料1つ＝行カード1枚。1段目に材料名・分量（**材料名が左・分量が右**。recipe-view 6.5）、
 * 2段目にカテゴリ・削除。節の末尾に「＋ 行を追加」。**並べ替えはできない**（決定①）。
 *
 * **下書きの state は持たない。** `RecipeEditor` が持ち、ここは描いて変更を知らせるだけ。
 * ここが持つのは**画面だけの状態**（削除の確認中の行・追加直後のフォーカス先）。
 */

/** 行ごとの欄のエラー（`null` なら問題なし）。**保存を押すまでは渡さない**（design.md 5.5） */
export type IngredientErrors = Record<string, { name: string | null; amount: string | null }>;

type Props = {
  /** 欄の id の頭。`RecipeEditor` の `useId()`（保存時にフォーカスを移すのに使う。field-ids.ts） */
  idPrefix: string;
  ingredients: IngredientDraft[];
  errors: IngredientErrors;
  onChange: (key: string, patch: Partial<Omit<IngredientDraft, "key">>) => void;
  /** 末尾に空の行を足し、その `key` を返す（フォーカスを移すのに使う） */
  onAdd: () => string;
  onRemove: (key: string) => void;
};

/** ダイアログの本文に出す、その行の呼び名（design.md 5.8）。「材料名 分量」。空の欄は省く */
function rowName(draft: IngredientDraft): string {
  return [draft.name.trim(), draft.amount.trim()].filter((part) => part !== "").join(" ");
}

export function IngredientFields({
  idPrefix: fieldPrefix,
  ingredients,
  errors,
  onChange,
  onAdd,
  onRemove,
}: Props) {
  const idPrefix = useId();
  const headingId = `${idPrefix}-heading`;
  const nameId = (key: string) => ingredientNameId(fieldPrefix, key);

  const addButtonRef = useRef<HTMLButtonElement>(null);

  /** 削除の確認中の行。`null` ならダイアログは閉じている */
  const [pending, setPending] = useState<IngredientDraft | null>(null);

  /**
   * 次に描いたあとでフォーカスを移す先（design.md 6.2）。
   * - 追加した行の材料名の欄（追加して何も起きないように見えないように）
   * - 消したあとの「＋ 行を追加」（消したボタンと一緒にフォーカスが消えて迷子にならないように）
   *
   * **state ではなく ref。** 移したら用済みで、それ自体は描画に影響しない。
   * 下の effect は毎回の描画のあとに走り、予約があるときだけ動く。
   */
  const focusTarget = useRef<{ kind: "name"; key: string } | { kind: "add" } | null>(null);

  useEffect(() => {
    const target = focusTarget.current;

    if (target === null) {
      return;
    }

    focusTarget.current = null;

    if (target.kind === "name") {
      document.getElementById(nameId(target.key))?.focus();
    } else {
      addButtonRef.current?.focus();
    }
  });

  function add() {
    focusTarget.current = { kind: "name", key: onAdd() };
  }

  function remove(draft: IngredientDraft) {
    focusTarget.current = { kind: "add" };
    onRemove(draft.key);
  }

  /**
   * 「削除」。**全欄が空の行はダイアログを出さずに消す**（失うものが無い。requirements.md Req4）。
   * それ以外は確認を挟む（README Interactions「削除: 常に確認ダイアログを経由」）。
   */
  function requestRemove(draft: IngredientDraft) {
    if (isBlankIngredient(draft)) {
      remove(draft);
    } else {
      setPending(draft);
    }
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3.5">
      {/* 節の見出し（design.md 6.2。資料の編集画面は材料だけなので見出しが無いが、2節になると境目が要る） */}
      <h2 id={headingId} className={SECTION_HEADING_CLASS}>
        材料
      </h2>

      {ingredients.length > 0 && (
        <ul className="flex flex-col gap-3.5">
          {ingredients.map((draft, index) => {
            const nameFieldId = nameId(draft.key);
            const amountFieldId = ingredientAmountId(fieldPrefix, draft.key);
            const nameProblem = errors[draft.key]?.name ?? null;
            const amountProblem = errors[draft.key]?.amount ?? null;

            return (
              // **key は配列の添字にしない**（落とし穴 #N4）。途中の行を消すと後ろの行が別の要素に
              // 描き直され、フォーカスや変換中の文字が別の行へ移る
              <li key={draft.key} className={CARD_CLASS}>
                {/* 1段目: 材料名（伸びる・最小幅0）＋ 分量（幅96px・伸縮しない） */}
                <div className="flex gap-2.5">
                  <input
                    id={nameFieldId}
                    type="text"
                    value={draft.name}
                    onChange={(event) => onChange(draft.key, { name: event.target.value })}
                    placeholder="材料名"
                    aria-label={`材料名（${index + 1}行目）`}
                    aria-invalid={nameProblem !== null}
                    aria-describedby={nameProblem === null ? undefined : errorId(nameFieldId)}
                    className={`${fieldClass(nameProblem !== null)} min-w-0 flex-1 text-lead`}
                  />
                  <input
                    id={amountFieldId}
                    type="text"
                    value={draft.amount}
                    onChange={(event) => onChange(draft.key, { amount: event.target.value })}
                    placeholder="分量"
                    aria-label={`分量（${index + 1}行目）`}
                    aria-invalid={amountProblem !== null}
                    aria-describedby={amountProblem === null ? undefined : errorId(amountFieldId)}
                    className={`${fieldClass(amountProblem !== null)} w-24 flex-none text-lead`}
                  />
                </div>

                {/*
                 * 欄の下の補助文（README「フォーム入力」: 15px 赤。「未入力」）。
                 * **見えるラベルが無い**（モックどおり）ので、どの欄の話かを頭に付ける（「材料名：未入力」）
                 */}
                {nameProblem !== null && (
                  <p id={errorId(nameFieldId)} className={FIELD_ERROR_CLASS}>
                    材料名：{nameProblem}
                  </p>
                )}
                {amountProblem !== null && (
                  <p id={errorId(amountFieldId)} className={FIELD_ERROR_CLASS}>
                    分量：{amountProblem}
                  </p>
                )}

                {/* 2段目: カテゴリ（伸びる）＋ 削除（幅96px・危険スタイル） */}
                <div className="flex gap-2.5">
                  <select
                    value={draft.category}
                    onChange={(event) =>
                      onChange(draft.key, { category: event.target.value as Category })
                    }
                    aria-label={`カテゴリ（${index + 1}行目）`}
                    className={`${fieldClass(false)} min-w-0 flex-1 text-body`}
                  >
                    {/* 並びとラベルは S-04 のタブと共有（lib/recipes/category.ts。落とし穴 #N12） */}
                    {CATEGORY_ORDER.map((value) => (
                      <option key={value} value={value}>
                        {CATEGORY_LABELS[value]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => requestRemove(draft)}
                    aria-label={`${index + 1}行目を削除`}
                    className={DANGER_SMALL_CLASS}
                  >
                    削除
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* 「＋ 行を追加」: 枠 1.5px dashed link / 文字 link 19px 500 / 56px / 幅100% / 角丸12px（README「Screens 6」） */}
      <button ref={addButtonRef} type="button" onClick={add} className={ADD_BUTTON_CLASS}>
        ＋ 行を追加
      </button>

      {pending !== null && (
        <ConfirmDialog
          heading="この行を削除"
          cancelLabel="やめる"
          confirmLabel="削除する"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            remove(pending);
            setPending(null);
          }}
        >
          {/*
           * **「元に戻せません」を書かない**（落とし穴 #N15）。保存するまで確定せず、`← 中止` で戻せる。
           * 資料の見本（v2.dc.html L413）はこの一文を持つが、事実と違う文言を出さない
           */}
          <p className="text-ink-control text-body">「{rowName(pending)}」を削除します。</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
