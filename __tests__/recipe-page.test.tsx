import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock のファクトリは巻き上げられるため、参照するモックも vi.hoisted で巻き上げる。
const { getUserIdMock, findRecipeMock, redirectMock, notFoundMock } = vi.hoisted(() => ({
  getUserIdMock: vi.fn(),
  findRecipeMock: vi.fn(),
  redirectMock: vi.fn(),
  notFoundMock: vi.fn(),
}));

// 実体を読むと lib/prisma.ts が評価され、DATABASE_URL 未設定の環境で落ちる。
vi.mock("@/lib/auth/session", () => ({ getUserId: getUserIdMock, requireUserId: vi.fn() }));
vi.mock("@/lib/repositories/recipe", () => ({ findRecipeForUser: findRecipeMock }));

// 本物の redirect() / notFound() は例外を投げて描画を中断する。その挙動を再現する。
vi.mock("next/navigation", () => ({ redirect: redirectMock, notFound: notFoundMock }));

import RecipeNotFound from "@/app/recipes/[id]/not-found";
import RecipePage from "@/app/recipes/[id]/page";

const USER_ID = "clx1a2b3c4d5e6f7g8h9";
const RECIPE_ID = "clr1a2b3c4d5e6f7g8h9";

const RECIPE = {
  id: RECIPE_ID,
  userId: USER_ID,
  title: "肉じゃが",
  imageKey: `${USER_ID}/8f14e45f-ceea-467a-9575-5b1f5d21ad5c.jpg`,
  servings: 4,
  createdAt: new Date("2026-08-24T00:00:00.000Z"),
  updatedAt: new Date("2026-08-24T00:00:00.000Z"),
  ingredients: [],
  steps: [],
};

/** `PageProps` と同じ形（params は Promise）を作る。 */
function props(id = RECIPE_ID) {
  return { params: Promise.resolve({ id }), searchParams: Promise.resolve({}) };
}

beforeEach(() => {
  getUserIdMock.mockReset();
  findRecipeMock.mockReset();
  redirectMock.mockReset();
  notFoundMock.mockReset();

  getUserIdMock.mockResolvedValue(USER_ID);
  findRecipeMock.mockResolvedValue(RECIPE);
  redirectMock.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });
  notFoundMock.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
});

describe("S-04 レシピ表示", () => {
  it("レシピのタイトルを見出しとして表示する", async () => {
    render(await RecipePage(props()));

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("肉じゃが");
  });

  it("URL の id でレシピを引く（params を await している）", async () => {
    await RecipePage(props());

    // await を忘れると undefined が渡り、「見つかりません」になるだけでエラーは出ない
    // （design.md 落とし穴 #1）
    expect(findRecipeMock).toHaveBeenCalledWith(USER_ID, RECIPE_ID);
  });
});

/**
 * 認可（requirements.md Req4）。
 *
 * **認可の本体はここで、proxy.ts ではない。** proxy を外してもこの保護は成立する
 * （`.kiro/specs/user-auth/design.md` 5章）。それをテストで固定する。
 */
describe("認可", () => {
  it("未ログインなら /login にリダイレクトする", async () => {
    getUserIdMock.mockResolvedValue(null);

    await expect(RecipePage(props())).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("未ログインならレシピを引きに行かない（リダイレクトが先）", async () => {
    getUserIdMock.mockResolvedValue(null);

    await expect(RecipePage(props())).rejects.toThrow();
    expect(findRecipeMock).not.toHaveBeenCalled();
  });

  it("セッションから取った userId でスコープする（URL の値を信用しない）", async () => {
    await RecipePage(props());

    expect(findRecipeMock.mock.calls[0][0]).toBe(USER_ID);
  });
});

describe("開けないレシピ（requirements.md Req6）", () => {
  it("見つからなければ notFound() を呼ぶ", async () => {
    findRecipeMock.mockResolvedValue(null);

    await expect(RecipePage(props())).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });

  it("存在しないIDと他人のIDで同じ結果になる（区別しない。design.md 5.2）", async () => {
    // Repository はどちらの場合も null を返す（recipe-find.test.ts で固定済み）。
    // 画面はその null だけを見るので、出し分けようがない構造になっている。
    findRecipeMock.mockResolvedValue(null);

    await expect(RecipePage(props("clnotexist0000000000"))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(RecipePage(props(RECIPE_ID))).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("not-found 画面", () => {
  it("日本語の説明を出す", () => {
    render(<RecipeNotFound />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("レシピが見つかりません");
  });

  it("行き止まりにしない（戻る導線がある）", () => {
    render(<RecipeNotFound />);

    // 「← 一覧」は Phase 4 まで出さないため、ここが唯一の戻る手段になる
    // （design.md 落とし穴 #24）
    expect(screen.getByRole("link", { name: "ホームへ戻る" }).getAttribute("href")).toBe("/");
  });

  it("どちらの理由かを文言で出し分けない", () => {
    render(<RecipeNotFound />);

    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/権限|他のユーザー|他人/);
  });
});
