import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock のファクトリは巻き上げられるため、参照するモックも vi.hoisted で巻き上げる。
const { authMock, redirectMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  redirectMock: vi.fn(),
}));

// @/auth を実体で読むと lib/prisma.ts が評価され、DATABASE_URL 未設定で落ちる。
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import UploadPage from "@/app/upload/page";
import { PhotoPicker } from "@/app/upload/photo-picker";
import { ImageTooLargeError, UnsupportedFormatError } from "@/lib/errors";
import { MAX_IMAGE_BYTES } from "@/lib/images/constants";

beforeEach(() => {
  authMock.mockReset();
  authMock.mockResolvedValue({ user: { id: "user_1" } });
  redirectMock.mockReset();
  redirectMock.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });

  // jsdom には Object URL が無い。プレビューの生成・解放だけ差し替える
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

function file(name: string, type: string, size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

/** ブラウザがダイアログ確定後に起こすのと同じイベントを、隠した input に直接送る。 */
function choose(container: HTMLElement, chosen: File, which: "camera" | "library" = "library") {
  const inputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]');
  const input = which === "camera" ? inputs[0] : inputs[1];

  fireEvent.change(input, { target: { files: [chosen] } });
}

describe("S-03 ページの保護", () => {
  it("未ログインなら /login へ送る", async () => {
    authMock.mockResolvedValue(null);

    await expect(UploadPage()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  // proxy.ts を外しても保護が成立していること（design.md 5.4）。
  it("ログイン済みなら写真の選択を描画する", async () => {
    render(await UploadPage());

    expect(screen.getByRole("button", { name: "写真を選ぶ" })).toBeDefined();
  });
});

describe("S-03 選択前の表示", () => {
  it("受け付ける形式と上限を画面に出す（UI_DESIGN.md S-03）", () => {
    render(<PhotoPicker />);

    expect(screen.getByText(/JPEG \/ PNG・10MBまで/)).toBeDefined();
  });

  it("撮影を第一候補に置く", () => {
    render(<PhotoPicker />);

    expect(screen.getByRole("button", { name: "カメラで撮る" })).toBeDefined();
  });

  it("中止で一覧へ戻れる", () => {
    render(<PhotoPicker />);

    expect(screen.getByRole("link", { name: "← 中止" }).getAttribute("href")).toBe("/");
  });

  it("入力欄は JPEG / PNG だけを受け付ける", () => {
    const { container } = render(<PhotoPicker />);

    for (const input of container.querySelectorAll<HTMLInputElement>('input[type="file"]')) {
      expect(input.getAttribute("accept")).toBe("image/jpeg,image/png");
    }
  });
});

describe("S-03 検証エラーをその場に出す（Req2 / Req6）", () => {
  it("HEIC を選ぶと理由と代わりの手段が出る", () => {
    const { container } = render(<PhotoPicker />);

    choose(container, file("IMG_0001.heic", "image/heic"));

    expect(screen.getByRole("alert").textContent).toContain(new UnsupportedFormatError().message);
  });

  it("10MB 超を選ぶとサイズの案内が出る", () => {
    const { container } = render(<PhotoPicker />);

    choose(container, file("big.jpg", "image/jpeg", MAX_IMAGE_BYTES + 1));

    expect(screen.getByRole("alert").textContent).toContain(new ImageTooLargeError().message);
  });

  it("カメラ側から選んでも同じ検証が働く", () => {
    const { container } = render(<PhotoPicker />);

    choose(container, file("IMG_0001.heic", "image/heic"), "camera");

    expect(screen.getByRole("alert")).toBeDefined();
  });

  // 使えない写真を大きく映したまま残さない。
  it("弾いた写真はプレビューしない", () => {
    const { container } = render(<PhotoPicker />);

    choose(container, file("IMG_0001.heic", "image/heic"));

    expect(screen.queryByAltText("選んだレシピの写真")).toBeNull();
  });

  it("エラーの後に正しい写真を選ぶとエラーが消える", () => {
    const { container } = render(<PhotoPicker />);

    choose(container, file("IMG_0001.heic", "image/heic"));
    choose(container, file("recipe.jpg", "image/jpeg"));

    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("S-03 選択後の表示", () => {
  it("選んだ写真をプレビューする", () => {
    const { container } = render(<PhotoPicker />);

    choose(container, file("recipe.jpg", "image/jpeg"));

    expect(screen.getByAltText("選んだレシピの写真").getAttribute("src")).toBe("blob:preview");
  });

  it("選び直せる", () => {
    const { container } = render(<PhotoPicker />);

    choose(container, file("recipe.jpg", "image/jpeg"));

    expect(screen.getByRole("button", { name: "選び直す" })).toBeDefined();
  });

  it("プレビュー用の URL を選び直しのたびに解放する", () => {
    const { container } = render(<PhotoPicker />);

    choose(container, file("a.jpg", "image/jpeg"));
    choose(container, file("b.jpg", "image/jpeg"));

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });
});

describe("ファイルサイズの表示", () => {
  // MB 固定にすると小さい画像が「0.0MB」になり、壊れているように見える。
  it("0.1MB 未満は KB で出す", () => {
    const { container } = render(<PhotoPicker />);

    choose(container, file("small.jpg", "image/jpeg", 48 * 1024));

    expect(screen.getByText(/48KB/)).toBeDefined();
  });

  it("0.1MB 以上は MB で出す", () => {
    const { container } = render(<PhotoPicker />);

    choose(container, file("big.jpg", "image/jpeg", 3 * 1024 * 1024));

    expect(screen.getByText(/3\.0MB/)).toBeDefined();
  });
});
