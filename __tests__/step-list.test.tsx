import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StepList } from "@/app/recipes/[id]/step-list";

const RECIPE_ID = "clr1a2b3c4d5e6f7g8h9";

/** `findRecipeForUser` が返す形（`order` の昇順）。 */
const STEPS = [
  { id: "s1", recipeId: RECIPE_ID, order: 0, text: "じゃがいもを一口大に切る" },
  { id: "s2", recipeId: RECIPE_ID, order: 1, text: "牛肉を炒める" },
  { id: "s3", recipeId: RECIPE_ID, order: 2, text: "水を加えて20分煮る" },
];

describe("StepList", () => {
  it("手順を全件表示する", () => {
    render(<StepList steps={STEPS} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("「作り方」の見出しを出す", () => {
    render(<StepList steps={STEPS} />);

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("作り方");
  });

  it("手順の本文をそのまま表示する", () => {
    render(<StepList steps={STEPS} />);

    expect(screen.getByText("じゃがいもを一口大に切る")).toBeDefined();
    expect(screen.getByText("水を加えて20分煮る")).toBeDefined();
  });
});

describe("並びと番号（requirements.md Req1）", () => {
  it("渡された順序のまま表示する（画面側で並べ替えない）", () => {
    render(<StepList steps={STEPS} />);

    const texts = screen.getAllByRole("listitem").map((li) => li.textContent);

    expect(texts[0]).toContain("じゃがいもを一口大に切る");
    expect(texts[1]).toContain("牛肉を炒める");
    expect(texts[2]).toContain("水を加えて20分煮る");
  });

  it("番号を1から振る（order の 0 始まりをそのまま出さない）", () => {
    render(<StepList steps={STEPS} />);

    const texts = screen.getAllByRole("listitem").map((li) => li.textContent);

    expect(texts[0]?.startsWith("1")).toBe(true);
    expect(texts[2]?.startsWith("3")).toBe(true);
  });

  it("順序リストとして描く（読み上げに順序が伝わる）", () => {
    render(<StepList steps={STEPS} />);

    expect(screen.getByRole("list").tagName).toBe("OL");
  });
});

describe("段階7 のページ内移動の着地点", () => {
  it("セクションに id=steps を置く", () => {
    const { container } = render(<StepList steps={STEPS} />);

    expect(container.querySelector("#steps")).not.toBeNull();
  });
});

describe("手順が無いレシピ", () => {
  // Phase 2 は材料も手順も空のまま保存できる（recipe-repository.test.ts で固定済み）。
  // 空配列で落ちたり、見出しだけ出て本文が空白になったりしない。
  it("空でも落ちず、その旨を表示する", () => {
    render(<StepList steps={[]} />);

    expect(screen.getByText("手順が登録されていません。")).toBeDefined();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("空でも見出しは出す", () => {
    render(<StepList steps={[]} />);

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("作り方");
  });
});
