import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));

// ⚠️ useRouter を返さないモックだと「No "useRouter" export is defined」で落ちる（recipe-list 落とし穴 #32）
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: replaceMock }) }));

import {
  RecipeEditor,
  type EditorIngredient,
  type EditorStep,
} from "@/app/recipes/[id]/edit/recipe-editor";
import { Category } from "@/generated/prisma/enums";

const RECIPE_ID = "clr1a2b3c4d5e6f7g8h9";

const INGREDIENTS: EditorIngredient[] = [
  { id: "i1", name: "じゃがいも", amount: "3個", category: Category.VEGETABLE },
  { id: "i2", name: "塩", amount: null, category: Category.SEASONING },
];
const STEPS: EditorStep[] = [{ id: "s1", text: "切る。" }];

function renderEditor() {
  return render(<RecipeEditor recipeId={RECIPE_ID} ingredients={INGREDIENTS} steps={STEPS} />);
}

const type = (name: string, value: string) =>
  fireEvent.change(screen.getByRole("textbox", { name }), { target: { value } });
const cancel = () => fireEvent.click(screen.getByRole("button", { name: "← 中止" }));

/**
 * 再読み込み・閉じるの直前にブラウザが送るイベントを再現し、**止められたか**を返す。
 * jsdom ではブラウザの確認は出ないので、`preventDefault()` されたかで見る（design.md 8章）。
 */
function beforeUnloadBlocked(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

const fetchMock = vi.fn();

beforeEach(() => {
  replaceMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("← 中止", () => {
  it("**変更が無ければダイアログ無しで** S-04 へ replace", () => {
    renderEditor();

    cancel();

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(replaceMock).toHaveBeenCalledWith(`/recipes/${RECIPE_ID}`);
  });

  it("変更があれば破棄確認を出し、まだ戻らない", () => {
    renderEditor();

    type("材料名（1行目）", "新じゃが");
    cancel();

    const dialog = screen.getByRole("dialog", { name: "編集を破棄" });
    expect(dialog.textContent).toContain("保存していない変更は失われます。");
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("**破壊的動作を上に置かない**: 上が「編集を続ける」、下が「破棄する」。焦点は「編集を続ける」", () => {
    renderEditor();

    type("材料名（1行目）", "新じゃが");
    cancel();

    const labels = within(screen.getByRole("dialog"))
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(labels).toEqual(["編集を続ける", "破棄する"]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "編集を続ける" }));
  });

  it("「編集を続ける」/ Escape で閉じ、入力が残る", () => {
    renderEditor();

    type("材料名（1行目）", "新じゃが");
    cancel();
    fireEvent.click(screen.getByRole("button", { name: "編集を続ける" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      (screen.getByRole("textbox", { name: "材料名（1行目）" }) as HTMLInputElement).value,
    ).toBe("新じゃが");

    cancel();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("「破棄する」で S-04 へ replace。**何も送らない**", () => {
    renderEditor();

    type("材料名（1行目）", "新じゃが");
    cancel();
    fireEvent.click(screen.getByRole("button", { name: "破棄する" }));

    expect(replaceMock).toHaveBeenCalledWith(`/recipes/${RECIPE_ID}`);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/** 「変更がある」の定義（design.md 5.5 / 落とし穴 #N5）: 保存したら DB に書かれる内容が違うか */
describe("何を「変更」と数えるか", () => {
  it.each([
    ["材料名を変える", () => type("材料名（1行目）", "新じゃが")],
    ["分量を変える", () => type("分量（2行目）", "少々")],
    [
      "カテゴリを変える",
      () =>
        fireEvent.change(screen.getByRole("combobox", { name: "カテゴリ（1行目）" }), {
          target: { value: Category.OTHER },
        }),
    ],
    ["手順の本文を変える", () => type("手順1の本文", "薄く切る。")],
    [
      "行を消す",
      () => {
        fireEvent.click(screen.getByRole("button", { name: "2行目を削除" }));
        fireEvent.click(screen.getByRole("button", { name: "削除する" }));
      },
    ],
    [
      "値の入った行を足す",
      () => {
        fireEvent.click(screen.getByRole("button", { name: "＋ 行を追加" }));
        type("材料名（3行目）", "バター");
      },
    ],
  ])("%s → 変更あり", (_label, act) => {
    renderEditor();

    act();
    cancel();

    expect(screen.getByRole("dialog", { name: "編集を破棄" })).toBeTruthy();
  });

  it.each([
    ["何もしない", () => {}],
    [
      "**空の行を足しただけ**（保存すると捨てられる）",
      () => fireEvent.click(screen.getByRole("button", { name: "＋ 行を追加" })),
    ],
    [
      "空の手順を足しただけ",
      () => fireEvent.click(screen.getByRole("button", { name: "＋ 手順を追加" })),
    ],
    ["前後に空白を足しただけ", () => type("材料名（1行目）", "  じゃがいも  ")],
    [
      "変えてから元に戻した",
      () => {
        type("材料名（1行目）", "新じゃが");
        type("材料名（1行目）", "じゃがいも");
      },
    ],
  ])("%s → 変更なし", (_label, act) => {
    renderEditor();

    act();
    cancel();

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(replaceMock).toHaveBeenCalled();
  });
});

describe("beforeunload（再読み込み・閉じる・URL 直打ち）", () => {
  it("**変更が無ければ止めない**（落とし穴 #N7）", () => {
    renderEditor();

    expect(beforeUnloadBlocked()).toBe(false);
  });

  it("変更があれば止める", () => {
    renderEditor();

    type("材料名（1行目）", "新じゃが");

    expect(beforeUnloadBlocked()).toBe(true);
  });

  it("元に戻すと止めなくなる（登録を外す）", () => {
    renderEditor();

    type("材料名（1行目）", "新じゃが");
    type("材料名（1行目）", "じゃがいも");

    expect(beforeUnloadBlocked()).toBe(false);
  });

  it("空の行を足しただけでは止めない", () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "＋ 行を追加" }));

    expect(beforeUnloadBlocked()).toBe(false);
  });

  it("画面を離れたら登録を外す", () => {
    const { unmount } = renderEditor();

    type("材料名（1行目）", "新じゃが");
    unmount();

    expect(beforeUnloadBlocked()).toBe(false);
  });

  it("保存に成功したら、アプリ内の遷移（replace）で離れる。離脱確認は出さない", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { id: RECIPE_ID }, error: null }), {
        status: 200,
      }),
    );
    renderEditor();

    type("材料名（1行目）", "新じゃが");
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    // replace はクライアント遷移で beforeunload を発火させない（design.md 1.3）。
    // 破棄確認のダイアログも出ていないことを見る
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith(`/recipes/${RECIPE_ID}`));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
