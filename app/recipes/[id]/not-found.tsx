import Link from "next/link";

/**
 * レシピを開けなかったときの画面（requirements.md Req6）。
 *
 * **「存在しない」と「他人のもの」の両方がここへ来る**（design.md 5.2）。
 * どちらなのかを文言でも出し分けない。出し分けると、IDを総当たりして
 * 他人のレシピの存在を確かめられる。
 *
 * **内部情報（IDの生値・例外メッセージ・スタックトレース）を出さない。**
 */
export default function RecipeNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-col gap-4 px-4 py-8">
      <h1 className="text-ink text-title font-bold">レシピが見つかりません</h1>

      <p className="text-ink-sub text-body">
        削除されたか、URLが違う可能性があります。ご自分で保存したレシピかどうかもご確認ください。
      </p>

      {/*
       * ⚠️ この画面を行き止まりにしない（design.md 落とし穴 #24）。
       *
       * **Phase 4 で `/` が S-02（レシピ一覧）になったので、リンク先は変えずラベルだけ直した**
       * （recipe-list design.md 6.6）。Phase 3 の申し送りは「S-02 に差し替える」だったが、
       * 元から `/` を指していたため実際に必要だったのはラベルの変更だけ。
       */}
      <Link
        href="/"
        className="border-link text-link hover:bg-primary-soft flex h-[var(--size-tap-lg)] w-full items-center justify-center rounded-md border-[1.5px] px-6 text-lead font-medium transition-colors duration-[120ms]"
      >
        レシピ一覧へ戻る
      </Link>
    </main>
  );
}
