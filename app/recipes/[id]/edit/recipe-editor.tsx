"use client";

import { useRouter } from "next/navigation";

import type { Category } from "@/generated/prisma/enums";

import { recipePath } from "../mode";
import { EditHeader } from "./edit-header";

/**
 * S-05 の本体（recipe-edit design.md 5.5〜5.7）。**Client Component。**
 *
 * 下書きの state・保存・離脱ガードをここに集める。ヘッダーと各節は描くだけ。
 *
 * **段階5 の時点ではヘッダーだけ。** 材料（段階8）・手順（段階9）・保存（段階10）・
 * 離脱ガード（段階11）を順に足す（tasks.md）。
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

export function RecipeEditor({ recipeId }: Props) {
  const router = useRouter();

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
      <main className="mx-auto flex w-full max-w-[640px] flex-col gap-3.5 p-4" />
    </>
  );
}
