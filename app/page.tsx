import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { EmptyState } from "@/app/empty-state";
import { RecipeCard } from "@/app/recipe-card";
import { RecipeListHeader } from "@/app/recipe-list-header";
import { getRecipeImageUrl } from "@/lib/clients/s3";
import { formatRecipeDate } from "@/lib/recipes/date";
import { listRecipesForUser, type RecipeListItem } from "@/lib/repositories/recipe";

/**
 * S-02 レシピ一覧（`UI_DESIGN.md` S-02）。**ログイン後のホーム。**
 *
 * **Route Handler を経由しない**（recipe-list design.md 3章）。Server Component から
 * Repository と S3 クライアントを直接呼ぶ。HTTP を挟む理由が無く、挟むと往復の分だけ
 * 遅くなる（`REQUIREMENTS.md` 6.1 の「1秒以内」）。
 */

/** カードに渡す形。**`Date` を含まない**（design.md 落とし穴 #12）。 */
type CardData = {
  id: string;
  title: string;
  imageUrl: string | null;
  createdAt: string;
};

/**
 * 一覧の全件分の署名付きURLをまとめて発行する。
 *
 * **`Promise.all` を使わない**（design.md 落とし穴 #6）。1件でも reject すると全体が
 * reject するので、**URLが1件作れないだけで一覧そのものが開かなくなる。**
 * 保存済みの全レシピに辿り着けなくなるのは割に合わない。
 *
 * **署名の計算はローカルで完結し、AWS への通信は発生しない**（design.md 1.1）ので、
 * まとめて発行しても往復は増えない。
 */
async function toCards(recipes: RecipeListItem[]): Promise<CardData[]> {
  const urls = await Promise.allSettled(
    recipes.map((recipe) => getRecipeImageUrl(recipe.imageKey)),
  );

  return recipes.map((recipe, index) => {
    const result = urls[index];

    if (result.status === "rejected") {
      // **握り潰さない**（`.kiro/steering/architecture.md`）。カードは画像なしで描くが、
      // 設定不備に気づけるようサーバー側のログには残す。imageKey は内部情報なのでログのみ
      console.error("[recipes] 署名付きURLの発行に失敗した", {
        recipeId: recipe.id,
        cause: result.reason,
      });
    }

    return {
      id: recipe.id,
      title: recipe.title,
      imageUrl: result.status === "fulfilled" ? result.value : null,
      // **ここで文字列にする。** Date のまま渡すと実行時に落ちる（落とし穴 #12）
      createdAt: formatRecipeDate(recipe.createdAt),
    };
  });
}

export default async function Home() {
  const session = await auth();

  // 認可の本体はここ。proxy.ts を外してもこの保護は成立する（user-auth design.md 調査結果4）。
  // **`requireUserId()` を使わない。** 画面で使うと /login へのリダイレクトではなく
  // エラー画面になる（recipe-view design.md 落とし穴 #5 / recipe-list 落とし穴 #24）
  if (!session?.user?.id) {
    redirect("/login");
  }

  const recipes = await listRecipesForUser(session.user.id);
  const cards = await toCards(recipes);
  const isEmpty = cards.length === 0;

  return (
    <div className="flex flex-1 flex-col">
      <RecipeListHeader count={cards.length} />

      {isEmpty ? (
        <main className="p-4">
          <EmptyState />
        </main>
      ) : (
        /*
         * ⚠️ **一覧だけが 1列（〜767px）/ 3列（768px〜）**（引き継ぎ資料 Responsive）。
         * 他の画面は単一カラムのまま max-width 640px（recipe-view design.md 食い違い5）。
         */
        <main className="grid grid-cols-1 gap-4 p-4 md:grid-cols-3 md:gap-5 md:px-7 md:py-6">
          {cards.map((card) => (
            <RecipeCard key={card.id} {...card} />
          ))}
        </main>
      )}

      {/*
       * FAB。**0件のときは出さない。**
       *
       * 空状態がすでに「写真を撮る」の主要ボタンを持っており、ほぼ空白の画面に
       * **同じ行き先のボタンを2つ**置くことになるため。**これは資料の値ではなく判断**
       * （資料は空状態をコンポーネント単体で描いていて、FAB との同居を示していない）。
       *
       * ⚠️ 資料は FAB を position: absolute と書いているが、括弧書きで「実装は fixed」と
       * 明記している（落とし穴 #22）。モックがスマホ枠の中に描かれているための表記。
       */}
      {!isEmpty && (
        <Link
          href="/upload"
          aria-label="写真を撮る"
          className="bg-link shadow-e2 fixed right-5 bottom-6 grid size-16 place-items-center rounded-full text-[2rem] leading-none text-white"
        >
          <span aria-hidden="true">＋</span>
        </Link>
      )}
    </div>
  );
}
