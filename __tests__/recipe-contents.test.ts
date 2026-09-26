import { describe, expect, it } from "vitest";

import { Category } from "@/generated/prisma/enums";
import {
  EMPTY_FIELD_MESSAGE,
  EMPTY_NAME_CONTENTS_MESSAGE,
  EMPTY_STEP_CONTENTS_MESSAGE,
  INVALID_CATEGORY_MESSAGE,
  MAX_AMOUNT_LENGTH,
  MAX_INGREDIENT_NAME_LENGTH,
  MAX_INGREDIENTS,
  MAX_STEP_LENGTH,
  MAX_STEPS,
  NEW_INGREDIENT_CATEGORY,
  TOO_LONG_AMOUNT_CONTENTS_MESSAGE,
  TOO_LONG_AMOUNT_MESSAGE,
  TOO_LONG_NAME_CONTENTS_MESSAGE,
  TOO_LONG_NAME_MESSAGE,
  TOO_LONG_STEP_CONTENTS_MESSAGE,
  TOO_LONG_STEP_MESSAGE,
  TOO_MANY_INGREDIENTS_MESSAGE,
  TOO_MANY_STEPS_MESSAGE,
  amountProblem,
  contentsProblem,
  ingredientNameProblem,
  isBlankIngredient,
  isCategory,
  stepTextProblem,
  toContentsInput,
  type IngredientDraft,
  type IngredientInput,
  type RecipeContentsInput,
} from "@/lib/recipes/contents";

function draft(overrides: Partial<IngredientDraft> = {}): IngredientDraft {
  return { key: "k", name: "にんじん", amount: "1本", category: Category.VEGETABLE, ...overrides };
}

function input(overrides: Partial<IngredientInput> = {}): IngredientInput {
  return { name: "にんじん", amount: "1本", category: Category.VEGETABLE, ...overrides };
}

function contents(overrides: Partial<RecipeContentsInput> = {}): RecipeContentsInput {
  return { ingredients: [input()], steps: ["切る。"], ...overrides };
}

/** コードポイントで n 文字、`length` では 2n になる文字列 */
const emoji = (n: number) => "🍳".repeat(n);

describe("NEW_INGREDIENT_CATEGORY", () => {
  it("追加した行のカテゴリは「その他」（design.md 4.4）", () => {
    expect(NEW_INGREDIENT_CATEGORY).toBe(Category.OTHER);
  });
});

describe("isCategory", () => {
  it.each(["SEASONING", "VEGETABLE", "OTHER"])("%s は enum の値", (value) => {
    expect(isCategory(value)).toBe(true);
  });

  it.each([["vegetable"], ["野菜"], [""], [null], [undefined], [1]])(
    "%s は enum の値ではない",
    (value) => {
      expect(isCategory(value)).toBe(false);
    },
  );
});

describe("isBlankIngredient", () => {
  it("材料名も分量も空なら空の行", () => {
    expect(isBlankIngredient(draft({ name: "", amount: "" }))).toBe(true);
  });

  it("空白だけでも空の行（trim してから判定する）", () => {
    expect(isBlankIngredient(draft({ name: "  ", amount: "　" }))).toBe(true);
  });

  it("**カテゴリは見ない。** カテゴリを変えただけの行も空の行（落とし穴 #N6）", () => {
    for (const category of Object.values(Category)) {
      expect(isBlankIngredient(draft({ name: "", amount: "", category }))).toBe(true);
    }
  });

  it("材料名か分量のどちらかがあれば空の行ではない", () => {
    expect(isBlankIngredient(draft({ name: "", amount: "少々" }))).toBe(false);
    expect(isBlankIngredient(draft({ name: "塩", amount: "" }))).toBe(false);
  });
});

