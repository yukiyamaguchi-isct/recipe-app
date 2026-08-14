/**
 * アプリ内で投げる型付きエラーの基底。
 *
 * `code` は API レスポンスの `error.code` にそのまま載る
 * （`.kiro/steering/architecture.md` の「API レスポンス形式」）。
 * Route Handler 側はこの code を見て HTTP ステータスに変換する。
 */
export class AppError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = new.target.name;
  }
}

/** ログインしていない状態で、ログインが必要な処理を呼んだ。HTTP では 401 に対応する。 */
export class UnauthorizedError extends AppError {
  constructor(message = "ログインが必要です。") {
    super("UNAUTHORIZED", message);
  }
}
