import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));

// ⚠️ useRouter を返さないモックだと「No "useRouter" export is defined」で落ちる（recipe-list 落とし穴 #32）
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: replaceMock }) }));

import { EditHeader } from "@/app/recipes/[id]/edit/edit-header";
import { RecipeEditor } from "@/app/recipes/[id]/edit/recipe-editor";
import { editPath } from "@/app/recipes/[id]/mode";

const RECIPE_ID = "clr1a2b3c4d5e6f7g8h9";

function renderEditor() {
  return render(<RecipeEditor recipeId={RECIPE_ID} ingredients={[]} steps={[]} />);
}

beforeEach(() => {
  replaceMock.mockReset();
});

describe("S-05 のヘッダー", () => {
  it("**見出しは「レシピを編集」**（資料の「材料を編集」から変えた。食い違い9）", () => {
    renderEditor();

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("レシピを編集");
    expect(screen.queryByText("材料を編集")).toBeNull();
  });

  it("`← 中止` と「保存」がボタンとして出る", () => {
    renderEditor();

    expect(screen.getByRole("button", { name: "← 中止" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "保存" })).toBeTruthy();
  });

  it("**ボタンは type=button**（Enter で意図せず送信しない。落とし穴 #N3）", () => {
    renderEditor();

    for (const button of screen.getAllByRole("button")) {
      expect(button.getAttribute("type")).toBe("button");
    }
  });

  it("`← 中止` は S-04 通常モードへ replace で戻る（push ではない。落とし穴 #N10）", () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "← 中止" }));

    expect(replaceMock).toHaveBeenCalledWith(`/recipes/${RECIPE_ID}`);
  });

  it("`← 中止` は「移動」の見た目（面も枠も持たない）", () => {
    renderEditor();

    const cancel = screen.getByRole("button", { name: "← 中止" });

    // `(^|\s)bg-` で見る。素の /bg-/ だと hover:bg- にも当たる（recipe-list design.md 6.5）
    expect(cancel.className).not.toMatch(/(^|\s)bg-/);
    expect(cancel.className).not.toMatch(/(^|\s)border(\s|-)/);
  });

  it("保存中は「保存中…」になり押せない（二重送信の1層目）", () => {
    const onSave = vi.fn();
    render(<EditHeader onCancel={vi.fn()} onSave={onSave} saving />);

    const save = screen.getByRole("button", { name: "保存中…" }) as HTMLButtonElement;

    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("保存中でなければ「保存」で onSave が呼ばれる", () => {
    const onSave = vi.fn();
    render(<EditHeader onCancel={vi.fn()} onSave={onSave} saving={false} />);

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

describe("editPath", () => {
  it("S-05 のパスは /recipes/<id>/edit（design.md 4.3）", () => {
    expect(editPath(RECIPE_ID)).toBe(`/recipes/${RECIPE_ID}/edit`);
  });
});
