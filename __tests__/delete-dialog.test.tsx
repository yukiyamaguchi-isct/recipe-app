import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DeleteDialog } from "@/app/delete-dialog";
import { RecipeCard } from "@/app/recipe-card";

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
