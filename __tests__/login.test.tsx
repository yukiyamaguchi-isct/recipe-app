import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock のファクトリは巻き上げられるため、参照するモックも vi.hoisted で巻き上げる。
const { authMock, redirectMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  redirectMock: vi.fn(),
}));

// @/auth を実体で読むと lib/prisma.ts が評価され、DATABASE_URL 未設定で落ちる。
vi.mock("@/auth", () => ({ auth: authMock, signIn: vi.fn() }));

// 本物の redirect() は例外を投げて描画を中断する。その挙動を再現する。
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import LoginPage from "@/app/login/page";

beforeEach(() => {
  authMock.mockReset();
  // 既定は未ログイン。ログイン済みの分岐を見るテストだけ上書きする
  authMock.mockResolvedValue(null);
  redirectMock.mockReset();
  redirectMock.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });
});

// Server Component なので、呼び出して得た JSX を render する。
function renderLoginPage(searchParams: { error?: string } = {}) {
  return LoginPage({ searchParams: Promise.resolve(searchParams) });
}

describe("S-01 ログイン", () => {
  it("Googleでログインのボタンが描画される", async () => {
    render(await renderLoginPage());

    expect(screen.getByRole("button", { name: "Googleでログイン" })).toBeDefined();
  });

  // 認証は Google のみで、入力フォームは存在しない（UI_DESIGN.md S-01）。
  // ワイヤーフレームのアーティファクトにはメール＋パスワードのフォームが描かれているが
  // そちらは古い。うっかり実装が戻らないよう、ここで固定する。
  it("入力欄が存在しない", async () => {
    const { container } = render(await renderLoginPage());

    expect(container.querySelector("input")).toBeNull();
  });

  // Google の同意画面でキャンセルすると Configuration で戻ってくる（design.md 1.8）。
  // AccessDenied ではない。ここを取り違えると「サーバー側の設定に問題があり」という
  // 的外れな案内が出る（実機確認で発覚した）。
  it("キャンセルしたときは原因と次の行動が表示される", async () => {
    render(await renderLoginPage({ error: "Configuration" }));

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("キャンセル");
    expect(alert.textContent).toContain("もう一度お試しください");
  });

  it("キャンセル時の文言はサーバーの設定不備と断定しない", async () => {
    render(await renderLoginPage({ error: "Configuration" }));

    expect(screen.getByRole("alert").textContent).not.toContain("設定に問題");
  });

  it("想定外のエラーコードでも既定のメッセージが表示される", async () => {
    render(await renderLoginPage({ error: "SomethingUnexpected" }));

    expect(screen.getByRole("alert").textContent).toContain("ログインできませんでした");
  });

  it("エラーが無ければ警告は表示されない", async () => {
    render(await renderLoginPage());

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("ログイン済みならホームへリダイレクトする", async () => {
    authMock.mockResolvedValue({ user: { id: "user_123" } });

    await expect(renderLoginPage()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(redirectMock).toHaveBeenCalledWith("/");
  });
});
