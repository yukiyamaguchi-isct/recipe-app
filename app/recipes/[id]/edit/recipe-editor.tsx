"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import type { Category } from "@/generated/prisma/enums";
import {
  NEW_INGREDIENT_CATEGORY,
  type IngredientDraft,
  type StepDraft,
} from "@/lib/recipes/contents";

import { recipePath } from "../mode";
import { EditHeader } from "./edit-header";
import { IngredientFields } from "./ingredient-fields";
import { StepFields } from "./step-fields";

/**
 * S-05 の本体（recipe-edit design.md 5.5〜5.7）。**Client Component。**
 *
 * 下書きの state・保存・離脱ガードをここに集める。ヘッダーと各節は描くだけ。
 *
 * 材料（段階8）・手順（段階9）まで。保存（段階10）・離脱ガード（段階11）を順に足す（tasks.md）。
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

export function RecipeEditor({
  recipeId,
  ingredients: initialIngredients,
  steps: initialSteps,
}: Props) {
  const router = useRouter();

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

  /** 「保存」。**段階10 で実装する。** それまでは何もしない */
  function save() {}

  return (
    <>
      <EditHeader onCancel={cancel} onSave={save} saving={false} />

      {/*
       * レスポンシブ: 単一カラムのまま max-width 640px で中央寄せ（引き継ぎ資料 Interactions）。
       * 本文 padding 16px / gap 14px（README「Screens 6」）
       */}
      <main className="mx-auto flex w-full max-w-[640px] flex-col gap-3.5 p-4">
        <IngredientFields
          ingredients={ingredients}
          onChange={changeIngredient}
          onAdd={addIngredient}
          onRemove={removeIngredient}
        />
        {/* 材料の節の**下**に「作り方」の節（決定①） */}
        <StepFields steps={steps} onChange={changeStep} onAdd={addStep} onRemove={removeStep} />
      </main>
    </>
  );
}
