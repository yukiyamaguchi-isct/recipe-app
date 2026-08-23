"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { AnalysisProgress } from "@/app/upload/analysis-progress";
import { isRunning, useAnalysis } from "@/app/upload/use-analysis";
import { ACCEPTED_MIME_TYPES, MAX_IMAGE_BYTES } from "@/lib/images/constants";
import {
  messageFor,
  validateSelectedFile,
  type NormalizeFailureKind,
} from "@/lib/images/normalize.client";

/**
 * S-03 アップロード / 解析中。
 *
 * 写真を選ぶ → 検証 → 解析（3段階表示）→ 結果、までを1画面で持つ。
 * 見た目は design.md 6.2 の確定仕様に従う。**色・寸法を推測で変えない。**
 */

/** 「JPEG / PNG・10MBまで」。定数から作るので、上限を変えても文字が置き去りにならない */
const LIMIT_TEXT = `JPEG / PNG・${MAX_IMAGE_BYTES / 1024 / 1024}MBまで`;

const ACCEPT = ACCEPTED_MIME_TYPES.join(",");

type Selected = { file: File; previewUrl: string };

/**
 * ファイルサイズの表示。
 *
 * **MB固定にすると、小さい画像が「0.0MB」になって壊れて見える。** 0.1MB未満は KB で出す。
 */
function formatSize(bytes: number): string {
  const megabytes = bytes / 1024 / 1024;

  return megabytes < 0.1 ? `${Math.round(bytes / 1024)}KB` : `${megabytes.toFixed(1)}MB`;
}

