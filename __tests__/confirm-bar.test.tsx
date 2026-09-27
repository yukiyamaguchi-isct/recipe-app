import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock のファクトリは巻き上げられるため、参照するモックも vi.hoisted で巻き上げる。
const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: replaceMock }) }));

import { ConfirmBar } from "@/app/recipes/[id]/confirm-bar";
import { CONFIRM_PARAM, modeFromSearchParams } from "@/app/recipes/[id]/mode";

const RECIPE_ID = "clr1a2b3c4d5e6f7g8h9";

beforeEach(() => {
  replaceMock.mockReset();
});

describe("ConfirmBar", () => {
  it("「この内容で決定」を出す", () => {
    render(<ConfirmBar recipeId={RECIPE_ID} />);

    expect(screen.getByRole("button", { name: "この内容で決定" })).toBeDefined();
  });

  it("押すとクエリを外して通常モードへ移る", () => {
    render(<ConfirmBar recipeId={RECIPE_ID} />);

    fireEvent.click(screen.getByRole("button", { name: "この内容で決定" }));

    expect(replaceMock).toHaveBeenCalledWith(`/recipes/${RECIPE_ID}`);
  });

  it("push ではなく replace を使う（戻るで確認モードに戻さない）", () => {
    render(<ConfirmBar recipeId={RECIPE_ID} />);

    fireEvent.click(screen.getByRole("button", { name: "この内容で決定" }));

    // 読み終えた画面へ戻す意味が無い
    expect(replaceMock.mock.calls[0][0]).not.toContain(CONFIRM_PARAM);
  });
});

/**
 * **Phase 5 で「編集する」を戻した**（recipe-edit 決定② / README「Screens 5」）。
 * Phase 3 は遷移先の S-05 が無いため出していなかった（recipe-view design.md 6.8）。
 */
describe("編集の導線（Phase 5）", () => {
  it("「編集する」を出し、編集画面（/recipes/<id>/edit）へ行ける", () => {
    render(<ConfirmBar recipeId={RECIPE_ID} />);

    expect(screen.getByRole("link", { name: "編集する" }).getAttribute("href")).toBe(
      `/recipes/${RECIPE_ID}/edit`,
    );
  });

  it("**並びは「この内容で決定」→「編集する」**（主要が上。README「Screens 5」）", () => {
    const { container } = render(<ConfirmBar recipeId={RECIPE_ID} />);

    const labels = [...container.querySelectorAll("button, a")].map(
      (element) => element.textContent,
    );
    expect(labels).toEqual(["この内容で決定", "編集する"]);
  });

  it("「編集する」は副次の見た目（枠線を持ち、主要の面を持たない）", () => {
    render(<ConfirmBar recipeId={RECIPE_ID} />);

    const className = screen.getByRole("link", { name: "編集する" }).className;
    expect(className).toMatch(/(^|\s)border-\[1\.5px\]/);
    expect(className).not.toMatch(/(^|\s)bg-primary(\s|$)/);
  });

  it("「編集する」を押しても「この内容で決定」の処理（replace）は走らない", () => {
    render(<ConfirmBar recipeId={RECIPE_ID} />);

    fireEvent.click(screen.getByRole("link", { name: "編集する" }));

    expect(replaceMock).not.toHaveBeenCalled();
  });
});

describe("本文がバーに隠れないようにする（落とし穴 #11）", () => {
  it("バーの高さを CSS 変数に流す", () => {
    render(<ConfirmBar recipeId={RECIPE_ID} />);

    // jsdom では 0px になる。ここで見たいのは「設定しているか」だけ
    expect(document.documentElement.style.getPropertyValue("--recipe-bottom-bar-h")).not.toBe("");
  });

  it("画面を離れたら CSS 変数を戻す（通常モードに余白を残さない）", () => {
    const { unmount } = render(<ConfirmBar recipeId={RECIPE_ID} />);
    unmount();

    expect(document.documentElement.style.getPropertyValue("--recipe-bottom-bar-h")).toBe("");
  });
});

/**
 * URL から表示モードを決める（design.md 6.8）。
 * **値は見ずキーの有無だけで判定する。**
 */
describe("modeFromSearchParams", () => {
  it("クエリが無ければ通常モード", () => {
    expect(modeFromSearchParams({})).toBe("view");
  });

  it("confirm があれば確認モード", () => {
    expect(modeFromSearchParams({ confirm: "1" })).toBe("confirm");
  });

  it("値が何であっても、あれば確認モード", () => {
    expect(modeFromSearchParams({ confirm: "" })).toBe("confirm");
    expect(modeFromSearchParams({ confirm: "yes" })).toBe("confirm");
  });

  it("関係の無いクエリでは切り替わらない", () => {
    expect(modeFromSearchParams({ from: "upload" })).toBe("view");
  });
});
