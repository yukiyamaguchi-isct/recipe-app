"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { ACCEPTED_MIME_TYPES, MAX_IMAGE_BYTES } from "@/lib/images/constants";
import {
  messageFor,
  validateSelectedFile,
  type NormalizeFailureKind,
} from "@/lib/images/normalize.client";

/**
 * S-03 の写真選択部分。
 *
 * **解析の開始はまだ持たない**（段階11で追加する）。この段階の役割は
 * 「選ばせる」と「送れない写真をその場で断る」の2つだけ（`tasks.md` 段階10）。
 *
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
    setSelected({ file, previewUrl: URL.createObjectURL(file) });
  }

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-7 p-6">
      {/*
       * 「移動」は面なし・枠なしで文字色 link ＋ 方向記号（design.md 6.2 の中核ルール）。
       * hover 装飾を足さない。
       */}
      <div>
        <Link
          href="/"
          className="text-link inline-flex min-h-[var(--size-tap)] items-center text-body"
        >
          ← 中止
        </Link>
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

      {failure && (
        <div
          role="alert"
          className="border-danger-border bg-danger-soft rounded-md border px-5 py-[18px]"
        >
          <h2 className="text-danger-ink text-lead font-bold">この写真は使えません</h2>
          <p className="text-danger-body mt-2 text-body">{messageFor(failure)}</p>
        </div>
      )}

      {selected ? (
        <div className="flex flex-col gap-4">
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

          <p className="text-ink-sub text-meta">
            {selected.file.name}（{formatSize(selected.file.size)}）
          </p>

          <button
            type="button"
            onClick={() => libraryInputRef.current?.click()}
            className="text-link border-link bg-surface hover:bg-primary-soft h-[var(--size-tap-lg)] w-full rounded-md border-[1.5px] px-5 text-lead font-medium transition-colors duration-[120ms]"
          >
            選び直す
          </button>
        </div>
      ) : (
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

          <h2 className="text-ink text-lead font-bold">レシピの写真を選ぶ</h2>

          {/* 説明の折り返しは 26ch まで（design.md 6.2 の空状態）。中央揃えで行が割れるのを防ぐ */}
          <p className="text-ink max-w-[26ch] text-body">
            料理本のページ全体が入るように撮ってください。
            <br />
            {LIMIT_TEXT}
          </p>

          {/* スマホに無い操作を書かない。ドラッグの案内は横幅のある画面だけに出す */}
          <p className="text-ink-sub hidden text-meta md:block">この枠に写真をドラッグもできます</p>

          <div className="flex w-full flex-col gap-2">
            {/* 料理本をその場で撮る使い方が主（UI_DESIGN.md S-03）。スマホでは撮影を第一候補に置く */}
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="bg-primary hover:bg-primary-dark h-[var(--size-tap-lg)] w-full rounded-md px-6 text-lead font-bold text-white transition-colors duration-[120ms] md:hidden"
            >
              カメラで撮る
            </button>

            {/*
             * スマホでは副次（撮影が第一候補）、横幅のある画面では主要（カメラを出さないため）。
             * 見た目を切り替えるだけで、要素は1つに保つ。
             */}
            <button
              type="button"
              onClick={() => libraryInputRef.current?.click()}
              className="text-link border-link bg-surface hover:bg-primary-soft md:bg-primary md:hover:bg-primary-dark h-[var(--size-tap-lg)] w-full rounded-md border-[1.5px] px-5 text-lead font-medium transition-colors duration-[120ms] md:border-transparent md:px-6 md:font-bold md:text-white"
            >
              写真を選ぶ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
