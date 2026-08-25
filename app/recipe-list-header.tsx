import { signOut } from "@/auth";

/**
 * 一覧のヘッダー（recipe-list design.md 6.1 / 6.2）。
 *
 * 資料「Screens 2」は「左『レシピ』22px 700、右 件数 15px」。
 * **ログアウトの居場所は資料に無い**ので、2026-08-25 のユーザー決定で右端に置いた（6.2）。
 *
 * **S-04 の固定ヘッダーと違い、これは sticky にしない。** 一覧はスクロールして
 * カードを見る画面で、ヘッダーに常時アクセスする必要がない。追加は FAB が担う。
 */

type Props = {
  /** 保存件数。**0 件でも出す**（空状態でも「0件」と分かるほうが迷わない） */
  count: number;
};

export function RecipeListHeader({ count }: Props) {
  return (
    <header className="bg-header border-border flex items-center gap-3 border-b p-5">
      <h1 className="text-ink text-title font-bold">レシピ</h1>

      {/* 件数はタイトルの隣。ログアウトを右端に置くので margin-left: auto は使わない */}
      <p className="text-ink-sub text-meta">{count}件</p>

      <form
        // ⚠️ Server Action のまま移設した（暫定ホームで動いていた形を変えない）。
        // このファイルは Server Component のままでよい。
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
        className="ml-auto"
      >
        {/*
         * 見た目は「操作」＝枠線ボタン（design.md 6.2）。押すとログイン状態が変わるため。
         * **面なしのテキストリンクにしない。** それは「移動」の見た目で、
         * 「移動 / 操作 / 絞り込み」の描き分けが壊れる（落とし穴 #21）。
         */}
        <button
          type="submit"
          className="border-link text-link hover:bg-primary-soft flex h-[var(--size-tap)] items-center justify-center rounded-sm border-[1.5px] px-4 text-body font-medium transition-colors duration-[120ms]"
        >
          ログアウト
        </button>
      </form>
    </header>
  );
}
