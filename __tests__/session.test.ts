import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock のファクトリはファイル先頭に巻き上げられるため、
// 参照するモックは vi.hoisted で一緒に巻き上げる。
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));

// 実体を読むと lib/prisma.ts が評価され、DATABASE_URL 未設定の環境で落ちる。
vi.mock("@/auth", () => ({ auth: authMock }));

import { getUserId, requireUserId } from "@/lib/auth/session";
import { UnauthorizedError } from "@/lib/errors";

beforeEach(() => {
  authMock.mockReset();
});

describe("getUserId", () => {
  it("ログイン中なら userId を返す", async () => {
    authMock.mockResolvedValue({ user: { id: "user_123" } });

    await expect(getUserId()).resolves.toBe("user_123");
  });

  it("未ログインなら null を返す", async () => {
    authMock.mockResolvedValue(null);

    await expect(getUserId()).resolves.toBeNull();
  });

  // jwt コールバックが userId を載せ損ねた場合。
  // 「セッションはあるが id が無い」を素通りさせると、後続が undefined を
  // userId として扱ってしまうため、未ログインと同じ扱いにする。
  it("セッションはあるが id が無いなら null を返す", async () => {
    authMock.mockResolvedValue({ user: { name: "テスト太郎" } });

    await expect(getUserId()).resolves.toBeNull();
  });
});

describe("requireUserId", () => {
  it("ログイン中なら userId を返す", async () => {
    authMock.mockResolvedValue({ user: { id: "user_123" } });

    await expect(requireUserId()).resolves.toBe("user_123");
  });

  it("未ログインなら UnauthorizedError を投げる", async () => {
    authMock.mockResolvedValue(null);

    await expect(requireUserId()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("投げるエラーは code が UNAUTHORIZED である", async () => {
    authMock.mockResolvedValue(null);

    await expect(requireUserId()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
