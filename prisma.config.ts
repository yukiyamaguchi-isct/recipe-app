// Prisma CLI（migrate / studio など）の設定。
// Prisma 7 から、接続URLはスキーマではなくここに書く。
// 実行時のアプリからの接続は lib/prisma.ts のドライバアダプタが担当する（別物）。
//
// `.env` は自動では読まれないため、明示的に読み込む。
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // マイグレーションは Neon の「直接接続」を使う。
    // プーラー（PgBouncer）経由ではDDLが正しく流れないため。
    url: env("DIRECT_URL"),
  },
});
