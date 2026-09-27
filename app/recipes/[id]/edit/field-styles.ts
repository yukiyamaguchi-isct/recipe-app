/**
 * S-05 の材料の節と作り方の節で共有する見た目（recipe-edit design.md 6.1）。
 *
 * **2つの節で同じ部品を使う**（決定①「手順カードは既存の部品だけで組む」）ので、
 * クラスを二重に書かない。片方だけ直して材料と手順で入力欄の見た目がずれるのを防ぐ。
 *
 * ⚠️ **クラス名は文字列のまま書く。** Tailwind は組み立てたクラス名を拾えない。
 * `.ts` も Tailwind の走査対象なので、ここに置いたクラスは CSS に出る。
 */

/**
 * 入力欄（README「Screens 6」の行カード: 最小 52px / padding 12px 14px / 枠 1.5px / 角丸 8px。
 * focus は README「フォーム入力」: 枠 link ＋ outline 3px accent-light）。
 * **行カードの中は「Screens 6」の寸法を採る**（食い違い11。「フォーム入力」の 56px ではない）。
 * 文字の大きさは呼び出し側で足す（入力欄 19px / select 17px）。
 *
 * **`scroll-margin-top` を持たせる。** 保存時に「未入力」の欄へフォーカスを移すと、ブラウザは
 * その欄が見えるところまでスクロールするが、**余白が無いと欄が固定ヘッダー（約61px）の下に潜る**
 * （design.md 5.6 の ⚠️。段階9 で見出しが潜るのを実際に見た）。ヘッダー＋失敗の表示の分を見込んで 128px。
 *
 * **エラー時は枠を赤にする**（README「フォーム入力」: 枠 `#B3261E`）。枠の色のクラスを
 * 2つ同時に付けると、どちらが勝つかが CSS の出力順で決まってしまうので、**どちらか1つだけ**付ける。
 */
export function fieldClass(invalid: boolean): string {
  return `${invalid ? "border-danger" : "border-border-strong"} bg-surface text-ink min-h-13 scroll-mt-32 rounded-sm border-[1.5px] px-3.5 py-3 focus:border-link focus:outline-3 focus:outline-accent-light`;
}

/** 欄の下に出す補助文（README「フォーム入力」: 15px `#B3261E`） */
export const FIELD_ERROR_CLASS = "text-danger text-meta";

/** 行カード（面 白 / 枠 1px / 角丸 12px / padding 14px / 縦 gap 10px） */
export const CARD_CLASS = "bg-surface border-border flex flex-col gap-2.5 rounded-md border p-3.5";

/** 行カードの中の削除ボタン（README「ボタン」の危険。幅 96px・伸縮しない） */
export const DANGER_SMALL_CLASS =
  "border-danger-border text-danger hover:bg-danger-soft bg-surface min-h-13 w-24 flex-none rounded-sm border-[1.5px] text-body transition-colors duration-[120ms]";

/** 「＋ 行を追加」「＋ 手順を追加」（枠 1.5px dashed link / 文字 link 19px 500 / 56px / 幅100% / 角丸 12px） */
export const ADD_BUTTON_CLASS =
  "border-link text-link hover:bg-primary-soft bg-surface h-[var(--size-tap-lg)] w-full rounded-md border-[1.5px] border-dashed text-lead font-medium transition-colors duration-[120ms]";

/** 節の見出し（S-04 の節見出しと同じ 22px 700。design.md 6.2） */
export const SECTION_HEADING_CLASS = "text-ink text-title font-bold";
