import Link from "next/link";

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
  /**
   * 0件なら「＋ 新規」を出さない。**空状態が同じ行き先の主要ボタンを持っている**ため
   * （FAB と同じ判断。design.md 6.1 の「空状態のとき FAB を出さない」）。
   */
  showNewButton: boolean;
};

export function RecipeListHeader({ count, showNewButton }: Props) {
  return (
    // padding はモバイル 20px / PC 20px 28px（PCモック `v2.dc.html` L575）
    <header className="bg-header border-border flex items-center gap-3 border-b p-5 md:px-7">
      <h1 className="text-ink text-title font-bold">レシピ</h1>

      {/* 件数はタイトルの隣。右端の要素を ml-auto で押しやる */}
      <p className="text-ink-sub text-meta">{count}件</p>

      {/*
       * ⚠️ 右側は1つの塊にして、**`ml-auto` はこの div にだけ付ける。**
       * 子それぞれに付けると、flex の auto マージンが余白を分け合って
       * 「＋ 新規」が中途半端な位置に来る。
       */}
      <div className="ml-auto flex items-center gap-3">
        {/*
         * ⚠️ **PC だけに出す。** スマホでは FAB が同じ役割を担うので、両方出すと
         * 同じ行き先のボタンが2つになる。**PCモック（`v2.dc.html` L577）に FAB は無く、
         * ヘッダーの「＋ 新規」に置き換わっている。**
         *
         * 主要ボタンだが、ヘッダー内なので高さは 48px（モックの min-height 48px）。
         * 56px は画面本体の主要ボタンの値で、ヘッダーには入らない。
         */}
        {showNewButton && (
          <Link
            href="/upload"
            className="bg-primary hover:bg-primary-dark hidden h-[var(--size-tap)] items-center justify-center rounded-md px-[22px] text-body font-bold text-white transition-colors duration-[120ms] md:inline-flex"
          >
            ＋ 新規
          </Link>
        )}

        <form
          // ⚠️ Server Action のまま移設した（暫定ホームで動いていた形を変えない）。
          // このファイルは Server Component のままでよい。
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
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
      </div>
    </header>
  );
}
