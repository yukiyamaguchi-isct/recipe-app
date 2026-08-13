import type { DefaultSession } from "next-auth";

// Auth.js の Session["user"] には id が無い。
// session strategy が jwt のため、DB を引かずに userId を渡す経路が要る（auth.ts のコールバック）。
// その値をアプリ側から型付きで読めるようにする。
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

// 拡張先は `next-auth/jwt` ではなく `@auth/core/jwt`。
// 前者は後者を再エクスポートしているだけで JWT を宣言しておらず、拡張しても合流しない。
// （合流しないと JWT の index signature が効いて token.userId が unknown のままになる）
declare module "@auth/core/jwt" {
  interface JWT {
    userId?: string;
  }
}