describe("toContentsInput", () => {
  it("全欄が空の材料行を捨てる", () => {
    const result = toContentsInput(
      [draft({ key: "a", name: "塩" }), draft({ key: "b", name: "", amount: "" })],
      [],
    );

    expect(result.ingredients.map((i) => i.name)).toEqual(["塩"]);
  });

  it("カテゴリだけ変えた空の行も捨てる", () => {
    const result = toContentsInput(
      [draft({ name: "", amount: "", category: Category.SEASONING })],
      [],
    );

    expect(result.ingredients).toEqual([]);
  });

  it("材料名だけ空の行は捨てない（検証で止める。ここでは消さない）", () => {
    const result = toContentsInput([draft({ name: "", amount: "少々" })], []);

    expect(result.ingredients).toEqual([
      { name: "", amount: "少々", category: Category.VEGETABLE },
    ]);
  });

  it("前後の空白を落とす。中の空白は残す", () => {
    const result = toContentsInput(
      [draft({ name: "  鶏もも肉 （皮付き） ", amount: " 1枚 " })],
      [],
    );

    expect(result.ingredients[0]).toMatchObject({ name: "鶏もも肉 （皮付き）", amount: "1枚" });
  });

  it("分量の空は null にする", () => {
    const result = toContentsInput([draft({ name: "塩", amount: "  " })], []);

    expect(result.ingredients[0].amount).toBeNull();
  });

  it("カテゴリをそのまま運ぶ", () => {
    const result = toContentsInput([draft({ category: Category.SEASONING })], []);

    expect(result.ingredients[0].category).toBe(Category.SEASONING);
  });

  it("空の手順を捨て、前後の空白を落とす。**改行は保つ**", () => {
    const result = toContentsInput(
      [],
      [
        { key: "a", text: "  切る。\n皮はむく。 " },
        { key: "b", text: "   " },
        { key: "c", text: "煮る。" },
      ],
    );

    expect(result.steps).toEqual(["切る。\n皮はむく。", "煮る。"]);
  });

  it("並び順を保つ（order は配列の添字になる）", () => {
    const result = toContentsInput(
      [
        draft({ key: "a", name: "A" }),
        draft({ key: "b", name: "", amount: "" }),
        draft({ key: "c", name: "C" }),
      ],
      [
        { key: "x", text: "1" },
        { key: "y", text: "2" },
      ],
    );

    expect(result.ingredients.map((i) => i.name)).toEqual(["A", "C"]);
    expect(result.steps).toEqual(["1", "2"]);
  });

  it("key を保存形に含めない", () => {
    const result = toContentsInput([draft()], [{ key: "s", text: "切る。" }]);

    expect(Object.keys(result.ingredients[0]).sort()).toEqual(["amount", "category", "name"]);
  });

  it("0件は0件のまま返す", () => {
    expect(toContentsInput([], [])).toEqual({ ingredients: [], steps: [] });
  });
});

describe("ingredientNameProblem", () => {
  it("材料名だけ空（分量はある）なら「未入力」", () => {
    expect(ingredientNameProblem(draft({ name: " ", amount: "少々" }))).toBe(EMPTY_FIELD_MESSAGE);
  });

  it("全欄が空の行は問題にしない（保存時に捨てる）", () => {
    expect(ingredientNameProblem(draft({ name: "", amount: "" }))).toBeNull();
  });

  it("材料名があれば問題なし", () => {
    expect(ingredientNameProblem(draft())).toBeNull();
  });

  it("上限ちょうどは通り、1文字超えると弾く", () => {
    expect(
      ingredientNameProblem(draft({ name: "あ".repeat(MAX_INGREDIENT_NAME_LENGTH) })),
    ).toBeNull();
    expect(
      ingredientNameProblem(draft({ name: "あ".repeat(MAX_INGREDIENT_NAME_LENGTH + 1) })),
    ).toBe(TOO_LONG_NAME_MESSAGE);
  });

  it("**コードポイントで数える。** 絵文字を上限まで入れても弾かない", () => {
    expect(ingredientNameProblem(draft({ name: emoji(MAX_INGREDIENT_NAME_LENGTH) }))).toBeNull();
  });
});

describe("amountProblem", () => {
  it("空は問題にしない（null で保存する）", () => {
    expect(amountProblem(draft({ amount: "" }))).toBeNull();
  });

  it("上限を超えると弾く", () => {
    expect(amountProblem(draft({ amount: "あ".repeat(MAX_AMOUNT_LENGTH) }))).toBeNull();
    expect(amountProblem(draft({ amount: "あ".repeat(MAX_AMOUNT_LENGTH + 1) }))).toBe(
      TOO_LONG_AMOUNT_MESSAGE,
    );
  });
});

