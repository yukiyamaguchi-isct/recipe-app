import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock のファクトリは巻き上げられるため、参照するモックも vi.hoisted で巻き上げる。
const { getUserIdMock, findRecipeMock, redirectMock, notFoundMock, editorMock } = vi.hoisted(
  () => ({
    getUserIdMock: vi.fn(),
    findRecipeMock: vi.fn(),
    redirectMock: vi.fn(),
    notFoundMock: vi.fn(),
    editorMock: vi.fn(),
  }),
);

// 実体を読むと lib/prisma.ts が評価され、DATABASE_URL 未設定の環境で落ちる。
vi.mock("@/lib/auth/session", () => ({ getUserId: getUserIdMock, requireUserId: vi.fn() }));
vi.mock("@/lib/repositories/recipe", () => ({ findRecipeForUser: findRecipeMock }));

// 本物の redirect() / notFound() は例外を投げて描画を中断する。その挙動を再現する。
vi.mock("next/navigation", () => ({ redirect: redirectMock, notFound: notFoundMock }));

// **画面の入口が何を渡すかだけを見る。** 編集画面の中身は recipe-editor.test.tsx が見る。
vi.mock("@/app/recipes/[id]/edit/recipe-editor", () => ({
  RecipeEditor: (props: unknown) => {
    editorMock(props);
    return null;
  },
}));

import RecipeEditPage from "@/app/recipes/[id]/edit/page";
import { Category } from "@/generated/prisma/enums";

const USER_ID = "clx1a2b3c4d5e6f7g8h9";
const RECIPE_ID = "clr1a2b3c4d5e6f7g8h9";
const DATE = new Date("2026-08-24T00:00:00.000Z");

const RECIPE = {
  id: RECIPE_ID,
  userId: USER_ID,
  title: "肉じゃが",
  imageKey: `${USER_ID}/8f14e45f-ceea-467a-9575-5b1f5d21ad5c.jpg`,
  servings: 4,
  createdAt: DATE,
  updatedAt: DATE,
  ingredients: [
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
      name: "塩",
      amount: null,
      category: Category.SEASONING,
      order: 1,
    },
  ],
  steps: [{ id: "s1", recipeId: RECIPE_ID, text: "切る。", order: 0 }],
};

/** `PageProps` と同じ形（params は Promise）を作る。 */
function props(id = RECIPE_ID) {
  return { params: Promise.resolve({ id }), searchParams: Promise.resolve({}) };
}

/** Editor に渡った props */
function passed() {
  return editorMock.mock.calls[0][0];
}

beforeEach(() => {
  vi.clearAllMocks();

  getUserIdMock.mockResolvedValue(USER_ID);
  findRecipeMock.mockResolvedValue(RECIPE);
  redirectMock.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });
  notFoundMock.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
});

describe("S-05 の入口（edit/page.tsx）", () => {
  it("未ログインなら /login へ（エラー画面にしない。落とし穴 #5）", async () => {
    getUserIdMock.mockResolvedValue(null);

    await expect(RecipeEditPage(props())).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(findRecipeMock).not.toHaveBeenCalled();
  });

  it("URL の id とセッションの userId でスコープして取る（params を await している）", async () => {
    render(await RecipeEditPage(props("clother00000000000000")));

    expect(findRecipeMock).toHaveBeenCalledWith(USER_ID, "clother00000000000000");
  });

  it("存在しない / 他人のレシピなら notFound()（区別しない）", async () => {
    findRecipeMock.mockResolvedValue(null);

    await expect(RecipeEditPage(props())).rejects.toThrow("NEXT_NOT_FOUND");
    expect(editorMock).not.toHaveBeenCalled();
  });

  it("材料と手順を order の順のまま、必要な列だけ渡す", async () => {
    render(await RecipeEditPage(props()));

    expect(passed()).toEqual({
      recipeId: RECIPE_ID,
      ingredients: [
        { id: "i1", name: "じゃがいも", amount: "3個", category: Category.VEGETABLE },
        { id: "i2", name: "塩", amount: null, category: Category.SEASONING },
      ],
      steps: [{ id: "s1", text: "切る。" }],
    });
  });

  it("**Date を Client Component に渡さない**（recipe-view 落とし穴 #15）", async () => {
    render(await RecipeEditPage(props()));

    const hasDate = (value: unknown): boolean =>
      value instanceof Date ||
      (typeof value === "object" && value !== null && Object.values(value).some(hasDate));

    expect(hasDate(passed())).toBe(false);
  });
});
