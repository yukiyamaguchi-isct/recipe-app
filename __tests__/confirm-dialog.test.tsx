import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "@/app/confirm-dialog";

const onCancel = vi.fn();
const onConfirm = vi.fn();

function renderDialog(props: { busy?: boolean; busyLabel?: string } = {}) {
  return render(
    <ConfirmDialog
      heading="この行を削除"
      cancelLabel="やめる"
      confirmLabel="削除する"
      onCancel={onCancel}
      onConfirm={onConfirm}
      {...props}
    >
      <p>「しょうゆ 大さじ2」を削除します。</p>
    </ConfirmDialog>,
  );
}

/** 背景（ダイアログ本体の外側の覆い）。role を持たないので構造で取る */
function backdrop() {
  return screen.getByRole("dialog").parentElement as HTMLElement;
}

beforeEach(() => {
  onCancel.mockReset();
  onConfirm.mockReset();
});

describe("ConfirmDialog", () => {
  it("dialog として出て、見出しで名前が付く（aria-labelledby）", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog", { name: "この行を削除" });

    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("本文（children）を出す", () => {
    renderDialog();

    expect(
      within(screen.getByRole("dialog")).getByText("「しょうゆ 大さじ2」を削除します。"),
    ).toBeTruthy();
  });

  it("**破壊的動作を上に置かない。** 上が cancelLabel、下が confirmLabel", () => {
    renderDialog();

    const labels = within(screen.getByRole("dialog"))
      .getAllByRole("button")
      .map((button) => button.textContent);

    expect(labels).toEqual(["やめる", "削除する"]);
  });

  it("開いた直後は上のボタン（非破壊側）に焦点がある", () => {
    renderDialog();

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "やめる" }));
  });

  it("ボタンは type=button（form の中に置かれても送信しない）", () => {
    renderDialog();

    for (const button of within(screen.getByRole("dialog")).getAllByRole("button")) {
      expect(button.getAttribute("type")).toBe("button");
    }
  });

  it("上のボタンで onCancel、下のボタンで onConfirm", () => {
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "やめる" }));
    fireEvent.click(screen.getByRole("button", { name: "削除する" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("Escape で onCancel", () => {
    renderDialog();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("背景を押すと onCancel。中身を押しても呼ばない", () => {
    renderDialog();

    fireEvent.click(screen.getByRole("heading", { name: "この行を削除" }));
    expect(onCancel).not.toHaveBeenCalled();

    fireEvent.click(backdrop());
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("閉じたら Escape の購読を外す（別の画面で Escape が効き続けない）", () => {
    const { unmount } = renderDialog();

    unmount();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onCancel).not.toHaveBeenCalled();
  });

  describe("処理中（busy）", () => {
    it("Escape・背景クリックで閉じない", () => {
      renderDialog({ busy: true });

      fireEvent.keyDown(document, { key: "Escape" });
      fireEvent.click(backdrop());

      expect(onCancel).not.toHaveBeenCalled();
    });

    it("両方のボタンを押せない", () => {
      renderDialog({ busy: true, busyLabel: "削除中…" });

      for (const button of within(screen.getByRole("dialog")).getAllByRole("button")) {
        expect((button as HTMLButtonElement).disabled).toBe(true);
      }
    });

    it("下のボタンのラベルが busyLabel になる。省略時は confirmLabel のまま", () => {
      const { unmount } = renderDialog({ busy: true, busyLabel: "削除中…" });
      expect(screen.getByRole("button", { name: "削除中…" })).toBeTruthy();
      unmount();

      renderDialog({ busy: true });
      expect(screen.getByRole("button", { name: "削除する" })).toBeTruthy();
    });
  });
});
