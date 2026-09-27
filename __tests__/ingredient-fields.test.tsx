import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));

// ⚠️ useRouter を返さないモックだと「No "useRouter" export is defined」で落ちる（recipe-list 落とし穴 #32）
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: replaceMock }) }));

import { RecipeEditor, type EditorIngredient } from "@/app/recipes/[id]/edit/recipe-editor";
import { Category } from "@/generated/prisma/enums";

const RECIPE_ID = "clr1a2b3c4d5e6f7g8h9";

const INGREDIENTS: EditorIngredient[] = [
  { id: "i1", name: "じゃがいも", amount: "3個", category: Category.VEGETABLE },
  { id: "i2", name: "塩", amount: null, category: Category.SEASONING },
  { id: "i3", name: "牛こま肉", amount: "200g", category: Category.OTHER },
];

function renderEditor(ingredients = INGREDIENTS) {
  return render(<RecipeEditor recipeId={RECIPE_ID} ingredients={ingredients} steps={[]} />);
}

const names = () =>
  screen
    .getAllByRole("textbox", { name: /^材料名/ })
    .map((input) => (input as HTMLInputElement).value);
const amounts = () =>
  screen
    .getAllByRole("textbox", { name: /^分量/ })
    .map((input) => (input as HTMLInputElement).value);
const categories = () =>
  screen
    .getAllByRole("combobox", { name: /^カテゴリ/ })
    .map((select) => (select as HTMLSelectElement).value);

/** 材料の節（手順の節と取り違えない） */
const section = () => screen.getByRole("region", { name: "材料" });

beforeEach(() => {
  replaceMock.mockReset();
});

describe("初期表示", () => {
  it("「材料」の節に、保存済みの材料が order の順で入っている", () => {
    renderEditor();

    expect(names()).toEqual(["じゃがいも", "塩", "牛こま肉"]);
    expect(amounts()).toEqual(["3個", "", "200g"]);
    expect(categories()).toEqual([Category.VEGETABLE, Category.SEASONING, Category.OTHER]);
  });

  it("**分量の null は空欄**になる（null を value に渡さない。落とし穴 #N16）", () => {
    renderEditor();

    expect((screen.getByRole("textbox", { name: "分量（2行目）" }) as HTMLInputElement).value).toBe(
      "",
    );
  });

  it("**材料名が左・分量が右**（recipe-view design.md 6.5。資料の編集画面も同じ並び）", () => {
    renderEditor();

    const name = screen.getByRole("textbox", { name: "材料名（1行目）" });
    const amount = screen.getByRole("textbox", { name: "分量（1行目）" });

    // 同じ段の中で、材料名が分量より前にある
    expect(name.compareDocumentPosition(amount) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("カテゴリの選択肢は 野菜 / 調味料 / その他 の順（lib/recipes/category.ts と共有）", () => {
    renderEditor();

    const options = within(screen.getByRole("combobox", { name: "カテゴリ（1行目）" }))
      .getAllByRole("option")
      .map((option) => option.textContent);

    expect(options).toEqual(["野菜", "調味料", "その他"]);
  });

  it("材料0件でも節と「＋ 行を追加」が出る", () => {
    renderEditor([]);

    expect(within(section()).queryAllByRole("textbox")).toEqual([]);
    expect(screen.getByRole("button", { name: "＋ 行を追加" })).toBeTruthy();
  });

  it("画面内のボタンは全部 type=button（Enter で保存が走らない。落とし穴 #N3）", () => {
    renderEditor();

    for (const button of screen.getAllByRole("button")) {
      expect(button.getAttribute("type")).toBe("button");
    }
  });
});

describe("書き換え", () => {
  it("材料名・分量・カテゴリを書き換えられる", () => {
    renderEditor();

    fireEvent.change(screen.getByRole("textbox", { name: "材料名（2行目）" }), {
      target: { value: "粗塩" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "分量（2行目）" }), {
      target: { value: "少々" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "カテゴリ（3行目）" }), {
      target: { value: Category.VEGETABLE },
    });

    expect(names()).toEqual(["じゃがいも", "粗塩", "牛こま肉"]);
    expect(amounts()).toEqual(["3個", "少々", "200g"]);
    expect(categories()).toEqual([Category.VEGETABLE, Category.SEASONING, Category.VEGETABLE]);
  });
});

describe("「＋ 行を追加」", () => {
  it("末尾に空の行が増え、カテゴリが「その他」", () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "＋ 行を追加" }));

    expect(names()).toEqual(["じゃがいも", "塩", "牛こま肉", ""]);
    expect(amounts()[3]).toBe("");
    expect(categories()[3]).toBe(Category.OTHER);
  });

  it("追加した行の材料名の欄にフォーカスが移る", () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "＋ 行を追加" }));

    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "材料名（4行目）" }));
  });

  it("続けて2回押すと2行増え、それぞれ別の行として書ける", () => {
    renderEditor([]);

    fireEvent.click(screen.getByRole("button", { name: "＋ 行を追加" }));
    fireEvent.click(screen.getByRole("button", { name: "＋ 行を追加" }));
    fireEvent.change(screen.getByRole("textbox", { name: "材料名（1行目）" }), {
      target: { value: "A" },
    });

    expect(names()).toEqual(["A", ""]);
  });
});

