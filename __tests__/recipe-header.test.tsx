import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RecipeHeader } from "@/app/recipes/[id]/recipe-header";

const RECIPE_ID = "clr1a2b3c4d5e6f7g8h9";

describe("RecipeHeader", () => {
  it("レシピのタイトルを見出しとして出す", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} title="肉じゃが" />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("肉じゃが");
  });

  it("材料と作り方への移動リンクを出す", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} title="肉じゃが" />);

    expect(screen.getByRole("link", { name: "材料 ↓" }).getAttribute("href")).toBe("#ingredients");
    expect(screen.getByRole("link", { name: "作り方 ↓" }).getAttribute("href")).toBe("#steps");
  });

  it("移動リンクをまとめて nav に入れる（読み上げに用途が伝わる）", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} title="肉じゃが" />);

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
    render(<RecipeHeader recipeId={RECIPE_ID} title="肉じゃが" />);

    expect(screen.queryByRole("link", { name: /一覧/ })).toBeNull();
  });

  it("「編集」を出さない", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} title="肉じゃが" />);

    expect(screen.queryByRole("button", { name: /編集/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /編集/ })).toBeNull();
  });

  it("移動リンク以外のリンクを置かない", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} title="肉じゃが" />);

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
  it("移動はボタンではなくリンクにする（押しても状態が残らない操作）", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} title="肉じゃが" />);

    // ⚠️ ヘッダー全体では `✎ 改題`（操作）がボタンとして居る。
    // ここで見たいのは**移動が nav 内のリンクであること**なので、nav に絞る
    const nav = screen.getByRole("navigation", { name: "ページ内の移動" });

    expect(within(nav).queryAllByRole("button")).toHaveLength(0);
    expect(within(nav).getAllByRole("link")).toHaveLength(2);
  });

  it("方向記号を付ける", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} title="肉じゃが" />);

    expect(screen.getByRole("link", { name: "材料 ↓" }).textContent).toContain("↓");
    expect(screen.getByRole("link", { name: "作り方 ↓" }).textContent).toContain("↓");
  });

  it("面（背景色）を持つクラスを当てない", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} title="肉じゃが" />);

    // 絞り込みピルは bg-primary / bg-surface を持つ。移動リンクは面なし
    for (const link of screen.getAllByRole("link")) {
      expect(link.className).not.toMatch(/\bbg-/);
    }
  });
});

describe("長いタイトル", () => {
  it("折り返しても落ちない（切り詰めない）", () => {
    const long = "鶏肉と根菜のこっくり煮込み〜柚子胡椒を添えて〜たっぷり野菜と一緒に";

    render(<RecipeHeader recipeId={RECIPE_ID} title={long} />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(long);
  });
});

/**
 * 現在位置の反映（段階8 / requirements.md Req3）。
 *
 * **⚠️ jsdom はレイアウトを持たない。** `offsetHeight` も `getBoundingClientRect()` も
 * 0 を返すので、**「スクロールしたら作り方に切り替わる」ことは自動テストでは踏めない**
 * （design.md 8章）。ここで固定できるのは初期状態と、示し方が「面なし」であること。
 * 切り替わり自体は実機で見る（段階13）。
 */
describe("現在位置", () => {
  it("開いた直後は「材料」が現在位置になる", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} title="肉じゃが" />);

    expect(screen.getByRole("link", { name: "材料 ↓" }).getAttribute("aria-current")).toBe(
      "location",
    );
  });

  it("開いた直後は「作り方」が現在位置ではない", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} title="肉じゃが" />);

    expect(screen.getByRole("link", { name: "作り方 ↓" }).getAttribute("aria-current")).toBeNull();
  });

  it("現在位置は常に1つだけ", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} title="肉じゃが" />);

    const current = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("aria-current") !== null);

    expect(current).toHaveLength(1);
  });

  it("現在位置を面ではなく太さと文字色で示す（絞り込みと混ぜない。落とし穴 #14）", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} title="肉じゃが" />);

    const active = screen.getByRole("link", { name: "材料 ↓" });

    expect(active.className).toMatch(/\bfont-bold\b/);
    // 面を持つと絞り込みのピルと同じ見た目になる
    expect(active.className).not.toMatch(/\bbg-/);
  });

  it("ヘッダーの高さを CSS 変数に流す（飛び先の scroll-margin が参照する）", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} title="肉じゃが" />);

    // jsdom では 0px になる。ここで見たいのは「設定しているか」だけ
    expect(document.documentElement.style.getPropertyValue("--recipe-header-h")).not.toBe("");
  });

  it("画面を離れたら CSS 変数を戻す（他の画面に持ち越さない）", () => {
    const { unmount } = render(<RecipeHeader recipeId={RECIPE_ID} title="肉じゃが" />);
    unmount();

    expect(document.documentElement.style.getPropertyValue("--recipe-header-h")).toBe("");
  });
});
