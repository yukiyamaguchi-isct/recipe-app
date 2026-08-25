import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock のファクトリは巻き上げられるため、参照するモックも vi.hoisted で巻き上げる。
const { authMock, redirectMock, listRecipesMock, getImageUrlMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  redirectMock: vi.fn(),
  listRecipesMock: vi.fn(),
  getImageUrlMock: vi.fn(),
}));

// 実体を読むと lib/prisma.ts が評価され、DATABASE_URL 未設定の環境で落ちる。
vi.mock("@/auth", () => ({ auth: authMock, signOut: vi.fn() }));
vi.mock("@/lib/repositories/recipe", () => ({ listRecipesForUser: listRecipesMock }));
vi.mock("@/lib/clients/s3", () => ({ getRecipeImageUrl: getImageUrlMock }));

// 本物の redirect() は例外を投げて描画を中断する。その挙動を再現する。
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import Home from "@/app/page";

const USER_ID = "clx1a2b3c4d5e6f7g8h9";
const SESSION = { user: { id: USER_ID, name: "テスト太郎", email: "test@example.com" } };

const NIKUJAGA = {
  id: "r1",
  title: "肉じゃが",
  imageKey: `${USER_ID}/8f14e45f-ceea-467a-9575-5b1f5d21ad5c.jpg`,
  createdAt: new Date("2026-08-20T00:00:00.000Z"),
};

const CURRY = {
  id: "r2",
  title: "カレー",
  imageKey: `${USER_ID}/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg`,
  createdAt: new Date("2026-08-24T00:00:00.000Z"),
};

beforeEach(() => {
  authMock.mockReset();
  redirectMock.mockReset();
  listRecipesMock.mockReset();
  getImageUrlMock.mockReset();

  authMock.mockResolvedValue(SESSION);
  listRecipesMock.mockResolvedValue([CURRY, NIKUJAGA]);
  getImageUrlMock.mockImplementation((key: string) =>
    Promise.resolve(`https://example.com/${key}?X-Amz-Signature=abc&X-Amz-Expires=3600`),
  );
  redirectMock.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });
});

describe("S-02 レシピ一覧（requirements.md Req1）", () => {
  it("保存済みのレシピがカードで並ぶ", async () => {
    render(await Home());

    expect(screen.getByRole("heading", { name: "カレー" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "肉じゃが" })).toBeDefined();
  });

  it("Repository が返した順序をそのまま描く（並べ替えを画面でやり直さない）", async () => {
    render(await Home());

    const titles = screen
      .getAllByRole("article")
      .map((card) => within(card).getByRole("heading").textContent);

    expect(titles).toEqual(["カレー", "肉じゃが"]);
  });

  it("カード全面がリンクで、押すとそのレシピへ行く", async () => {
    render(await Home());

    const card = screen.getByRole("heading", { name: "カレー" }).closest("article");
    const link = within(card as HTMLElement).getByRole("link");

    expect(link.getAttribute("href")).toBe("/recipes/r2");
    // 見出しがリンクの中にある = 文字の上だけでなくカードごと押せる
    expect(link.contains(screen.getByRole("heading", { name: "カレー" }))).toBe(true);
  });

  it("作成日を「2026年8月12日」の形式で出す（Date をそのまま渡さない）", async () => {
    render(await Home());

    // JST では 8/24。timeZone が効いていないと 8/23 になる
    expect(screen.getByText("2026年8月24日")).toBeDefined();
    expect(screen.getByText("2026年8月20日")).toBeDefined();
  });

  it("ログイン中のユーザーのレシピだけを引く", async () => {
    await Home();

    expect(listRecipesMock).toHaveBeenCalledWith(USER_ID);
  });

  it("ヘッダーに件数が出る", async () => {
    render(await Home());

    expect(screen.getByText("2件")).toBeDefined();
  });
});

