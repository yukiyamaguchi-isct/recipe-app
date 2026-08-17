/**
 * アプリ内で投げる型付きエラーの基底。
 *
 * `code` は API レスポンスの `error.code` にそのまま載る
 * （`.kiro/steering/architecture.md` の「API レスポンス形式」）。
 * Route Handler 側はこの code を見て HTTP ステータスに変換する。
 *
 * **`message` はユーザーにそのまま見せる日本語**なので、外部APIの生メッセージや
 * バケット名・スタックトレースを入れてはいけない（`design.md` 7章）。
 * 内部の詳細は `cause` に入れる。`cause` はレスポンスには載らず、サーバー側のログにだけ出る。
 */
export class AppError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
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

// ---- Phase 2: recipe-analysis ----
//
// 文言は「原因」と「次にすること」の両方が読み取れるようにする（requirements.md Req6）。
// 対応する HTTP ステータスは lib/api-response.ts の STATUS 表にある。

/** 画像として読めない。壊れたファイル、中身が画像でない、など。HTTP 400。 */
export class InvalidImageError extends AppError {
  constructor(options?: { cause?: unknown }) {
    super(
      "INVALID_IMAGE",
      "画像を読み取れませんでした。ファイルが壊れていないか確認して、もう一度お試しください。",
      options,
    );
  }
}

/** 画像が 10MB を超えている。HTTP 413。 */
export class ImageTooLargeError extends AppError {
  constructor(options?: { cause?: unknown }) {
    super(
      "IMAGE_TOO_LARGE",
      "画像のサイズが大きすぎます。10MB以下の画像を選んでください。",
      options,
    );
  }
}

/**
 * JPEG / PNG 以外を渡された。HEIC はここで弾く。HTTP 415。
 *
 * HEIC は **Claude API 自体が非対応**（design.md 1.1）なので、変換して救う道は無い。
 * 撮影設定を変える手順まで案内する。
 */
export class UnsupportedFormatError extends AppError {
  constructor(options?: { cause?: unknown }) {
    super(
      "UNSUPPORTED_FORMAT",
      "この形式の画像には対応していません。JPEG または PNG を選んでください。iPhone で撮った写真の場合は「設定 > カメラ > フォーマット」を「互換性優先」にすると JPEG で保存されます。",
      options,
    );
  }
}

/** 文字が読み取れなかった、レシピが写っていなかった、構造化出力のパースに失敗した。HTTP 422。 */
export class AnalysisFailedError extends AppError {
  constructor(options?: { cause?: unknown }) {
    super(
      "ANALYSIS_FAILED",
      "レシピの文字を読み取れませんでした。明るい場所で、ページ全体が入るように撮り直してください。",
      options,
    );
  }
}

/**
 * Claude API がタイムアウトした。HTTP 504。
 *
 * 文言は「タイムアウトしました」（2026-08-16 ユーザー決定 / design.md 6.2.3）。
 * **これだけでは Req6 の「次にすること」を満たさない**ので、再試行の案内を続ける。
 */
export class AnalysisTimeoutError extends AppError {
  constructor(options?: { cause?: unknown }) {
    super("ANALYSIS_TIMEOUT", "タイムアウトしました。もう一度お試しください。", options);
  }
}

/**
 * `stop_reason: "refusal"` が返った（design.md 1.3 / 5.1）。HTTP 422。
 *
 * **なぜ拒否されたかを画面に出さない。** 内部の分類理由はユーザーに見せる情報ではない。
 */
export class AnalysisRefusedError extends AppError {
  constructor(options?: { cause?: unknown }) {
    super(
      "ANALYSIS_REFUSED",
      "この画像は解析できませんでした。別のレシピの写真でお試しください。",
      options,
    );
  }
}

/** S3 へのアップロードに失敗した。HTTP 502。**バケット名を文言に含めない。** */
export class StorageFailedError extends AppError {
  constructor(options?: { cause?: unknown }) {
    super(
      "STORAGE_FAILED",
      "画像の保存に失敗しました。通信環境を確認して、もう一度お試しください。",
      options,
    );
  }
}
