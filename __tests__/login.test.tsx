import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// @/auth を実体で読むと lib/prisma.ts が評価され、DATABASE_URL 未設定で落ちる。
// この画面のテストで見たいのは描画内容だけなので、signIn だけを差し替える。
vi.mock("@/auth", () => ({ signIn: vi.fn() }));

import LoginPage from "@/app/login/page";

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

  it("キャンセルしたときは原因と次の行動が表示される", async () => {
    render(await renderLoginPage({ error: "AccessDenied" }));

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("キャンセル");
    expect(alert.textContent).toContain("もう一度お試しください");
  });

  it("想定外のエラーコードでも既定のメッセージが表示される", async () => {
    render(await renderLoginPage({ error: "SomethingUnexpected" }));

    expect(screen.getByRole("alert").textContent).toContain("ログインできませんでした");
  });

  it("エラーが無ければ警告は表示されない", async () => {
    render(await renderLoginPage());

    expect(screen.queryByRole("alert")).toBeNull();
  });
});
