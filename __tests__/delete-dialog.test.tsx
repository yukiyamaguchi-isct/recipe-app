import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

import { DeleteDialog } from "@/app/delete-dialog";
import { RecipeCard } from "@/app/recipe-card";
import { INTERNAL_ERROR } from "@/lib/api-response";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

/** 成功レスポンス。 */
function okResponse() {
  return new Response(JSON.stringify({ success: true, data: { id: RECIPE_ID }, error: null }), {
    status: 200,
  });
}

/** 失敗レスポンス。文言はサーバーが決める（クライアントで作らない）。 */
function errorResponse(status: number, message: string) {
  return new Response(
    JSON.stringify({ success: false, data: null, error: { code: "X", message } }),
    { status },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  refreshMock.mockReset();
});

const RECIPE_ID = "clr1a2b3c4d5e6f7g8h9";
const TITLE = "鶏肉と根菜のトマト煮込み";

/** 既存テストに合わせて fireEvent を使う（user-event は未導入）。 */
function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: `${TITLE} を削除` }));
}

describe("削除の確認ダイアログ（requirements.md Req5）", () => {
  it("最初はダイアログが出ていない", () => {
    render(<DeleteDialog recipeId={RECIPE_ID} title={TITLE} />);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  /** **いきなり消えない。** 押し間違いで消えると取り返しがつかない。 */
  it("削除ボタンを押すと、消えずに確認ダイアログが出る", () => {
    render(<DeleteDialog recipeId={RECIPE_ID} title={TITLE} />);

    openDialog();

    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("どのレシピを消すのかダイアログに出る", () => {
    render(<DeleteDialog recipeId={RECIPE_ID} title={TITLE} />);

    openDialog();

    expect(within(screen.getByRole("dialog")).getByText(new RegExp(TITLE))).toBeDefined();
  });

  it("元に戻せないことを伝える", () => {
    render(<DeleteDialog recipeId={RECIPE_ID} title={TITLE} />);

    openDialog();

    expect(within(screen.getByRole("dialog")).getByText(/元に戻せません/)).toBeDefined();
  });
});

describe("閉じる（Req5「やめるでレシピが残っている」）", () => {
  it("「やめる」で閉じる", () => {
    render(<DeleteDialog recipeId={RECIPE_ID} title={TITLE} />);
    openDialog();

    fireEvent.click(screen.getByRole("button", { name: "やめる" }));

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  /**
   * ⚠️ ネイティブ `<dialog>` なら無料で付くが、**jsdom 30 は `showModal` を
   * 実装していない**ので素の div で組んでいる（design.md 6.4）。
   * その代わり Escape は自前。**動くことをここで固定する。**
   */
  it("Escape で閉じる", () => {
    render(<DeleteDialog recipeId={RECIPE_ID} title={TITLE} />);
    openDialog();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("背景を押すと閉じる", () => {
    const { container } = render(<DeleteDialog recipeId={RECIPE_ID} title={TITLE} />);
    openDialog();

    // ダイアログ本体ではなく、その外側の覆い
    const backdrop = container.querySelector(".fixed.inset-0") as HTMLElement;
    fireEvent.click(backdrop);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ダイアログの中身を押しても閉じない（誤操作で閉じない）", () => {
    render(<DeleteDialog recipeId={RECIPE_ID} title={TITLE} />);
    openDialog();

    fireEvent.click(screen.getByRole("heading", { name: "レシピを削除" }));

    expect(screen.getByRole("dialog")).toBeDefined();
  });
});

describe("ボタンの並び（引き継ぎ資料「確認ダイアログ」）", () => {
  /** **破壊的動作を上に置かない。** 資料の明示的な指定。 */
  it("「やめる」が上、「削除する」が下", () => {
    render(<DeleteDialog recipeId={RECIPE_ID} title={TITLE} />);
    openDialog();

    const labels = within(screen.getByRole("dialog"))
      .getAllByRole("button")
      .map((button) => button.textContent);

    expect(labels).toEqual(["やめる", "削除する"]);
  });

  it("開いた直後は「やめる」に焦点がある（破壊的でないほうを初期位置にする）", () => {
    render(<DeleteDialog recipeId={RECIPE_ID} title={TITLE} />);

    openDialog();

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "やめる" }));
  });
});

describe("カードとの組み合わせ（design.md 落とし穴 #13）", () => {
  /**
   * ⚠️ **`<a>` の中に `<button>` を入れない。**
   *
   * インタラクティブ要素の入れ子はHTMLとして不正で、**削除を押したつもりが
   * レシピが開く。** ブラウザによって挙動も違う。
   */
  it("削除ボタンがカードのリンクの中に入っていない", () => {
    render(<RecipeCard id={RECIPE_ID} title={TITLE} imageUrl={null} createdAt="2026年8月12日" />);

    const link = screen.getByRole("link");
    const deleteButton = screen.getByRole("button", { name: `${TITLE} を削除` });

    expect(link.contains(deleteButton)).toBe(false);
  });

  it("カード全面のリンクは残っている", () => {
    render(<RecipeCard id={RECIPE_ID} title={TITLE} imageUrl={null} createdAt="2026年8月12日" />);

    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe(`/recipes/${RECIPE_ID}`);
    expect(link.contains(screen.getByRole("heading", { name: TITLE }))).toBe(true);
  });
});

describe("実際に削除する（requirements.md Req5 / 段階11）", () => {
  it("「削除する」で DELETE を送る", async () => {
    fetchMock.mockResolvedValue(okResponse());
    render(<DeleteDialog recipeId={RECIPE_ID} title={TITLE} />);
    openDialog();

    fireEvent.click(screen.getByRole("button", { name: "削除する" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(`/api/recipes/${RECIPE_ID}`, { method: "DELETE" });
  });

  it("「やめる」では何も送らない（レシピが残る）", () => {
    render(<DeleteDialog recipeId={RECIPE_ID} title={TITLE} />);
    openDialog();

    fireEvent.click(screen.getByRole("button", { name: "やめる" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Escape でも何も送らない", () => {
    render(<DeleteDialog recipeId={RECIPE_ID} title={TITLE} />);
    openDialog();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ 落とし穴 #14。**クライアント側で配列から抜かない。**
   * 一覧は Server Component が持つデータなので、抜くと画面とサーバーがずれる。
   * `refresh()` なら署名付きURLの再発行と件数の更新も一緒に乗る。
   */
  it("成功したら router.refresh() で一覧を取り直す", async () => {
    fetchMock.mockResolvedValue(okResponse());
    render(<DeleteDialog recipeId={RECIPE_ID} title={TITLE} />);
    openDialog();

    fireEvent.click(screen.getByRole("button", { name: "削除する" }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("成功したらダイアログが閉じる", async () => {
    fetchMock.mockResolvedValue(okResponse());
    render(<DeleteDialog recipeId={RECIPE_ID} title={TITLE} />);
    openDialog();

    fireEvent.click(screen.getByRole("button", { name: "削除する" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("二重送信を防ぐ", () => {
  /**
   * ⚠️ **2回目は 404 になる**（1回目で消えているため）。押せてしまうと
   * 「レシピが見つかりませんでした」と出て、消えたのに失敗したように見える。
   */
  it("連打しても DELETE は1回しか飛ばない", async () => {
    // 解決を保留して「削除中」の状態に留める
    let resolve: (value: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));

    render(<DeleteDialog recipeId={RECIPE_ID} title={TITLE} />);
    openDialog();

    const button = screen.getByRole("button", { name: "削除する" });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole("button", { name: "削除中…" })).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "削除中…" }));
    fireEvent.click(screen.getByRole("button", { name: "削除中…" }));

    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolve(okResponse());
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("削除中は Escape で閉じない（結果が見えなくなるだけなので）", async () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));
    render(<DeleteDialog recipeId={RECIPE_ID} title={TITLE} />);
    openDialog();

    fireEvent.click(screen.getByRole("button", { name: "削除する" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "削除中…" })).toBeDefined());
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.getByRole("dialog")).toBeDefined();
  });
});

describe("失敗したとき", () => {
  it("サーバーの文言をそのまま出し、ダイアログは開いたまま（再試行できる）", async () => {
    fetchMock.mockResolvedValue(errorResponse(404, "レシピが見つかりませんでした。"));
    render(<DeleteDialog recipeId={RECIPE_ID} title={TITLE} />);
    openDialog();

    fireEvent.click(screen.getByRole("button", { name: "削除する" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("レシピが見つかりませんでした。"),
    );
    expect(screen.getByRole("dialog")).toBeDefined();
    // 失敗したのに一覧を取り直さない
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("JSON でない応答でも独自の文言を作らない（500 と同じ見え方にする）", async () => {
    fetchMock.mockResolvedValue(
      new Response("<html>Bad Gateway</html>", { status: 502 }) as Response,
    );
    render(<DeleteDialog recipeId={RECIPE_ID} title={TITLE} />);
    openDialog();

    fireEvent.click(screen.getByRole("button", { name: "削除する" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(INTERNAL_ERROR.message));
  });

  it("通信そのものが失敗したら、原因を断定しない文言を出す", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<DeleteDialog recipeId={RECIPE_ID} title={TITLE} />);
    openDialog();

    fireEvent.click(screen.getByRole("button", { name: "削除する" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/通信/));
  });

  it("失敗後にもう一度押せる（ボタンが無効のまま固まらない）", async () => {
    fetchMock.mockResolvedValue(errorResponse(500, "問題が発生しました。"));
    render(<DeleteDialog recipeId={RECIPE_ID} title={TITLE} />);
    openDialog();

    fireEvent.click(screen.getByRole("button", { name: "削除する" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined());

    const button = screen.getByRole("button", { name: "削除する" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it("閉じて開き直すと、前回の失敗が残っていない", async () => {
    fetchMock.mockResolvedValue(errorResponse(500, "問題が発生しました。"));
    render(<DeleteDialog recipeId={RECIPE_ID} title={TITLE} />);
    openDialog();

    fireEvent.click(screen.getByRole("button", { name: "削除する" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "やめる" }));
    openDialog();

    expect(screen.queryByRole("alert")).toBeNull();
  });
});