export function PhotoPicker() {
  const [selected, setSelected] = useState<Selected | null>(null);
  const [failure, setFailure] = useState<NormalizeFailureKind | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const { state, start, reset } = useAnalysis();
  const running = isRunning(state);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  // オブジェクトURLは自動では解放されない。選び直しと離脱の両方で解放する
  useEffect(() => {
    if (!selected) {
      return;
    }
    return () => URL.revokeObjectURL(selected.previewUrl);
  }, [selected]);

  function accept(file: File | undefined) {
    if (!file) {
      return;
    }

    const problem = validateSelectedFile(file);
    if (problem) {
      // 弾いた写真はプレビューしない。「使えないものが大きく映っている」状態を作らない
      setSelected(null);
      setFailure(problem);
      return;
    }

    setFailure(null);
    reset();
    setSelected({ file, previewUrl: URL.createObjectURL(file) });
  }

  /** エラー表示から戻る。**写真も捨てる**（ラベルが「撮り直す」なので選び直しから始める） */
  function retake() {
    reset();
    setFailure(null);
    setSelected(null);
  }

  /*
   * 2つの経路のエラーを1箇所に集める。
   * - `failure`: 送る前の検証（形式違い・サイズ超過）
   * - `state.phase === "error"`: 解析の失敗（読み取れない・タイムアウト・通信）
   * どちらも `message` は「原因」と「次にすること」を含む（Req6）。
   */
  const problem =
    failure !== null
      ? { heading: "この写真は使えません", message: messageFor(failure) }
      : state.phase === "error"
        ? { heading: "読み取りを完了できませんでした", message: state.message }
        : null;

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-7 p-6">
      <div>
        {/*
         * 「移動」は面なし・枠なしで文字色 link ＋ 方向記号（design.md 6.2 の中核ルール）。
         * **解析中はリンクにしない。** 30秒待った結果を失わせない（Req5）。
         * タブを閉じる・リロードは use-analysis.ts の beforeunload が受け持つ。
         */}
        {running ? (
          <span className="text-muted inline-flex min-h-[var(--size-tap)] items-center text-body">
            ← 中止
          </span>
        ) : (
          <Link
            href="/"
            className="text-link inline-flex min-h-[var(--size-tap)] items-center text-body"
          >
            ← 中止
          </Link>
        )}
      </div>

      {/* 入力欄そのものは見せない。ボタンから click() で開く（役割が button になり操作が明確） */}
      <input
        ref={cameraInputRef}
        type="file"
        accept={ACCEPT}
        // スマホで撮影を直接開く。PCのブラウザでは無視され通常のファイル選択になる
        capture="environment"
        className="hidden"
        onChange={(event) => accept(event.target.files?.[0])}
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(event) => accept(event.target.files?.[0])}
      />

      {problem && (
        <div
          role="alert"
          className="border-danger-border bg-danger-soft rounded-md border px-5 py-[18px]"
        >
          <h2 className="text-danger-ink text-lead font-bold">{problem.heading}</h2>
          <p className="text-danger-body mt-2 text-body">{problem.message}</p>

          {/*
           * ⚠️ デザイン資料はエラー枠の中に危険ボタン「撮り直す」を置いているが、**外している。**
           * 写真は選ばれたまま残るので、下に「もう一度読み取る」と「選び直す」が既に出ている。
           * 3つ目を足すと**「撮り直す」と「選び直す」が同じ操作になる**（design.md 6.2.7）。
           * 検証エラーのほうも同じ理由でボタンを出さない。
           */}
        </div>
      )}

      {state.phase === "done" && (
        <div className="flex flex-col gap-4">
          <h1 className="text-ink text-title font-bold">読み取りました</h1>

          {/*
           * ⚠️ 暫定。本来はここで S-04c（確認モード）へ遷移する（UI_DESIGN.md 2章）。
           * その画面は Phase 3 で作るため、Phase 2 では保存できたことだけを伝える。
           */}
          <div className="border-attention bg-warn-soft text-warn-ink rounded-md border px-5 py-4 text-body">
            レシピを保存しました。読み取った内容を確認する画面は、次のフェーズで追加します。
          </div>

          <button
            type="button"
            onClick={retake}
            className="bg-primary hover:bg-primary-dark h-[var(--size-tap-lg)] w-full rounded-md px-6 text-lead font-bold text-white transition-colors duration-[120ms]"
          >
            続けて撮る
          </button>
        </div>
      )}

      {selected && state.phase !== "done" && (
        <div className="flex flex-1 flex-col gap-4">
          {/*
           * eslint-disable-next-line @next/next/no-img-element --
           * next/image は URL を最適化のために取り回すため、ブラウザ内だけで有効な
           * blob: URL とは噛み合わない。ここは素の img で描く。
           */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selected.previewUrl}
            alt="選んだレシピの写真"
            className="border-border aspect-[4/3] w-full rounded-md border object-cover"
          />

          {running ? (
            <>
              {/*
               * **数字を出さない**（design.md 6.2.3、2026-08-16 ユーザー決定）。
               * デザインは「最大30秒」、実装のタイムアウトは50秒。書けばどちらかが嘘になる。
               */}
              <h1 className="text-ink text-title font-bold">読み取り中</h1>
              <AnalysisProgress state={state} />
            </>
          ) : (
            <>
              <p className="text-ink-sub text-meta">
                {selected.file.name}（{formatSize(selected.file.size)}）
              </p>

              {/* 失敗の直後は「もう一度」であることを label に出す（体言止め・8文字以内） */}
              <button
                type="button"
                onClick={() => start(selected.file)}
                className="bg-primary hover:bg-primary-dark h-[var(--size-tap-lg)] w-full rounded-md px-6 text-lead font-bold text-white transition-colors duration-[120ms]"
              >
                {state.phase === "error" ? "もう一度読み取る" : "読み取る"}
              </button>

              <button
                type="button"
                onClick={() => libraryInputRef.current?.click()}
                className="text-link border-link bg-surface hover:bg-primary-soft h-[var(--size-tap-lg)] w-full rounded-md border-[1.5px] px-5 text-lead font-medium transition-colors duration-[120ms]"
              >
                選び直す
              </button>
            </>
          )}
        </div>
      )}

      {!selected && state.phase !== "done" && (
        /*
         * 空状態のパターン（design.md 6.2 / handoff「空状態」）。
         * ドラッグ＆ドロップも同じ領域で受ける（Req1。PCでの主な入り口）。
         */
        <div
          onDragOver={(event) => {
            // 既定の動作はファイルを別ページとして開いてしまう。必ず止める
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            accept(event.dataTransfer.files?.[0]);
          }}
          className={`bg-header flex flex-col items-center gap-3.5 rounded-md border-[1.5px] border-dashed px-6 py-10 text-center ${
            isDragging ? "border-link" : "border-border-strong"
          }`}
        >
          {/* アイコンはテキストグリフのみ（有料素材を使わない。design.md 6.2.1） */}
          <div
            aria-hidden
            className="border-border-strong text-ink flex h-14 w-14 items-center justify-center rounded-md border text-title"
          >
            ＋
          </div>

          {/* この画面の主見出し。h2 から始めると見出しの階層が飛ぶ */}
          <h1 className="text-ink text-lead font-bold">レシピの写真を選ぶ</h1>

          {/* 説明の折り返しは 26ch まで（design.md 6.2 の空状態）。中央揃えで行が割れるのを防ぐ */}
          <p className="text-ink max-w-[26ch] text-body">
            料理本のページ全体が入るように撮ってください。
            <br />
            {LIMIT_TEXT}
          </p>

          {/* ドラッグできるのはポインタのある端末だけ。指で操作する端末には書かない */}
          <p className="text-ink-sub hidden text-meta pointer-fine:block">
            この枠に写真をドラッグもできます
          </p>

          <div className="flex w-full flex-col gap-2">
            {/*
             * ⚠️ **画面の広さでは出し分けない**（design.md 6.2.9）。
             * `md:`（768px）で分けていたが、**iPad は縦向きで 820〜1024px あるため PC 扱いになり、
             * カメラを持っている端末なのにカメラのボタンが消えていた。**
             * `pointer: coarse`（指で操作する端末）で判定すれば、幅と無関係に正しく出る。
             */}
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="bg-primary hover:bg-primary-dark hidden h-[var(--size-tap-lg)] w-full rounded-md px-6 text-lead font-bold text-white transition-colors duration-[120ms] pointer-coarse:block"
            >
              カメラで撮る
            </button>

            {/*
             * 既定は主要（カメラを出さない端末では唯一のボタン）。
             * 指で操作する端末では副次に下げる（撮影が第一候補になるため）。
             * 見た目を切り替えるだけで、要素は1つに保つ。
             */}
            <button
              type="button"
              onClick={() => libraryInputRef.current?.click()}
              className="bg-primary hover:bg-primary-dark pointer-coarse:text-link pointer-coarse:border-link pointer-coarse:bg-surface pointer-coarse:hover:bg-primary-soft h-[var(--size-tap-lg)] w-full rounded-md border-[1.5px] border-transparent px-6 text-lead font-bold text-white transition-colors duration-[120ms] pointer-coarse:px-5 pointer-coarse:font-medium"
            >
              写真を選ぶ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
