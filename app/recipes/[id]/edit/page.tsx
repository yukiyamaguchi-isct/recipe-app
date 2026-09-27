import { notFound, redirect } from "next/navigation";

import { getUserId } from "@/lib/auth/session";
import { findRecipeForUser } from "@/lib/repositories/recipe";

import { RecipeEditor } from "./recipe-editor";

/**
 * S-05 レシピ編集（`UI_DESIGN.md` S-05 / recipe-edit design.md 5.4）。
 *
 * **認可と取得は S-04（`../page.tsx`）と同じ流儀。** 認可の本体はここで、
 * proxy.ts を外してもこの保護は成立する（`.kiro/specs/user-auth/design.md` 5章）。
 *
 * **`not-found.tsx` をこのフォルダに置かない。** `notFound()` は最も近い親の境界まで伝わるので、
 * `app/recipes/[id]/not-found.tsx`（「レシピが見つかりません」＋一覧へ）がそのまま使える
 * （design.md 1.2。📄 `not-found.md` L167-169）。
 */
export default async function RecipeEditPage(props: PageProps<"/recipes/[id]/edit">) {
  // ⚠️ Next.js 16 では params が Promise。await を忘れると型は通るが実行時に
  // undefined になり、「見つかりません」が出るだけでエラーにならない（recipe-view 落とし穴 #1）
  const { id } = await props.params;

  // ⚠️ requireUserId() を使わない。画面で使うと /login へのリダイレクトではなく
  // エラー画面になる（recipe-view 落とし穴 #5）
  const userId = await getUserId();

  if (!userId) {
    redirect("/login");
  }

  const recipe = await findRecipeForUser(userId, id);

  // **「存在しない」と「他人のもの」を区別しない**（recipe-view design.md 5.2）
  if (!recipe) {
    notFound();
  }

  // **プレーンな値だけ渡す。** `Date` を Client Component に渡すと実行時に落ちる
  // （recipe-view 落とし穴 #15）。createdAt / updatedAt / imageKey はこの画面で使わない
  return (
    <RecipeEditor
      recipeId={recipe.id}
      ingredients={recipe.ingredients.map(({ id, name, amount, category }) => ({
        id,
        name,
        amount,
        category,
      }))}
      steps={recipe.steps.map(({ id, text }) => ({ id, text }))}
    />
  );
}
