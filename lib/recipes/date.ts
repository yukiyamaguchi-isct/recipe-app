/**
 * レシピの作成日の表示（requirements.md Req1）。
 *
 * 形式は **「2026年8月12日」**（引き継ぎ資料「レシピカード」の確定値）。
 *
 * **このファイルはサーバー専用の依存を持たない。** `lib/recipes/title.ts` と同じ扱いで、
 * Prisma や sharp に触れるものを足さないこと（recipe-view design.md 落とし穴 #27）。
 */

/**
 * 表示に使うタイムゾーン。
 *
 * **⚠️ 省略してはいけない。** `Intl.DateTimeFormat` は `timeZone` を省くと
 * 実行環境の既定を使う。**Vercel の関数は UTC、手元は JST** なので、省くと
 * **ローカルでは正しく見えて本番でだけ日付が1日ずれる。**
 *
 * ずれるのは「日本時間の朝9時より前に保存したレシピ」。UTC ではまだ前日のため。
 */
const DISPLAY_TIME_ZONE = "Asia/Tokyo";

/**
 * `Intl.DateTimeFormat` はモジュール読み込み時に1つ作って使い回す。
 *
 * 生成はロケールデータの解決を伴うので、一覧の全件分を描くたびに作り直さない。
 */
const FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  timeZone: DISPLAY_TIME_ZONE,
  year: "numeric",
  month: "long",
  day: "numeric",
});

/**
 * 作成日を「2026年8月12日」の形にする。
 *
 * **⚠️ 呼ぶのは Server Component。** 整形した**文字列**を Client Component へ渡す。
 * `Date` をそのまま渡すと実行時に「Only plain objects can be passed」で落ちる
 * （recipe-view design.md 落とし穴 #15）。**ビルドでは捕まらない。**
 *
 * **見分け方**: UTC の `2026-08-11T23:00:00Z`（JST では8月12日の朝8時）が
 * 「2026年8月12日」になること。「2026年8月11日」なら `timeZone` が効いていない。
 */
export function formatRecipeDate(date: Date): string {
  return FORMATTER.format(date);
}
