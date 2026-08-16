import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";

/**
 * ログイン後のホーム。
 *
 * **Phase 4 で S-02（レシピ一覧）に差し替わる暫定の着地先。**
 * このフェーズでは認証が通っていることを確認できる最小限に留める。
 * ログアウトは UI_DESIGN.md ではヘッダーのメニューに置くとしているが、
 * ヘッダーは S-02 と一緒に作るため、ここでは仮置き。
 */
export default async function Home() {
  const session = await auth();

  // 認可の本体はここ。proxy.ts を外してもこの保護は成立する（design.md 調査結果4）
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <main className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">レシピ帳</h1>

        <p className="mt-3 text-sm leading-6 text-zinc-600">
          {session.user.name ?? session.user.email} さんでログインしています。
        </p>

        <p className="mt-6 text-sm leading-6 text-zinc-600">
          レシピの一覧はこの画面に表示されるようになります。写真のアップロードは次のフェーズで追加します。
        </p>

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button
            type="submit"
            className="mt-8 flex h-12 w-full items-center justify-center rounded-full border border-solid border-black/[.08] px-5 text-base font-medium transition-colors hover:bg-black/[.04]"
          >
            ログアウト
          </button>
        </form>
      </main>
    </div>
  );
}
