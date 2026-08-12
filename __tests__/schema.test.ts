import { describe, expect, it } from "vitest";

import { Category } from "@/generated/prisma/client";

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