describe("stepTextProblem", () => {
  it("空は問題にしない（保存時に捨てる）", () => {
    expect(stepTextProblem({ key: "s", text: "" })).toBeNull();
  });

  it("上限を超えると弾く", () => {
    expect(stepTextProblem({ key: "s", text: "あ".repeat(MAX_STEP_LENGTH) })).toBeNull();
    expect(stepTextProblem({ key: "s", text: "あ".repeat(MAX_STEP_LENGTH + 1) })).toBe(
      TOO_LONG_STEP_MESSAGE,
    );
  });
});

describe("contentsProblem", () => {
  it("問題が無ければ null", () => {
    expect(contentsProblem(contents())).toBeNull();
  });

  it("材料0件・手順0件を許す（design.md 4.4）", () => {
    expect(contentsProblem({ ingredients: [], steps: [] })).toBeNull();
  });

  it("分量の null を許す", () => {
    expect(contentsProblem(contents({ ingredients: [input({ amount: null })] }))).toBeNull();
  });

  it("空の材料名を弾く", () => {
    expect(contentsProblem(contents({ ingredients: [input({ name: "" })] }))).toBe(
      EMPTY_NAME_CONTENTS_MESSAGE,
    );
  });

  it("**空白だけの材料名も弾く**（保存される値に入れない）", () => {
    expect(contentsProblem(contents({ ingredients: [input({ name: " 　" })] }))).toBe(
      EMPTY_NAME_CONTENTS_MESSAGE,
    );
  });

  it("空の手順・空白だけの手順を弾く", () => {
    expect(contentsProblem(contents({ steps: [""] }))).toBe(EMPTY_STEP_CONTENTS_MESSAGE);
    expect(contentsProblem(contents({ steps: ["  \n "] }))).toBe(EMPTY_STEP_CONTENTS_MESSAGE);
  });

  it("enum に無いカテゴリを弾く", () => {
    const bad = input({ category: "FRUIT" as Category });

    expect(contentsProblem(contents({ ingredients: [bad] }))).toBe(INVALID_CATEGORY_MESSAGE);
  });

  it("件数の上限ちょうどは通り、超えると弾く", () => {
    const many = (n: number) => Array.from({ length: n }, () => input());
    const steps = (n: number) => Array.from({ length: n }, () => "切る。");

    expect(contentsProblem(contents({ ingredients: many(MAX_INGREDIENTS) }))).toBeNull();
    expect(contentsProblem(contents({ ingredients: many(MAX_INGREDIENTS + 1) }))).toBe(
      TOO_MANY_INGREDIENTS_MESSAGE,
    );
    expect(contentsProblem(contents({ steps: steps(MAX_STEPS) }))).toBeNull();
    expect(contentsProblem(contents({ steps: steps(MAX_STEPS + 1) }))).toBe(TOO_MANY_STEPS_MESSAGE);
  });

  it("文字数の上限を超えると弾く", () => {
    expect(
      contentsProblem(
        contents({ ingredients: [input({ name: "あ".repeat(MAX_INGREDIENT_NAME_LENGTH + 1) })] }),
      ),
    ).toBe(TOO_LONG_NAME_CONTENTS_MESSAGE);
    expect(
      contentsProblem(
        contents({ ingredients: [input({ amount: "あ".repeat(MAX_AMOUNT_LENGTH + 1) })] }),
      ),
    ).toBe(TOO_LONG_AMOUNT_CONTENTS_MESSAGE);
    expect(contentsProblem(contents({ steps: ["あ".repeat(MAX_STEP_LENGTH + 1)] }))).toBe(
      TOO_LONG_STEP_CONTENTS_MESSAGE,
    );
  });

  it("**コードポイントで数える。** 絵文字を上限まで入れても弾かない", () => {
    expect(
      contentsProblem(
        contents({
          ingredients: [
            input({ name: emoji(MAX_INGREDIENT_NAME_LENGTH), amount: emoji(MAX_AMOUNT_LENGTH) }),
          ],
          steps: [emoji(MAX_STEP_LENGTH)],
        }),
      ),
    ).toBeNull();
  });

  it("文言はユーザーに見せる日本語で、直し方を含む", () => {
    expect(EMPTY_NAME_CONTENTS_MESSAGE).toContain("削除");
    expect(EMPTY_STEP_CONTENTS_MESSAGE).toContain("削除");
  });
});
