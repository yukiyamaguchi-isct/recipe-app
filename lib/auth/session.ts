import { auth } from "@/auth";
import { UnauthorizedError } from "@/lib/errors";

/**
 * ログイン中のユーザーの id を返す。未ログインなら null。
 *
 * **ユーザー固有のデータを扱う箇所は、必ずここから userId を得る。**
 * クライアントから渡された userId を信用しない（`.kiro/steering/architecture.md` の「認証」）。
 *
 * 値の出どころは JWT に載せた userId（auth.ts の jwt / session コールバック）。
 * session strategy が jwt のため、この呼び出しで DB は引かない。
 */
export async function getUserId(): Promise<string | null> {
  const session = await auth();

  return session?.user?.id ?? null;
}

/**
 * ログイン必須の処理で使う。未ログインなら UnauthorizedError を投げる。
 *
 * null を返さないことで、呼び出し側が未ログインを握り潰したまま
 * 先に進むことを防ぐ。Route Handler では 401 に変換する。
 */
export async function requireUserId(): Promise<string> {
  const userId = await getUserId();

  if (!userId) {
    throw new UnauthorizedError();
  }

  return userId;
}
