import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock のファクトリは巻き上げられるため、参照するモックも vi.hoisted で一緒に巻き上げる。
const { updateManyMock } = vi.hoisted(() => ({ updateManyMock: vi.fn() }));

// 実体を読むと lib/prisma.ts が評価され、DATABASE_URL が無い環境で落ちる。
// DBを立てずに「どんなクエリを組み立てたか」だけを見る（recipe-find.test.ts と同じ流儀）。
vi.mock("@/lib/prisma", () => ({ prisma: { recipe: { updateMany: updateManyMock } } }));

import { updateRecipeTitle } from "@/lib/repositories/recipe";

const USER_ID = "clx1a2b3c4d5e6f7g8h9";
const OTHER_USER_ID = "clzzz9y8x7w6v5u4t3s2";
const RECIPE_ID = "clr1a2b3c4d5e6f7g8h9";

/** 直近の呼び出しで組み立てられた引数を取り出す。 */
function lastArgs() {
  return updateManyMock.mock.calls[0][0];
}

beforeEach(() => {
  updateManyMock.mockReset();
  updateManyMock.mockResolvedValue({ count: 1 });
});

describe("updateRecipeTitle", () => {
  it("更新できた件数を返す", async () => {
    await expect(updateRecipeTitle(USER_ID, RECIPE_ID, "肉じゃが")).resolves.toBe(1);
  });

  it("タイトルだけを更新する（他の列に触らない）", async () => {
    await updateRecipeTitle(USER_ID, RECIPE_ID, "肉じゃが");

    expect(lastArgs().data).toEqual({ title: "肉じゃが" });
  });

  it("渡された文字列をそのまま入れる（ここで整形しない）", async () => {
    // trim は lib/recipes/title.ts の仕事。Repository は Prisma だけを知る
    await updateRecipeTitle(USER_ID, RECIPE_ID, "肉じゃが （母の味）");

    expect(lastArgs().data.title).toBe("肉じゃが （母の味）");
  });
});

/**
 * **この段階で最も重要なテスト群**（design.md 5.6 / 落とし穴 #19）。
 *
 * `where` から userId が落ちても、**Route Handler のテストは Repository をモックするので
 * 気づけない。** 実際に一度、この防波堤が無い状態を作ってしまった。
 * **ここだけが所有チェックを守っている。**
 */
describe("所有チェック（.kiro/steering/architecture.md「レシピは必ず userId でスコープする」）", () => {
  it("where に userId が入っている（クエリの外で確認しない）", async () => {
    await updateRecipeTitle(USER_ID, RECIPE_ID, "肉じゃが");

    expect(lastArgs().where).toEqual({ id: RECIPE_ID, userId: USER_ID });
  });

  it("他人の userId をそのまま where に渡す（呼び出し側の userId を無視しない）", async () => {
    await updateRecipeTitle(OTHER_USER_ID, RECIPE_ID, "乗っ取り");

    expect(lastArgs().where.userId).toBe(OTHER_USER_ID);
  });

  it("他人のレシピは更新件数が 0 になる", async () => {
    // 他人のIDでは where が一致しないので、Prisma は count: 0 を返す
    updateManyMock.mockResolvedValue({ count: 0 });

    await expect(updateRecipeTitle(OTHER_USER_ID, RECIPE_ID, "乗っ取り")).resolves.toBe(0);
  });

  it("存在しないIDでも更新件数が 0 になる", async () => {
    updateManyMock.mockResolvedValue({ count: 0 });

    await expect(updateRecipeTitle(USER_ID, "clnotexist0000000000", "肉じゃが")).resolves.toBe(0);
  });

  it("「存在しない」と「他人のもの」で戻り値が同じ（区別できる情報を返さない。design.md 5.2）", async () => {
    updateManyMock.mockResolvedValue({ count: 0 });

    const missing = await updateRecipeTitle(USER_ID, "clnotexist0000000000", "肉じゃが");
    const someoneElses = await updateRecipeTitle(OTHER_USER_ID, RECIPE_ID, "肉じゃが");

    expect(missing).toBe(someoneElses);
  });
});

describe("update ではなく updateMany を使う（design.md 5.6）", () => {
  it("updateMany を呼ぶ", async () => {
    await updateRecipeTitle(USER_ID, RECIPE_ID, "肉じゃが");

    // update は一致しないと P2025 を投げるため、「見つからない」の判定が
    // Prisma のエラーコードに依存する。updateMany なら件数だけで済む
    expect(updateManyMock).toHaveBeenCalledTimes(1);
  });
});

describe("この層が知らないこと（.kiro/steering/architecture.md）", () => {
  it("Prisma の例外を握り潰さずそのまま投げる", async () => {
    const failure = new Error("connection terminated unexpectedly");
    updateManyMock.mockRejectedValue(failure);

    await expect(updateRecipeTitle(USER_ID, RECIPE_ID, "肉じゃが")).rejects.toBe(failure);
  });

  it("0件を例外にしない（404 への変換は Route Handler の責務）", async () => {
    updateManyMock.mockResolvedValue({ count: 0 });

    await expect(updateRecipeTitle(USER_ID, RECIPE_ID, "肉じゃが")).resolves.toBe(0);
  });
});
