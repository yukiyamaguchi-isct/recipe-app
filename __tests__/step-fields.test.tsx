import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));

// ⚠️ useRouter を返さないモックだと「No "useRouter" export is defined」で落ちる（recipe-list 落とし穴 #32）
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: replaceMock }) }));

import { RecipeEditor, type EditorStep } from "@/app/recipes/[id]/edit/recipe-editor";
import { Category } from "@/generated/prisma/enums";

const RECIPE_ID = "clr1a2b3c4d5e6f7g8h9";

const STEPS: EditorStep[] = [
  { id: "s1", text: "じゃがいもを切る。" },
  { id: "s2", text: "炒める。\n水を加える。" },
  { id: "s3", text: "煮る。" },
];

function renderEditor(steps = STEPS) {
  return render(
    <RecipeEditor
      recipeId={RECIPE_ID}
      ingredients={[{ id: "i1", name: "じゃがいも", amount: "3個", category: Category.VEGETABLE }]}
      steps={steps}
    />,
  );
}

/** 作り方の節（材料の節と取り違えない） */
const section = () => screen.getByRole("region", { name: "作り方" });
const texts = () =>
  within(section())
    .getAllByRole("textbox")
    .map((textarea) => (textarea as HTMLTextAreaElement).value);
/** 画面に出ている手順番号（丸の中の数字） */
const numbers = () =>
  within(section())
    .getAllByRole("listitem")
    .map((item) => item.querySelector("[aria-hidden=true]")?.textContent);

beforeEach(() => {
  replaceMock.mockReset();
});

describe("初期表示", () => {
  it("「作り方」の節が**材料の節の下**にある（決定①）", () => {
    renderEditor();

    const ingredients = screen.getByRole("region", { name: "材料" });

    expect(
      ingredients.compareDocumentPosition(section()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("保存済みの手順が順に並び、番号が 1 から振られる", () => {
    renderEditor();

    expect(texts()).toEqual(["じゃがいもを切る。", "炒める。\n水を加える。", "煮る。"]);
    expect(numbers()).toEqual(["1", "2", "3"]);
  });

  it("本文は複数行の入力欄（textarea）で、改行を保つ", () => {
    renderEditor();

    const second = screen.getByRole("textbox", { name: "手順2の本文" });

    expect(second.tagName).toBe("TEXTAREA");
    expect((second as HTMLTextAreaElement).value).toBe("炒める。\n水を加える。");
  });

  it("順序リスト（ol）で並べる（読み上げに何番目かが伝わる）", () => {
    renderEditor();

    expect(within(section()).getByRole("list").tagName).toBe("OL");
  });

  it("**並べ替えの操作を持たない**（決定①）", () => {
    renderEditor();

    const labels = within(section())
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label") ?? button.textContent);

    expect(labels).toEqual(["手順1を削除", "手順2を削除", "手順3を削除", "＋ 手順を追加"]);
  });

  it("手順0件でも節と「＋ 手順を追加」が出る", () => {
    renderEditor([]);

    expect(within(section()).queryAllByRole("textbox")).toEqual([]);
    expect(screen.getByRole("button", { name: "＋ 手順を追加" })).toBeTruthy();
  });
});

describe("書き換えと追加", () => {
  it("本文を書き換えられる", () => {
    renderEditor();

    fireEvent.change(screen.getByRole("textbox", { name: "手順3の本文" }), {
      target: { value: "弱火で10分煮る。" },
    });

    expect(texts()[2]).toBe("弱火で10分煮る。");
  });

  it("「＋ 手順を追加」で末尾に空の手順が増え、続き番号になり、本文にフォーカスが移る", () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "＋ 手順を追加" }));

    expect(texts()).toEqual(["じゃがいもを切る。", "炒める。\n水を加える。", "煮る。", ""]);
    expect(numbers()).toEqual(["1", "2", "3", "4"]);
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "手順4の本文" }));
  });

  it("材料の行と手順を続けて足しても、互いの入力欄を取り違えない（key の連番を共有）", () => {
    renderEditor([]);

    fireEvent.click(screen.getByRole("button", { name: "＋ 行を追加" }));
    fireEvent.click(screen.getByRole("button", { name: "＋ 手順を追加" }));

    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "手順1の本文" }));
    expect(screen.getAllByRole("textbox", { name: /^材料名/ })).toHaveLength(2);
  });
});

describe("手順の削除", () => {
  it("本文のある手順は確認ダイアログを出し、番号を書く。**「元に戻せません」は書かない**", () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "手順2を削除" }));

    const dialog = screen.getByRole("dialog", { name: "この手順を削除" });
    expect(dialog.textContent).toContain("手順2を削除します。");
    expect(dialog.textContent).not.toContain("元に戻せません");
  });

  it("「やめる」で閉じ、手順が残る", () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "手順2を削除" }));
    fireEvent.click(screen.getByRole("button", { name: "やめる" }));

    expect(texts()).toHaveLength(3);
  });

  it("途中の手順を消すと、以降の番号が詰まり、フォーカスが「＋ 手順を追加」へ移る", () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "手順2を削除" }));
    fireEvent.click(screen.getByRole("button", { name: "削除する" }));

    expect(texts()).toEqual(["じゃがいもを切る。", "煮る。"]);
    expect(numbers()).toEqual(["1", "2"]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "＋ 手順を追加" }));
  });

  it("**途中の手順を消しても、後ろの手順の入力欄は同じ要素のまま**（落とし穴 #N4）", () => {
    renderEditor();

    const last = screen.getByRole("textbox", { name: "手順3の本文" });

    fireEvent.click(screen.getByRole("button", { name: "手順1を削除" }));
    fireEvent.click(screen.getByRole("button", { name: "削除する" }));

    expect(last.isConnected).toBe(true);
    expect((last as HTMLTextAreaElement).value).toBe("煮る。");
  });

  it("**空（空白だけを含む）の手順はダイアログを出さずに消す**", () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "＋ 手順を追加" }));
    fireEvent.change(screen.getByRole("textbox", { name: "手順4の本文" }), {
      target: { value: " \n " },
    });
    fireEvent.click(screen.getByRole("button", { name: "手順4を削除" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(texts()).toHaveLength(3);
  });
});
