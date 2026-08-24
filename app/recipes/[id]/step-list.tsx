import type { Step } from "@/generated/prisma/client";

/**
 * 「作り方」セクション（`UI_DESIGN.md` S-04）。
 *
 * **MVPでは通常のテキスト。** 手順タップでの拡大表示・次ステップの材料表示・
 * 専門用語の色付けは後続フェーズ（`REQUIREMENTS.md` 5章）。
 *
 * 視覚仕様は design.md 6.1 の確定値。**推測で変えない。**
 */

type Props = {
  /** `order` の昇順で渡ってくる（`findRecipeForUser` が指定している） */
  steps: Step[];
};

export function StepList({ steps }: Props) {
  return (
    // ヘッダーの `作り方 ↓` の着地点。scroll-mt-28 の理由は ingredient-list.tsx を参照
    <section id="steps" aria-labelledby="steps-heading" className="scroll-mt-28">
      <h2 id="steps-heading" className="text-ink text-title font-bold">
        作り方
      </h2>

      {steps.length === 0 ? (
        <p className="text-ink-sub mt-4 text-body">手順が登録されていません。</p>
      ) : (
        // 番号は ol が振るのではなく自前で描く（丸い面に乗せるため）。
        // それでも ol にするのは、読み上げに「1/5 番目」と伝わるのが順序リストだけのため。
        <ol className="mt-4 flex flex-col gap-5">
          {steps.map((step, index) => (
            <li key={step.id} className="flex items-start gap-4">
              <span
                aria-hidden="true"
                className="bg-primary-soft text-link grid size-10 flex-none place-items-center rounded-full text-lead font-bold"
              >
                {index + 1}
              </span>
              {/*
               * 行間は 1.9（design.md 6.1）。--text-body に紐づく既定は 1.8 なので、
               * ここだけ明示的に上書きする。濡れた手で見下ろす距離を想定した値。
               */}
              <p className="text-ink text-body pt-1.5 leading-[1.9] text-pretty">{step.text}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
