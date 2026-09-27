/**
 * S-05 のヘッダー（引き継ぎ資料 README「Screens 6」/ recipe-edit design.md 6.1）。
 *
 * 左 `← 中止` ／ 中央「レシピを編集」／ 右「保存」の1段。
 *
 * **`position: sticky` で上に固定する**（design.md 6.2。資料の値ではなく判断）。
 * モックは「ヘッダー固定・本文だけスクロール」の形で、S-04 と同じく実アプリでは
 * `window` スクロール＋ sticky で再現する。**「保存」がいつでも押せる。**
 *
 * **状態は持たない。** 変更の有無・保存中かどうかは `RecipeEditor` が持ち、ここは描くだけ。
 */

type Props = {
  /** `← 中止`。変更の有無で破棄確認を挟むかは呼び出し側が決める（design.md 5.7） */
  onCancel: () => void;
  onSave: () => void;
  /** 保存中。「保存」を押せなくし、ラベルを「保存中…」にする（二重送信の1層目） */
  saving: boolean;
};

export function EditHeader({ onCancel, onSave, saving }: Props) {
  return (
    <header className="bg-header border-border sticky top-0 z-10 border-b">
      {/* 本文と同じ幅で中央寄せ。ヘッダーだけ端まで広がると位置が揃わない */}
      <div className="mx-auto flex w-full max-w-[640px] items-center justify-between gap-2 px-3 py-1.5">
        {/*
         * **「移動」の見た目**（面なし・枠なし・文字色 link ＋ 方向記号。recipe-view design.md 6.2）。
         * 押すと S-04 に戻るだけで、ダイアログを挟んでも見た目は変えない（design.md 6.4）。
         *
         * **`<Link>` ではなく `<button>`。** 変更があれば破棄確認を挟むため（決定③）。
         * `type="button"` を省かない（落とし穴 #N3）。
         */}
        <button
          type="button"
          onClick={onCancel}
          className="text-link flex h-[var(--size-tap)] items-center px-2 text-body"
        >
          ← 中止
        </button>

        {/*
         * **「レシピを編集」。資料の「材料を編集」から意図的に変えた**（食い違い9 / 決定①）。
         * 中身が材料だけでなくなったため。**資料を見て戻さない**（落とし穴 #N13）
         */}
        <h1 className="text-ink text-lead font-bold">レシピを編集</h1>

        {/*
         * 「保存」。面 primary・白文字・角丸8px・48px・17px・padding 10px 16px（README「Screens 6」）。
         * **資料が指定している主要ボタンの小型版**で、こちらが足した4種類目の見た目ではない（design.md 6.4）。
         * 保存中は README「ボタン」の「無効」（面 track / 文字 muted）。
         */}
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="bg-primary hover:bg-primary-dark disabled:bg-track disabled:text-muted flex h-[var(--size-tap)] items-center rounded-sm px-4 text-body text-white transition-colors duration-[120ms] disabled:cursor-not-allowed"
        >
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
    </header>
  );
}
