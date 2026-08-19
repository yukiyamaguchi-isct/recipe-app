"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { INTERNAL_ERROR, type ApiResponseBody } from "@/lib/api-response";
import { ClientNormalizeError, normalizeImageInBrowser } from "@/lib/images/normalize.client";

/**
 * S-03 の解析。**画面から `POST /api/recipes/analyze` を1本叩くだけ**だが、
 * 30秒前後かかるので「今どこにいるか」を出す必要がある（Req5）。
 *
 * **⚠️ 3段階のうち2つだけが実データ**（design.md 6.1）。
 *
 * | 段階             | 根拠                                          |
 * | ---------------- | --------------------------------------------- |
 * | アップロード中   | **実データ。** XHR の upload progress         |
 * | 文字を読み取り中 | **実データ。** アップロード完了イベント       |
 * | 材料を仕分け中   | **推定。** 一定秒数の経過で切り替えているだけ |
 *
 * 同期POST1本である以上サーバー側の進捗は見えない。**これを「実際の進捗」と偽らない。**
 */

/** デザイン側の State Management と同じ名前にしてある（design.md 6.2 / handoff） */
export type AnalysisState =
  | { phase: "idle" }
  /** `uploaded` は 0〜1。**実データ** */
  | { phase: "uploading"; uploaded: number }
  | { phase: "ocr" }
  | { phase: "categorizing" }
  | { phase: "done"; recipeId: string }
  | { phase: "error"; message: string };

export type AnalysisPhase = AnalysisState["phase"];

/** 解析中とみなす段階。離脱のブロックと「中止」の無効化はこれで判定する */
export function isRunning(state: AnalysisState): boolean {
  return state.phase === "uploading" || state.phase === "ocr" || state.phase === "categorizing";
}

/**
 * 「文字を読み取り中」から「材料を仕分け中」へ移る秒数。
 *
 * **⚠️ 暫定値。実測していない。** 段階12 で実際の解析時間を測ってから決める
 * （`tasks.md` 段階12 / design.md 6.1）。
 */
export const OCR_TO_CATEGORIZING_MS = 12_000;

/**
 * クライアント側のタイムアウト。
 *
 * **サーバーの `maxDuration = 60` より後に来るようにする。** 先に切れると、サーバーが
 * 返そうとしている「原因の分かるエラー」（504 など）を捨てて、こちらの一般的な文言で
 * 上書きしてしまう。
 */
export const REQUEST_TIMEOUT_MS = 70_000;

const ENDPOINT = "/api/recipes/analyze";

/** `route.ts` の `IMAGE_FIELD` と揃える */
const IMAGE_FIELD = "image";

const NETWORK_MESSAGE = "通信に失敗しました。通信環境を確認して、もう一度お試しください。";
const TIMEOUT_MESSAGE = "タイムアウトしました。もう一度お試しください。";

type AnalyzeResponse = ApiResponseBody<{ recipeId: string }>;

/**
 * レスポンスから画面に出す文言を決める。
 *
 * **サーバーが返した `error.message` をそのまま使う。** あれは `lib/errors.ts` の
 * ユーザー向け日本語で、「原因」と「次にすること」の両方を含んでいる（Req6）。
 * ここで書き換えると二重管理になる（段階9 と同じ判断）。
 */
export function messageFromResponse(rawBody: string): string {
  const body = safeParse(rawBody);

  if (body?.success === false && typeof body.error?.message === "string") {
    return body.error.message;
  }

  // JSONですらない（プロキシのエラーページ、502 の HTML）、
  // あるいは JSON だが期待した形をしていない場合
  return INTERNAL_ERROR.message;
}

/** 進捗バーの割合（0〜100）。**段階の切り替わりで飛ぶ。滑らかに埋めない** */
export function progressPercent(state: AnalysisState): number {
  switch (state.phase) {
    case "idle":
    case "error":
      return 0;
    // アップロードだけは実データがあるので連続して動かす
    case "uploading":
      return 5 + Math.round(30 * state.uploaded);
    case "ocr":
      return 40;
    case "categorizing":
      return 70;
    case "done":
      return 100;
  }
}

export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>({ phase: "idle" });

  const requestRef = useRef<XMLHttpRequest | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    requestRef.current = null;
  }, []);

  // 画面を離れるときに走っているリクエストを畳む。放置するとコールバックが
  // アンマウント後の setState を呼ぶ
  useEffect(() => {
    return () => {
      requestRef.current?.abort();
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  /**
   * 解析中はタブを閉じさせない（Req5）。
   *
   * **画面内の遷移は「中止」を無効化して止めるが、リロードとタブを閉じる操作は
   * ブラウザ側でしか止められない。** 30秒待った結果を失わせないため。
   */
  useEffect(() => {
    if (!isRunning(state)) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [state]);

  const reset = useCallback(() => {
    requestRef.current?.abort();
    cleanup();
    setState({ phase: "idle" });
  }, [cleanup]);

  const start = useCallback(
    async (file: File) => {
      setState({ phase: "uploading", uploaded: 0 });

      // 送る前にブラウザ側で縮める。5〜10MB の写真が1MB程度になる（段階9）
      let normalized: Blob;
      try {
        normalized = await normalizeImageInBrowser(file);
      } catch (error) {
        // ClientNormalizeError の message は lib/errors.ts 由来のユーザー向け日本語
        const message =
          error instanceof ClientNormalizeError ? error.message : INTERNAL_ERROR.message;
        setState({ phase: "error", message });
        return;
      }

      const form = new FormData();
      // 拡張子付きの名前を渡す。サーバーは先頭バイトで判定するので中身が正であることに変わりはない
      form.append(IMAGE_FIELD, normalized, "recipe.jpg");

      // **fetch ではなく XMLHttpRequest。** fetch はリクエストボディの進捗を取れない
      const request = new XMLHttpRequest();
      requestRef.current = request;
      request.open("POST", ENDPOINT);
      request.timeout = REQUEST_TIMEOUT_MS;

      request.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          setState({ phase: "uploading", uploaded: event.loaded / event.total });
        }
      };

      // 送信し終えた時点。ここから先はサーバーの中なので、こちらからは見えない
      request.upload.onload = () => {
        setState({ phase: "ocr" });
        timerRef.current = setTimeout(() => {
          // ⚠️ 実際に仕分けが始まった証拠は無い。経過時間だけで切り替えている
          setState({ phase: "categorizing" });
        }, OCR_TO_CATEGORIZING_MS);
      };

      request.onload = () => {
        cleanup();
        const body = safeParse(request.responseText);
        if (request.status === 200 && body?.success === true) {
          setState({ phase: "done", recipeId: body.data.recipeId });
          return;
        }
        setState({ phase: "error", message: messageFromResponse(request.responseText) });
      };

      request.onerror = () => {
        cleanup();
        setState({ phase: "error", message: NETWORK_MESSAGE });
      };

      request.ontimeout = () => {
        cleanup();
        setState({ phase: "error", message: TIMEOUT_MESSAGE });
      };

      request.send(form);
    },
    [cleanup],
  );

  return { state, start, reset };
}

function safeParse(raw: string): AnalyzeResponse | null {
  try {
    return JSON.parse(raw) as AnalyzeResponse;
  } catch {
    return null;
  }
}