describe("サムネイル（requirements.md Req2）", () => {
  it("署名付きURLを全件分まとめて発行する", async () => {
    await Home();

    expect(getImageUrlMock).toHaveBeenCalledTimes(2);
    expect(getImageUrlMock).toHaveBeenCalledWith(CURRY.imageKey);
    expect(getImageUrlMock).toHaveBeenCalledWith(NIKUJAGA.imageKey);
  });

  it("画像の alt にレシピ名を入れる（出ないときに何の写真か分かる）", async () => {
    render(await Home());

    expect(screen.getByAltText("カレー")).toBeDefined();
  });

  /**
   * ⚠️ 落とし穴 #6。**`Promise.all` だと1件の失敗で一覧全体が開かなくなる。**
   * 保存済みの全レシピに辿り着けなくなるのは割に合わない。
   */
  it("1件の署名付きURLが作れなくても、他のカードは並び、レシピを開ける", async () => {
    getImageUrlMock.mockImplementation((key: string) =>
      key === CURRY.imageKey
        ? Promise.reject(new Error("S3_BUCKET_NAME が設定されていない"))
        : Promise.resolve("https://example.com/ok"),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(await Home());

    // 失敗した側もカードとして残り、タイトル・日付が読めてレシピを開ける
    expect(screen.getByRole("heading", { name: "カレー" })).toBeDefined();
    expect(screen.getByText("2026年8月24日")).toBeDefined();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    // 画像だけが欠ける
    expect(screen.queryByAltText("カレー")).toBeNull();
    expect(screen.getByAltText("肉じゃが")).toBeDefined();
    // 例外を握り潰さない（設定不備に気づけるようログには残す）
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});

describe("S-03 への導線（requirements.md Req4）", () => {
  it("FAB から /upload へ行ける", async () => {
    render(await Home());

    expect(screen.getByRole("link", { name: "写真を撮る" }).getAttribute("href")).toBe("/upload");
  });
});

describe("認可（requirements.md Req6）", () => {
  // 認可の本体は proxy ではなくこちら。proxy.ts を外してもこの保護は成立する
  // （user-auth design.md 調査結果4）。それをテストで固定する。
  it("未ログインなら /login にリダイレクトする", async () => {
    authMock.mockResolvedValue(null);

    await expect(Home()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("未ログインならレシピを引かない", async () => {
    authMock.mockResolvedValue(null);

    await expect(Home()).rejects.toThrow();
    expect(listRecipesMock).not.toHaveBeenCalled();
  });
});

describe("ログアウト（requirements.md Req8）", () => {
  it("ヘッダーにログアウトがある", async () => {
    render(await Home());

    expect(screen.getByRole("button", { name: "ログアウト" })).toBeDefined();
  });
});

describe("空状態（requirements.md Req3）", () => {
  beforeEach(() => {
    listRecipesMock.mockResolvedValue([]);
  });

  it("レシピが0件なら「レシピなし」を出す", async () => {
    render(await Home());

    expect(screen.getByText("レシピなし")).toBeDefined();
  });

  it("何をすれば並ぶのかの説明を出す（空白のままにしない）", async () => {
    render(await Home());

    expect(screen.getByText(/撮影すると/)).toBeDefined();
  });

  it("空状態から直接 /upload へ行ける", async () => {
    render(await Home());

    expect(screen.getByRole("link", { name: "写真を撮る" }).getAttribute("href")).toBe("/upload");
  });

  it("カードを1枚も描かない", async () => {
    render(await Home());

    expect(screen.queryAllByRole("article")).toHaveLength(0);
  });

  it("件数は0件と出す", async () => {
    render(await Home());

    expect(screen.getByText("0件")).toBeDefined();
  });

  /**
   * 空状態が同じ行き先の主要ボタンを持っているので、FAB と合わせて
   * **ほぼ空白の画面にボタンが2つ**並ぶのを避ける（判断であって資料の値ではない）。
   */
  it("FAB を出さない（空状態のボタンと二重にしない）", async () => {
    render(await Home());

    expect(screen.getAllByRole("link", { name: "写真を撮る" })).toHaveLength(1);
  });

  it("0件でも署名付きURLを発行しに行かない", async () => {
    await Home();

    expect(getImageUrlMock).not.toHaveBeenCalled();
  });
});

describe("1件以上あるときは空状態を出さない", () => {
  it("「レシピなし」が出ない", async () => {
    render(await Home());

    expect(screen.queryByText("レシピなし")).toBeNull();
  });
});

/**
 * PC（768px〜）の導線（design.md 6.1）。
 *
 * ⚠️ **jsdom はメディアクエリを評価しない。** `md:hidden` / `md:inline-flex` は
 * クラス名が付くだけで、要素は幅に関係なく DOM に存在する。**「スマホで FAB だけ」
 * 「PC で ＋ 新規 だけ」の出し分けは、ここでは担保できない**（成果物のCSSで確認済み。
 * 実機での見え方は段階13）。ここで固定するのは **props による有無**だけ。
 */
describe("PC の「＋ 新規」（design.md 6.1）", () => {
  it("レシピがあるとき、ヘッダーに「＋ 新規」があり /upload を指す", async () => {
    render(await Home());

    expect(screen.getByRole("link", { name: "＋ 新規" }).getAttribute("href")).toBe("/upload");
  });

  it("0件のときは「＋ 新規」を出さない（空状態のボタンと二重にしない）", async () => {
    listRecipesMock.mockResolvedValue([]);

    render(await Home());

    expect(screen.queryByRole("link", { name: "＋ 新規" })).toBeNull();
  });
});
