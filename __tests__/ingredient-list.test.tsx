import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IngredientList } from "@/app/recipes/[id]/ingredient-list";
import { Category } from "@/generated/prisma/client";

const RECIPE_ID = "clr1a2b3c4d5e6f7g8h9";

/**
 * `findRecipeForUser` が返す形（`order` の昇順）。
 * **カテゴリ順には並んでいない**（保存は原文の順序。design.md 2章）。
 */
const INGREDIENTS = [
  {
    id: "i1",
    recipeId: RECIPE_ID,
    name: "じゃがいも",
    amount: "3個",
    category: Category.VEGETABLE,
    order: 0,
  },
  {
    id: "i2",
    recipeId: RECIPE_ID,
    name: "牛こま切れ肉",
    amount: "200g",
    category: Category.OTHER,
    order: 1,
  },
  {
    id: "i3",
    recipeId: RECIPE_ID,
    name: "しょうゆ",
    amount: "大さじ2",
    category: Category.SEASONING,
    order: 2,
  },
  {
    id: "i4",
    recipeId: RECIPE_ID,
    name: "玉ねぎ",
    amount: "1個",
    category: Category.VEGETABLE,
    order: 3,
  },
  {
    id: "i5",
    recipeId: RECIPE_ID,
    name: "こしょう",
    amount: "少々",
    category: Category.SEASONING,
    order: 4,
  },
];

describe("IngredientList", () => {
  it("材料を全件表示する", () => {
    render(<IngredientList ingredients={INGREDIENTS} servings={4} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("材料名を表示する", () => {
    render(<IngredientList ingredients={INGREDIENTS} servings={4} />);

    expect(screen.getByText("じゃがいも")).toBeDefined();
    expect(screen.getByText("牛こま切れ肉")).toBeDefined();
  });

  it("分量をそのままの文字列で表示する（requirements.md Req1）", () => {
    render(<IngredientList ingredients={INGREDIENTS} servings={4} />);

    // 「少々」を数値に直したりしない
    expect(screen.getByText("少々")).toBeDefined();
    expect(screen.getByText("大さじ2")).toBeDefined();
  });

  it("分量が無い材料でも材料名が出る", () => {
    render(
      <IngredientList
        ingredients={[
          {
            id: "x",
            recipeId: RECIPE_ID,
            name: "塩",
            amount: null,
            category: Category.SEASONING,
            order: 0,
          },
        ]}
        servings={null}
      />,
    );

    expect(screen.getByText("塩")).toBeDefined();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });
});

/**
 * 見出しの人数（design.md 5.5 / 落とし穴 #7）。
 * **読み取れなかった人数を勝手な数字で埋めない。**
 */
describe("見出しの人数", () => {
  it("servings があれば「材料（4人分）」", () => {
    render(<IngredientList ingredients={INGREDIENTS} servings={4} />);

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("材料（4人分）");
  });

  it("servings が null なら「材料」だけで、数字が出ない", () => {
    render(<IngredientList ingredients={INGREDIENTS} servings={null} />);

    const heading = screen.getByRole("heading", { level: 2 });

    expect(heading.textContent).toBe("材料");
    expect(heading.textContent).not.toMatch(/[0-9０-９]/);
  });

  it("servings が 1 でも丸めずそのまま出す", () => {
    render(<IngredientList ingredients={INGREDIENTS} servings={1} />);

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("材料（1人分）");
  });
});

/**
 * カテゴリの並び（design.md 5.4 / 落とし穴 #6）。
 *
 * **`schema.prisma` の enum は SEASONING / VEGETABLE / OTHER の順**で、
 * 画面の 野菜 / 調味料 / その他 とは違う。enum 順に依存していないことを固定する。
 */
describe("カテゴリの並び", () => {
  it("野菜 → 調味料 → その他 の順で並べる", () => {
    render(<IngredientList ingredients={INGREDIENTS} servings={4} />);

    const labels = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);

    expect(labels[0]).toContain("野菜");
    expect(labels[1]).toContain("調味料");
    expect(labels[2]).toContain("その他");
  });

  it("enum の宣言順（調味料が先）にならない", () => {
    render(<IngredientList ingredients={INGREDIENTS} servings={4} />);

    const labels = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);

    expect(labels[0]).not.toContain("調味料");
  });

  it("材料をカテゴリごとにまとめる", () => {
    render(<IngredientList ingredients={INGREDIENTS} servings={4} />);

    const vegetables = screen.getByRole("heading", { level: 3, name: /野菜/ }).parentElement;

    expect(within(vegetables as HTMLElement).getByText("じゃがいも")).toBeDefined();
    expect(within(vegetables as HTMLElement).getByText("玉ねぎ")).toBeDefined();
  });

  it("カテゴリ内では order の順序を保つ（並べ替えない）", () => {
    render(<IngredientList ingredients={INGREDIENTS} servings={4} />);

    const vegetables = screen.getByRole("heading", { level: 3, name: /野菜/ }).parentElement;
    const names = within(vegetables as HTMLElement)
      .getAllByRole("listitem")
      .map((li) => li.textContent);

    expect(names[0]).toContain("じゃがいも");
    expect(names[1]).toContain("玉ねぎ");
  });

  it("カテゴリ見出しに件数を出す", () => {
    render(<IngredientList ingredients={INGREDIENTS} servings={4} />);

    expect(screen.getByRole("heading", { level: 3, name: /野菜/ }).textContent).toContain("2");
  });

  it("材料が1件も無いカテゴリは見出しごと出さない", () => {
    render(
      <IngredientList
        ingredients={[
          {
            id: "x",
            recipeId: RECIPE_ID,
            name: "塩",
            amount: null,
            category: Category.SEASONING,
            order: 0,
          },
        ]}
        servings={null}
      />,
    );

    expect(screen.queryByRole("heading", { level: 3, name: /野菜/ })).toBeNull();
    expect(screen.getByRole("heading", { level: 3, name: /調味料/ })).toBeDefined();
  });
});

describe("段階7 のページ内移動の着地点", () => {
  it("セクションに id=ingredients を置く", () => {
    const { container } = render(<IngredientList ingredients={INGREDIENTS} servings={4} />);

    expect(container.querySelector("#ingredients")).not.toBeNull();
  });
});

describe("材料が無いレシピ", () => {
  // Phase 2 は材料も手順も空のまま保存できる（recipe-repository.test.ts で固定済み）。
  it("空でも落ちず、その旨を表示する", () => {
    render(<IngredientList ingredients={[]} servings={null} />);

    expect(screen.getByText("材料が登録されていません。")).toBeDefined();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("空でも見出しは出す", () => {
    render(<IngredientList ingredients={[]} servings={4} />);

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("材料（4人分）");
  });
});
