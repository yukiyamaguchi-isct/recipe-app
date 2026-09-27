"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import type { Category } from "@/generated/prisma/enums";
import { INTERNAL_ERROR, type ApiResponseBody } from "@/lib/api-response";
import {
  NEW_INGREDIENT_CATEGORY,
  amountProblem,
  ingredientNameProblem,
  stepTextProblem,
  toContentsInput,
  type IngredientDraft,
  type StepDraft,
} from "@/lib/recipes/contents";

import { recipePath } from "../mode";
import { EditHeader } from "./edit-header";
import { ingredientAmountId, ingredientNameId, stepTextId } from "./field-ids";
import { IngredientFields, type IngredientErrors } from "./ingredient-fields";
import { StepFields, type StepErrors } from "./step-fields";

/**
 * S-05 の本体（recipe-edit design.md 5.5〜5.7）。**Client Component。**
 *
 * 下書きの state・保存・離脱ガードをここに集める。ヘッダーと各節は描くだけ。
 *
 * 材料（段階8）・手順（段階9）・保存（段階10）まで。離脱ガード（段階11）を足す（tasks.md）。
 */

/** Server Component から受け取る材料。**プレーンな値だけ**（`Date` を含めない） */
export type EditorIngredient = {
  id: string;
  name: string;
  amount: string | null;
  category: Category;
};

export type EditorStep = { id: string; text: string };

type Props = {
  recipeId: string;
  ingredients: EditorIngredient[];
  steps: EditorStep[];
};

/**
 * Server Component から来た材料を下書きにする。
 *
 * - **分量の `null` は空文字に**（`<input value>` に null を渡さない。落とし穴 #N16）
 * - **`key` は DB の id**（追加した行はクライアントで振る。5.5）
 */
function toIngredientDrafts(ingredients: EditorIngredient[]): IngredientDraft[] {
  return ingredients.map(({ id, name, amount, category }) => ({
    key: id,
    name,
    amount: amount ?? "",
    category,
  }));
}

/** 通信そのものの失敗（オフライン等）。**原因を断定しない**（`delete-dialog.tsx` と同じ文言） */
const NETWORK_MESSAGE = "通信に失敗しました。通信環境を確認して、もう一度お試しください。";

/**
 * 失敗レスポンスから画面に出す文言を取り出す。
 *
 * **JSONですら無い場合がある**（プロキシのエラーページなど）。そのときは `INTERNAL_ERROR` の
 * 文言に倒す。**クライアントで独自の文言を作らない**（`delete-dialog.tsx` / `recipe-title.tsx` と同じ流儀）。
 */
function messageFromResponse(text: string): string {
  try {
    const body = JSON.parse(text) as ApiResponseBody<unknown>;
    if (body.success === false && typeof body.error?.message === "string") {
      return body.error.message;
    }
  } catch {
    // JSON でなければ既定の文言に倒す
  }
  return INTERNAL_ERROR.message;
}

/**
 * 欄ごとのエラーと、最初に問題のある欄の id（design.md 5.6）。
 *
 * 規則は `lib/recipes/contents.ts`（サーバーの検証と同じモジュール）。**文言をここで作らない。**
 * 「最初」は画面の上から: 材料の行（材料名 → 分量）→ 手順。
 */
function fieldErrors(ingredients: IngredientDraft[], steps: StepDraft[], idPrefix: string) {
  const ingredientErrors: IngredientErrors = {};
  const stepErrors: StepErrors = {};
  let firstInvalidId: string | null = null;

  for (const draft of ingredients) {
    const name = ingredientNameProblem(draft);
    const amount = amountProblem(draft);
    ingredientErrors[draft.key] = { name, amount };

    if (firstInvalidId === null && name !== null) {
      firstInvalidId = ingredientNameId(idPrefix, draft.key);
    }
    if (firstInvalidId === null && amount !== null) {
      firstInvalidId = ingredientAmountId(idPrefix, draft.key);
    }
  }

  for (const step of steps) {
    const problem = stepTextProblem(step);
    stepErrors[step.key] = problem;

    if (firstInvalidId === null && problem !== null) {
      firstInvalidId = stepTextId(idPrefix, step.key);
    }
  }

  return { ingredientErrors, stepErrors, firstInvalidId };
}

