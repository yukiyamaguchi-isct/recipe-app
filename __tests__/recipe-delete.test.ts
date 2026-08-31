import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock のファクトリは巻き上げられるため、参照するモックも vi.hoisted で一緒に巻き上げる。
const { findFirstMock, deleteManyMock } = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
  deleteManyMock: vi.fn(),
}));

// 実体を読むと lib/prisma.ts が評価され、DATABASE_URL が無い環境で落ちる。
// DBを立てずに「どんなクエリを組み立てたか」だけを見る（recipe-update.test.ts と同じ流儀）。
vi.mock("@/lib/prisma", () => ({
  prisma: { recipe: { findFirst: findFirstMock, deleteMany: deleteManyMock } },
}));

import { deleteRecipeForUser } from "@/lib/repositories/recipe";

const USER_ID = "clx1a2b3c4d5e6f7g8h9";
const OTHER_USER_ID = "clzzz9y8x7w6v5u4t3s2";
const RECIPE_ID = "clr1a2b3c4d5e6f7g8h9";
const IMAGE_KEY = `${USER_ID}/01abc5ef-06e6-40e0-bbe5-a1bedde6b3fa.jpg`;

beforeEach(() => {
  findFirstMock.mockReset();
  deleteManyMock.mockReset();
  findFirstMock.mockResolvedValue({ imageKey: IMAGE_KEY });
  deleteManyMock.mockResolvedValue({ count: 1 });
});

describe("deleteRecipeForUser", () => {
  it("消せたら imageKey を返す（S3 の後片付けに使う）", async () => {
    await expect(deleteRecipeForUser(USER_ID, RECIPE_ID)).resolves.toEqual({
      imageKey: IMAGE_KEY,
    });
  });

  /**
   * ⚠️ 落とし穴 #10。**消した後では imageKey を取れない。**
   * deleteMany 一発にすると、S3 の画像を後片付けできなくなる。
   */
  it("消す前に imageKey を読む（順序が逆だと取れない）", async () => {
    const order: string[] = [];
    findFirstMock.mockImplementation(async () => {
      order.push("read");
      return { imageKey: IMAGE_KEY };
    });
    deleteManyMock.mockImplementation(async () => {
      order.push("delete");
      return { count: 1 };
    });

    await deleteRecipeForUser(USER_ID, RECIPE_ID);

    expect(order).toEqual(["read", "delete"]);
  });
});

/**
 * ⚠️ **この describe がこのフェーズで最も重要**（落とし穴 #9）。
 *
 * 所有チェックは `where` の `userId` だけが担っている。**落としても、自分のレシピしか
 * 作らないテストは全部通ってしまう**ので、他人の userId を明示的に試す。
 */
describe("所有チェック（requirements.md Req6）", () => {
  it("他人のレシピは null が返り、削除も走らない", async () => {
    findFirstMock.mockResolvedValue(null);

    await expect(deleteRecipeForUser(OTHER_USER_ID, RECIPE_ID)).resolves.toBeNull();
    expect(deleteManyMock).not.toHaveBeenCalled();
  });

  it("取得の where に userId が入っている", async () => {
    await deleteRecipeForUser(USER_ID, RECIPE_ID);

    expect(findFirstMock.mock.calls[0][0].where).toEqual({ id: RECIPE_ID, userId: USER_ID });
  });

  it("削除の where にも userId が入っている（1箇所だけ緩めない）", async () => {
    await deleteRecipeForUser(USER_ID, RECIPE_ID);

    expect(deleteManyMock.mock.calls[0][0].where).toEqual({ id: RECIPE_ID, userId: USER_ID });
  });

  it("id だけで削除しようとしない", async () => {
    await deleteRecipeForUser(USER_ID, RECIPE_ID);

    expect(deleteManyMock.mock.calls[0][0].where).not.toEqual({ id: RECIPE_ID });
  });

  /**
   * `delete()` は一致しないと P2025 を投げる。**「見つからない」の判定が
   * Prisma のエラーコードという実行時の詳細に依存する**ので使わない
   * （recipe-view の updateRecipeTitle と同じ判断）。
   */
  it("delete ではなく deleteMany を使う（例外ではなく件数で判定する）", async () => {
    await deleteRecipeForUser(USER_ID, RECIPE_ID);

    expect(deleteManyMock).toHaveBeenCalled();
  });
});

describe("取り出す列", () => {
  it("imageKey だけを select する（材料や手順を引かない）", async () => {
    await deleteRecipeForUser(USER_ID, RECIPE_ID);

    const args = findFirstMock.mock.calls[0][0];
    expect(args.select).toEqual({ imageKey: true });
    expect(args.include).toBeUndefined();
  });
});

describe("競合したとき", () => {
  /**
   * 取得と削除の間に別リクエストが消していた場合（削除の二重送信など）。
   * **「見つからない」と同じ扱いにする。** 呼び出し側は 404 を返せばよい。
   */
  it("取得できたのに削除件数が0なら null を返す", async () => {
    deleteManyMock.mockResolvedValue({ count: 0 });

    await expect(deleteRecipeForUser(USER_ID, RECIPE_ID)).resolves.toBeNull();
  });
});