describe("行の削除", () => {
  it("値の入った行は確認ダイアログを出し、材料名と分量を書く。**「元に戻せません」は書かない**", () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "1行目を削除" }));

    const dialog = screen.getByRole("dialog", { name: "この行を削除" });
    expect(dialog.textContent).toContain("「じゃがいも 3個」を削除します。");
    expect(dialog.textContent).not.toContain("元に戻せません");
  });

  it("分量が空の行は材料名だけ、材料名が空の行は分量だけを書く", () => {
    renderEditor([
      { id: "a", name: "塩", amount: null, category: Category.SEASONING },
      { id: "b", name: "", amount: "少々", category: Category.SEASONING },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "1行目を削除" }));
    expect(screen.getByRole("dialog").textContent).toContain("「塩」を削除します。");
    fireEvent.click(screen.getByRole("button", { name: "やめる" }));

    fireEvent.click(screen.getByRole("button", { name: "2行目を削除" }));
    expect(screen.getByRole("dialog").textContent).toContain("「少々」を削除します。");
  });

  it("「やめる」で閉じ、行が残る", () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "1行目を削除" }));
    fireEvent.click(screen.getByRole("button", { name: "やめる" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(names()).toEqual(["じゃがいも", "塩", "牛こま肉"]);
  });

  it("「削除する」で行が消え、フォーカスが「＋ 行を追加」に移る", () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "1行目を削除" }));
    fireEvent.click(screen.getByRole("button", { name: "削除する" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(names()).toEqual(["塩", "牛こま肉"]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "＋ 行を追加" }));
  });

  it("**途中の行を消しても、後ろの行の入力欄は同じ要素のまま**（key を添字にしない。落とし穴 #N4）", () => {
    renderEditor();

    // 入力欄は制御されているので、添字を key にしても値そのものは正しく出る。
    // 壊れるのは**要素の同一性**: 後ろの行が別の要素に描き直され、そこにあった
    // フォーカスや変換中の文字（IME）が別の行へ移る。だから要素そのものを比べる
    const lastRow = screen.getByRole("textbox", { name: "材料名（3行目）" });
    lastRow.focus();

    fireEvent.click(screen.getByRole("button", { name: "2行目を削除" }));
    fireEvent.click(screen.getByRole("button", { name: "削除する" }));

    expect(lastRow.isConnected).toBe(true);
    expect((lastRow as HTMLInputElement).value).toBe("牛こま肉");
  });

  it("途中の行を消しても、後ろの行の値がずれない", () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "2行目を削除" }));
    fireEvent.click(screen.getByRole("button", { name: "削除する" }));

    expect(names()).toEqual(["じゃがいも", "牛こま肉"]);
    expect(amounts()).toEqual(["3個", "200g"]);
    expect(categories()).toEqual([Category.VEGETABLE, Category.OTHER]);
  });

  it("**全欄が空の行はダイアログを出さずに消す**（カテゴリを変えていても）", () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "＋ 行を追加" }));
    fireEvent.change(screen.getByRole("combobox", { name: "カテゴリ（4行目）" }), {
      target: { value: Category.VEGETABLE },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "材料名（4行目）" }), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "4行目を削除" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(names()).toEqual(["じゃがいも", "塩", "牛こま肉"]);
  });
});
