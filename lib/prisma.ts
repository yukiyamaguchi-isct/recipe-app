import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

// Prisma 7 では接続URLをスキーマに書けないため、実行時の接続はここでドライバアダプタに渡す。
// マイグレーション用の接続は prisma.config.ts 側（DIRECT_URL）で、こちらとは別物。
function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "環境変数 DATABASE_URL が設定されていません。.env.example を参考に .env を作成し、Neon のプール接続文字列（ホスト名に -pooler を含むもの）を設定してください。",
    );
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}

// Next.js の開発サーバーはホットリロードのたびにモジュールを再評価するため、
// 素直に new すると接続が増え続ける。グローバルに1つだけ保持する。
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
