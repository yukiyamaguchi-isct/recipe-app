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
 * **Phase 3 では「編集する」を出さない**（design.md 6.8）。
 *
 * 遷移先の S-05 は Phase 5 で、**ヘッダーの「編集」を Phase 5 まで出さないという
 * ユーザー決定（requirements.md 決着2）と揃える。**
 */
describe("Phase 3 では編集の導線を出さない", () => {
  it("「編集する」を出さない", () => {
    render(<ConfirmBar recipeId={RECIPE_ID} />);

    expect(screen.queryByRole("button", { name: /編集/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /編集/ })).toBeNull();
  });

  it("ボタンは1つだけ", () => {
    render(<ConfirmBar recipeId={RECIPE_ID} />);

    expect(screen.getAllByRole("button")).toHaveLength(1);
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