export function RecipeEditor({
  recipeId,
  ingredients: initialIngredients,
  steps: initialSteps,
}: Props) {
  const router = useRouter();
  const idPrefix = useId();

  // **初期値は props から一度だけ作る。** 以降はこの state が正（design.md 5.5）
  const [ingredients, setIngredients] = useState(() => toIngredientDrafts(initialIngredients));
  const [steps, setSteps] = useState<StepDraft[]>(() =>
    initialSteps.map(({ id, text }) => ({ key: id, text })),
  );

  /**
   * 追加した行の key の連番（`new-1`, `new-2`, …）。
   * **配列の添字を key にしない**（落とし穴 #N4）。DB の id（cuid）とは形が違うので衝突しない。
   */
  const nextKey = useRef(0);

  /** 追加した行・手順の key。**材料と手順で同じ連番を使う**（節をまたいでも重ならない） */
  function newKey(): string {
    nextKey.current += 1;
    return `new-${nextKey.current}`;
  }

  function changeIngredient(key: string, patch: Partial<Omit<IngredientDraft, "key">>) {
    setIngredients((current) =>
      current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)),
    );
  }

  /** 末尾に空の行を足す。**カテゴリは「その他」**（design.md 4.4） */
  function addIngredient(): string {
    const key = newKey();

    setIngredients((current) => [
      ...current,
      { key, name: "", amount: "", category: NEW_INGREDIENT_CATEGORY },
    ]);

    return key;
  }

  function removeIngredient(key: string) {
    setIngredients((current) => current.filter((draft) => draft.key !== key));
  }

  function changeStep(key: string, text: string) {
    setSteps((current) => current.map((step) => (step.key === key ? { ...step, text } : step)));
  }

  /** 末尾に空の手順を足す。**並べ替えは無い**ので、足せるのは末尾だけ（決定①） */
  function addStep(): string {
    const key = newKey();
    setSteps((current) => [...current, { key, text: "" }]);
    return key;
  }

  function removeStep(key: string) {
    setSteps((current) => current.filter((step) => step.key !== key));
  }

  /**
   * `← 中止`。**段階5 では変更の有無を見ずに戻る。** 破棄確認は段階11。
   *
   * `replace` にする（design.md 4.2）。`push` にすると「戻る」で編集画面に戻ってくる（落とし穴 #N10）。
   * `router.back()` は URL 直打ちで開いたときに履歴が無く、アプリの外へ出る（落とし穴 #N9）。
   */
  function cancel() {
    router.replace(recipePath(recipeId));
  }

  /** 保存中（ボタンを「保存中…」にして押せなくする。二重送信の1層目） */
  const [saving, setSaving] = useState(false);

  /**
   * 二重送信の2層目（recipe-list 落とし穴 #31 と同じ多重防御）。
   *
   * **state ではなく ref でも持つ。** state の更新は次の描画まで反映されないので、
   * 同じ瞬間に2回押されると、どちらのハンドラも `saving === false` を見てしまう。
   */
  const savingRef = useRef(false);

  /** 保存の失敗の文言（サーバーのもの / 通信の失敗）。**ヘッダーの中に出す** */
  const [problem, setProblem] = useState<string | null>(null);

  /**
   * 欄ごとのエラーを出すか。**一度「保存」を押してから**（design.md 5.5）。
   * 入力中から「未入力」を出すと、行を追加した直後から赤くなる。一度押したら以降は打つたびに出し直す。
   */
  const [showErrors, setShowErrors] = useState(false);

  const errors = fieldErrors(ingredients, steps, idPrefix);

  /**
   * 「保存」（design.md 5.6）。
   *
   * 1. 二重送信を止める
   * 2. 欄ごとの検証。問題があれば**送らず**、最初の欄へフォーカス
   * 3. `toContentsInput()` で整えて `PUT`（空の行はここで捨てられる。4.4）
   * 4. 成功 → S-04 通常モードへ `replace`（4.2）。失敗 → 画面に留まり、**下書きを消さない**
   */
  async function save() {
    if (savingRef.current) {
      return;
    }

    setShowErrors(true);

    if (errors.firstInvalidId !== null) {
      // 入力欄は scroll-margin-top を持っているので、固定ヘッダーの下に潜らずに見える（field-styles.ts）
      document.getElementById(errors.firstInvalidId)?.focus();
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setProblem(null);

    try {
      const response = await fetch(`/api/recipes/${recipeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toContentsInput(ingredients, steps)),
      });

      if (response.ok) {
        // **replace。** 「戻る」で古い内容の編集画面に戻ってこない（落とし穴 #N10）。
        // 遷移が終わるまで「保存中…」のまま押せないようにしておく（保存中の state は戻さない）
        router.replace(recipePath(recipeId));
        return;
      }

      setProblem(messageFromResponse(await response.text()));
    } catch {
      // fetch が投げるのは通信そのものの失敗（オフライン等）。**原因を断定しない**
      setProblem(NETWORK_MESSAGE);
    }

    // ここに来るのは失敗したときだけ。**下書きはそのまま**なので、直してもう一度押せる
    savingRef.current = false;
    setSaving(false);
  }

  return (
    <>
      <EditHeader onCancel={cancel} onSave={save} saving={saving} problem={problem} />

      {/*
       * レスポンシブ: 単一カラムのまま max-width 640px で中央寄せ（引き継ぎ資料 Interactions）。
       * 本文 padding 16px / gap 14px（README「Screens 6」）
       */}
      <main className="mx-auto flex w-full max-w-[640px] flex-col gap-3.5 p-4">
        <IngredientFields
          idPrefix={idPrefix}
          ingredients={ingredients}
          errors={showErrors ? errors.ingredientErrors : {}}
          onChange={changeIngredient}
          onAdd={addIngredient}
          onRemove={removeIngredient}
        />
        {/* 材料の節の**下**に「作り方」の節（決定①） */}
        <StepFields
          idPrefix={idPrefix}
          steps={steps}
          errors={showErrors ? errors.stepErrors : {}}
          onChange={changeStep}
          onAdd={addStep}
          onRemove={removeStep}
        />
      </main>
    </>
  );
}
