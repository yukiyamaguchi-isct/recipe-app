import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";

/**
 * 本文書体。design.md 6.2.1 の確定事項（Noto Sans JP / 400・500・700）。
 *
 * **`weight` を指定せず可変フォントを使う。** 3ウェイトを個別に取ると、Google Fonts が
 * 日本語を100本以上の unicode-range サブセットに分割している分だけファイル数が3倍になる。
 * 可変フォント1本で 400 / 500 / 700 すべてを出せる。
 *
 * **`subsets` は preload の対象を決めるだけで、取得する字形の範囲ではない**
 * （`next/dist/compiled/@next/font/dist/google/find-font-files-in-css.js`）。
 * 日本語の字形は unicode-range により必要な分だけ後から読まれる。
 */
const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // 「レシピ帳」は Phase 1 で実装した S-01 / ホームの見出しに合わせている。
  // ⚠️ デザイン資料は S-01 のタイトルを「レシピを撮る」としており食い違う（design.md 6.2.5）
  title: "レシピ帳",
  description: "料理本のレシピを撮って保存できるアプリ。写真から材料と作り方を読み取ります。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // lang は日本語UIなので ja。en のままだと読み上げ・ハイフネーションが英語として扱われる
    <html lang="ja" className={`${notoSansJP.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
