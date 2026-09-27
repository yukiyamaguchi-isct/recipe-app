import { describe, expect, it } from "vitest";

import { Category } from "@/generated/prisma/enums";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/recipes/category";

describe("lib/recipes/category", () => {
  it("**画面の並びは 野菜 → 調味料 → その他**（enum の順ではない。落とし穴 #6）", () => {
    expect(CATEGORY_ORDER.map((value) => CATEGORY_LABELS[value])).toEqual([
      "野菜",
      "調味料",
      "その他",
    ]);
  });

  it("enum の全ての値を1回ずつ含む（足し忘れ・重複が無い）", () => {
    expect([...CATEGORY_ORDER].sort()).toEqual(Object.values(Category).sort());
  });
});
