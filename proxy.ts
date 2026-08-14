// Next.js 16 で middleware は proxy に改名された。export 名も `proxy` にする。
// Auth.js のドキュメントは `export { auth as middleware }` と書いてあるので読み替えが要る。
//
// 未ログインのアクセスを /login へ先回りでリダイレクトする。判定は auth.ts の
// authorized コールバック。**これは体感を良くするためのもので、認可の本体ではない。**
// matcher の変更やルートの移動で保護が静かに外れうるため、本体は各 Server Component /
// Route Handler の auth() 側に置いてある（design.md 調査結果4）。
export { auth as proxy } from "@/auth";

export const config = {
  // 静的アセットを除外する。ここに認証をかけると CSS / JS / 画像が読めなくなる。
  // api を除外するのは、Auth.js 自身のエンドポイント（/api/auth/*）を通すため。
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
