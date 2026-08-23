import { notFound, redirect } from "next/navigation";

import { getUserId } from "@/lib/auth/session";
import { findRecipeForUser } from "@/lib/repositories/recipe";

import { StepList } from "./step-list";

/**
 * S-04 レシピ表示 / S-04c 確認モード。**アプリの中心画面**（`UI_DESIGN.md` S-04）。
 *
 * この段階ではタイトルだけを出す骨格。材料・手順・固定ヘッダー・確認モードは
 * 段階4以降で足す（`.kiro/specs/recipe-view/tasks.md`）。
 *
 * **認可の本体はここ。** proxy.ts を外してもこの保護は成立する
 * （`.kiro/specs/user-auth/design.md` 5章）。
 */
export default async function RecipePage(props: PageProps<"/recipes/[id]">) {
  // ⚠️ Next.js 16 では params が Promise。await を忘れると型は通るが実行時に
  // undefined になり、「見つかりません」が出るだけでエラーにならない（design.md 落とし穴 #1）
  const { id } = await props.params;

  // ⚠️ requireUserId() を使わない。あれは UnauthorizedError を投げる Route Handler 用で、
  // 画面で使うと /login へのリダイレクトではなくエラー画面になる（design.md 落とし穴 #5）。
  // 画面は app/page.tsx と同じく「取れなければ redirect」に揃える。
  const userId = await getUserId();

  if (!userId) {
    // redirect() の戻りは never なので、この後 userId は string に絞り込まれる
    redirect("/login");
  }

  const recipe = await findRecipeForUser(userId, id);

  // **「存在しない」と「他人のもの」を区別しない**（design.md 5.2）。
  // 出し分けると、IDを総当たりして他人のレシピの存在を確かめられる。
  if (!recipe) {
    notFound();
  }

  return (
    // レスポンシブ: この画面は単一カラムのまま max-width 640px で中央寄せ
    // （引き継ぎ資料 Responsive。1列/3列に切り替わるのは一覧だけ）
    <main className="mx-auto flex w-full max-w-[640px] flex-col gap-4 px-4 py-5">
      <h1 className="text-ink text-title font-bold">{recipe.title}</h1>

      <StepList steps={recipe.steps} />
    </main>
  );
}
