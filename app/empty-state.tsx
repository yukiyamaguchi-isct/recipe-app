import Link from "next/link";

/**
 * レシピが0件のときの表示（requirements.md Req3 / `UI_DESIGN.md` S-02）。
 *
 * **初回ユーザーが必ず通る画面。** 空のリストを見せると、壊れているのか
 * まだ何もしていないのかが分からない。**何をすれば並ぶのかまで書く。**
 *
 * 視覚仕様は引き継ぎ資料「空状態」＋「ボタン」。**推測で変えない。**
 */
export function EmptyState() {
  return (
    <div className="border-border-strong bg-header flex flex-col items-center gap-3.5 rounded-md border-[1.5px] border-dashed px-6 py-10 text-center">
      {/*
       * 56px角の枠付きアイコン。装飾なので読み上げからは外す
       * （下の見出しと説明で内容は伝わる）。
       */}
      <div
        aria-hidden="true"
        className="border-border-strong text-ink-sub grid size-14 place-items-center rounded-md border-2 text-[26px]"
      >
        ＋
      </div>

      <p className="text-ink text-lead font-bold">レシピなし</p>

      {/* max-width 26ch。1行が長すぎると視線が戻る位置を見失う（資料の指定） */}
      <p className="text-ink-control max-w-[26ch] text-body">
        料理本のページを撮影すると、材料と作り方を自動で読み取り。
      </p>

      {/*
       * 主要ボタン（面 --color-primary / 白 19px 700 / 56px / 角丸12px）。
       *
       * ⚠️ デザインHTMLのモックはこのボタンだけ 17px で描いているが、
       * **README の「ボタン」表が正**（主要 = 19px / 700）。食い違い8 として design.md に記録した。
       */}
      <Link
        href="/upload"
        className="bg-primary hover:bg-primary-dark mt-1 flex h-[var(--size-tap-lg)] items-center justify-center rounded-md px-7 text-lead font-bold text-white transition-colors duration-[120ms]"
      >
        写真を撮る
      </Link>
    </div>
  );
}
