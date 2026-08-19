"use client";

import { progressPercent, type AnalysisState } from "@/app/upload/use-analysis";

/**
 * 解析中の3段階表示（design.md 6.2.2 / handoff「進捗表示」）。
 *
 * **単一のスピナーにしない。** 30秒前後を待たせるので、「どこまで進んだか」が分からないと
 * 止まったのか処理中なのか区別できない（`UI_DESIGN.md` S-03）。
 */

/** 順序に意味がある。この配列の位置で「完了 / 進行中 / 未着手」を決める */
const PHASES = [
  { key: "uploading", label: "アップロード中" },
  { key: "ocr", label: "文字を読み取り中" },
  { key: "categorizing", label: "材料を仕分け中" },
] as const;

type Step = "done" | "active" | "pending";

function stepFor(index: number, state: AnalysisState): Step {
  if (state.phase === "done") {
    return "done";
  }
  const current = PHASES.findIndex((phase) => phase.key === state.phase);
  if (current === -1) {
    return "pending";
  }
  if (index < current) {
    return "done";
  }
  return index === current ? "active" : "pending";
}

export function AnalysisProgress({ state }: { state: AnalysisState }) {
  const percent = progressPercent(state);

  return (
    // 段階が変わったことを支援技術にも伝える。視覚的な変化だけにしない
    <div className="flex flex-1 flex-col gap-5" role="status" aria-live="polite">
      {PHASES.map((phase, index) => {
        const step = stepFor(index, state);

        return (
          <div key={phase.key} className="flex items-center gap-4">
            <StepCircle step={step} />
            <span className={LABEL_CLASS[step]}>{phase.label}</span>
          </div>
        );
      })}

      {/*
       * バーは最下部（design.md 6.2.2 の `margin-top: auto`）。
       * **滑らかには埋まらない。** アップロード中だけが実データで、以降は段階の切り替わりで飛ぶ
       */}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="bg-track mt-auto h-2 w-full overflow-hidden rounded-full"
      >
        <div
          className="bg-accent h-full rounded-full transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

const LABEL_CLASS: Record<Step, string> = {
  done: "text-ink-sub text-body",
  // 進行中だけ太く大きくする。目が最初にここへ行く
  active: "text-ink text-lead font-bold",
  pending: "text-muted text-body",
};

/**
 * 32px の丸。
 *
 * **`--color-accent`（`#00C6D7`）の上に文字を置かない**という規則があるが、
 * ✓ は文字ではなく記号として使う。白 ✓ / accent 面はデザイン側の指定どおり。
 */
function StepCircle({ step }: { step: Step }) {
  if (step === "done") {
    return (
      <span
        aria-hidden
        className="bg-accent flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-body font-bold text-white"
      >
        ✓
      </span>
    );
  }

  if (step === "active") {
    return (
      // 明滅で「止まっていない」ことを示す。動きを止める設定の人には globals.css で無効化される
      <span
        aria-hidden
        className="border-accent animate-phase h-8 w-8 shrink-0 rounded-full border-[3px]"
      />
    );
  }

  return <span aria-hidden className="border-border h-8 w-8 shrink-0 rounded-full border-2" />;
}
