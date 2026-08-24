import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RecipeHeader } from "@/app/recipes/[id]/recipe-header";

describe("RecipeHeader", () => {
  it("レシピのタイトルを見出しとして出す", () => {
    render(<RecipeHeader title="肉じゃが" />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("肉じゃが");
  });

  it("材料と作り方への移動リンクを出す", () => {
    render(<RecipeHeader title="肉じゃが" />);

    expect(screen.getByRole("link", { name: "材料 ↓" }).getAttribute("href")).toBe("#ingredients");
    expect(screen.getByRole("link", { name: "作り方 ↓" }).getAttribute("href")).toBe("#steps");
  });

  it("移動リンクをまとめて nav に入れる（読み上げに用途が伝わる）", () => {
    render(<RecipeHeader title="肉じゃが" />);

    expect(screen.getByRole("navigation", { name: "ページ内の移動" })).toBeDefined();
  });
});

/**
 * Phase 3 のヘッダーは2段（requirements.md 決着2・3 / design.md 6.1）。
 *
 * 上段に置くのは `← 一覧`（S-02 は Phase 4）と `編集`（S-05 は Phase 5）の2つだけで、
 * **どちらもこのフェーズでは出さない。** 遷移先が無いボタンを置かない。
 */
describe("Phase 3 では上段を描かない", () => {
  it("「← 一覧」を出さない", () => {
    render(<RecipeHeader title="肉じゃが" />);

    expect(screen.queryByRole("link", { name: /一覧/ })).toBeNull();
  });

  it("「編集」を出さない", () => {
    render(<RecipeHeader title="肉じゃが" />);

    expect(screen.queryByRole("button", { name: /編集/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /編集/ })).toBeNull();
  });

  it("移動リンク以外のリンクを置かない", () => {
    render(<RecipeHeader title="肉じゃが" />);

    expect(screen.getAllByRole("link")).toHaveLength(2);
  });
});

/**
 * 「移動 / 操作 / 絞り込み」の描き分け（design.md 6.2。**このデザインの中核ルール**）。
 *
 * jsdom は Tailwind の CSS を解釈しないので、**見た目そのものは担保できない**
 * （design.md 8章）。ここで固定できるのは「移動として組んであるか」まで。
 */
describe("移動として組む（絞り込みと混ぜない）", () => {
  it("ボタンではなくリンクにする（押しても状態が残らない操作）", () => {
    render(<RecipeHeader title="肉じゃが" />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("方向記号を付ける", () => {
    render(<RecipeHeader title="肉じゃが" />);

    expect(screen.getByRole("link", { name: "材料 ↓" }).textContent).toContain("↓");
    expect(screen.getByRole("link", { name: "作り方 ↓" }).textContent).toContain("↓");
  });

  it("面（背景色）を持つクラスを当てない", () => {
    render(<RecipeHeader title="肉じゃが" />);

    // 絞り込みピルは bg-primary / bg-surface を持つ。移動リンクは面なし
    for (const link of screen.getAllByRole("link")) {
      expect(link.className).not.toMatch(/\bbg-/);
    }
  });
});

describe("長いタイトル", () => {
  it("折り返しても落ちない（切り詰めない）", () => {
    const long = "鶏肉と根菜のこっくり煮込み〜柚子胡椒を添えて〜たっぷり野菜と一緒に";

    render(<RecipeHeader title={long} />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(long);
  });
});
