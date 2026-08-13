import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

import { prisma } from "@/lib/prisma";

// ⚠️ PrismaAdapter の引数は型が効かない。
// アダプタは PrismaClient を `@prisma/client` から import しているが、Prisma 7 + output 指定の
// 構成ではそこに PrismaClient が無く、その型エラーが tsconfig の skipLibCheck に握り潰される。
// 結果、スキーマにフィールドが足りなくてもコンパイルは通り、初回ログインの実行時に初めて落ちる。
// スキーマ側の担保は __tests__/schema.test.ts にある。詳細は .kiro/specs/user-auth/design.md。
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),

  // AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET は Auth.js が環境変数から自動で読むため、引数を渡さない
  providers: [Google],

  // モバイルアプリから叩くことを見込んで jwt にしている（REQUIREMENTS.md 6章）。
  // DB にセッションを持たないため、Session / VerificationToken モデルは作っていない。
  session: { strategy: "jwt" },

  // 失敗時も Auth.js の既定画面ではなく S-01 に戻し、日本語のメッセージを出す
  pages: { signIn: "/login", error: "/login" },

  callbacks: {
    // jwt 戦略ではセッションが DB に無いため、userId をトークンに載せる。
    // user が入るのは初回ログイン時だけで、以降は token 側にしか無い。
    jwt({ token, user }) {
      if (user?.id) {
        token.userId = user.id;
      }
      return token;
    },

    session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId;
      }
      return session;
    },
  },
});
