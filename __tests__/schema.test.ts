import { describe, expect, it } from "vitest";

import { Category, Prisma } from "@/generated/prisma/client";

// このテストは Vitest の疎通確認を兼ねている。
// 通ることで以下が同時に確認できる:
//   - tsconfig の `@/*` エイリアスがテストからも解決される
//   - Prisma の生成物（generated/prisma）が import できる
//   - スキーマの Category が意図した3種のままである
describe("Prisma スキーマ", () => {
  it("材料のカテゴリは調味料・野菜・その他の3種である", () => {
    expect(Object.values(Category)).toEqual(["SEASONING", "VEGETABLE", "OTHER"]);
  });
});

// Auth.js の Prisma アダプタは型が効かない。
// アダプタは `PrismaClient` を `@prisma/client` から import しているが、Prisma 7 + output 指定の
// 構成ではそこに `PrismaClient` が無く、その型エラーが tsconfig の skipLibCheck に握り潰される。
// 結果、スキーマにフィールドが足りなくてもコンパイルは通り、初回ログインの実行時に初めて落ちる。
// そのぶんをここで見る。フィールド名の一覧は design.md の「調査結果6」を参照。
describe("Auth.js が要求するスキーマ", () => {
  it("Account はアダプタが渡してくるフィールドをすべて持つ", () => {
    // OAuth のレスポンスのキー名そのまま。リネームすると linkAccount が実行時に落ちる
    expect(Object.keys(Prisma.AccountScalarFieldEnum)).toEqual([
      "userId",
      "type",
      "provider",
      "providerAccountId",
      "refresh_token",
      "access_token",
      "expires_at",
      "token_type",
      "scope",
      "id_token",
      "session_state",
    ]);
  });

  it("User は createUser に渡される emailVerified を持つ", () => {
    // Auth.js は createUser({ ...profile, emailVerified: null }) を呼ぶ。
    // アダプタは undefined しか除去しないため、このフィールドが無いと落ちる
    expect(Object.keys(Prisma.UserScalarFieldEnum)).toContain("emailVerified");
  });
});
