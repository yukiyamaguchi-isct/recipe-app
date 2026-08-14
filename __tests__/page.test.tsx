import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock のファクトリは巻き上げられるため、参照するモックも vi.hoisted で巻き上げる。
const { authMock, redirectMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  redirectMock: vi.fn(),
}));

// 実体を読むと lib/prisma.ts が評価され、DATABASE_URL 未設定の環境で落ちる。
vi.mock("@/auth", () => ({ auth: authMock, signOut: vi.fn() }));

// 本物の redirect() は例外を投げて描画を中断する。その挙動を再現する。
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import Home from "@/app/page";

beforeEach(() => {
  authMock.mockReset();
  redirectMock.mockReset();
  redirectMock.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });
});

describe("ホーム", () => {
  it("ログイン中はユーザー名とログアウトが表示される", async () => {
    authMock.mockResolvedValue({
      user: { id: "user_123", name: "テスト太郎", email: "test@example.com" },
    });

    render(await Home());

    expect(screen.getByRole("heading", { level: 1 })).toBeDefined();
    expect(screen.getByText(/テスト太郎/)).toBeDefined();
    expect(screen.getByRole("button", { name: "ログアウト" })).toBeDefined();
  });

  it("名前が無ければメールアドレスを表示する", async () => {
    authMock.mockResolvedValue({
      user: { id: "user_123", email: "test@example.com" },
    });

    render(await Home());

    expect(screen.getByText(/test@example.com/)).toBeDefined();
  });

  // 認可の本体は proxy ではなくこちら。proxy.ts を外してもこの保護は成立する
  // （design.md 調査結果4）。それをテストで固定する。
  it("未ログインなら /login にリダイレクトする", async () => {
    authMock.mockResolvedValue(null);

    await expect(Home()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });
});
