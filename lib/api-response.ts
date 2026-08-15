import { AppError } from "@/lib/errors";

/**
 * すべての Route Handler が返す形（`.kiro/steering/architecture.md`「API レスポンス形式」）。
 *
 *   成功: { success: true,  data: {...}, error: null }
 *   失敗: { success: false, data: null,  error: { code, message } }
 *
 * **型付きエラーを HTTP に変換する唯一の場所**（design.md 5.4）。
 * Route Handler が個別に status を組み立てると、対応表が散らばって食い違う。
 */

export type ApiError = { code: string; message: string };

export type ApiSuccessBody<T> = { success: true; data: T; error: null };
export type ApiFailureBody = { success: false; data: null; error: ApiError };
export type ApiResponseBody<T> = ApiSuccessBody<T> | ApiFailureBody;

/**
 * エラーコードと HTTP ステータスの対応表。
 *
 * ここに載っていないコードは 500 になる。**新しいエラーを足したらこの表にも足す。**
 * 表と `lib/errors.ts` のズレは `__tests__/api-response.test.ts` が検出する。
 */
const STATUS: Record<string, number> = {
  UNAUTHORIZED: 401,
  INVALID_IMAGE: 400,
  IMAGE_TOO_LARGE: 413,
  UNSUPPORTED_FORMAT: 415,
  ANALYSIS_FAILED: 422,
  // 拒否も「リクエストは正しいが内容を処理できない」なので ANALYSIS_FAILED と同じ 422。
  ANALYSIS_REFUSED: 422,
  ANALYSIS_TIMEOUT: 504,
  STORAGE_FAILED: 502,
};

/** 想定していない例外に使う。**原因を一切明かさない**ための固定文言。 */
const INTERNAL_ERROR: ApiError = {
  code: "INTERNAL_ERROR",
  message: "問題が発生しました。しばらくしてからもう一度お試しください。",
};

export function statusFor(code: string): number {
  return STATUS[code] ?? 500;
}

export function successBody<T>(data: T): ApiSuccessBody<T> {
  return { success: true, data, error: null };
}

/**
 * 例外をレスポンスの body に変換する。
 *
 * **`AppError` 以外は中身を見ない。** 外部ライブラリの例外メッセージには
 * 接続先ホスト・バケット名・APIキーの断片が入りうるため、そのまま返すと漏れる（design.md 7章）。
 */
export function failureBody(error: unknown): ApiFailureBody {
  if (error instanceof AppError) {
    return { success: false, data: null, error: { code: error.code, message: error.message } };
  }
  return { success: false, data: null, error: INTERNAL_ERROR };
}

export function successResponse<T>(data: T): Response {
  return Response.json(successBody(data), { status: 200 });
}

/**
 * 例外を HTTP レスポンスにする。
 *
 * **例外を握り潰さない**（`.kiro/steering/architecture.md`）。想定外のものは
 * サーバー側のログに出してから、当たり障りのない 500 を返す。
 */
export function errorResponse(error: unknown): Response {
  if (!(error instanceof AppError)) {
    console.error("[api] 未分類の例外", error);
    return Response.json(failureBody(error), { status: 500 });
  }

  // cause は内部情報なのでレスポンスには載せない。原因調査のためログにだけ残す。
  if (error.cause !== undefined) {
    console.error(`[api] ${error.code}`, error.cause);
  }
  return Response.json(failureBody(error), { status: statusFor(error.code) });
}
