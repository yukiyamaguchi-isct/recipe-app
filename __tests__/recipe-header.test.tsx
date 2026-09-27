import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RecipeHeader } from "@/app/recipes/[id]/recipe-header";

const RECIPE_ID = "clr1a2b3c4d5e6f7g8h9";

describe("RecipeHeader", () => {
  it("レシピのタイトルを見出しとして出す", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} mode="view" title="肉じゃが" />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("肉じゃが");
  });

  it("材料と作り方への移動リンクを出す", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} mode="view" title="肉じゃが" />);

    expect(screen.getByRole("link", { name: "材料 ↓" }).getAttribute("href")).toBe("#ingredients");
    expect(screen.getByRole("link", { name: "作り方 ↓" }).getAttribute("href")).toBe("#steps");
  });

  it("移動リンクをまとめて nav に入れる（読み上げに用途が伝わる）", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} mode="view" title="肉じゃが" />);

    expect(screen.getByRole("navigation", { name: "ページ内の移動" })).toBeDefined();
  });
});

/**
 * ヘッダー上段（recipe-list requirements.md Req7 で復元）。
 *
 * **Phase 3 では遷移先の S-02 が無いため段ごと描いていなかった。**
 * Phase 4 で一覧ができたので `← 一覧` を戻し、Phase 5 で右に `編集` を戻した（recipe-edit 決定②）。
 * **確認モードでは上段ごと出さない**（決定②）。
 */
describe("上段（Phase 4・5 で復元）", () => {
  it("通常モードでは「← 一覧」を出し、一覧へ行ける", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} mode="view" title="肉じゃが" />);

    expect(screen.getByRole("link", { name: "← 一覧" }).getAttribute("href")).toBe("/");
  });

  /**
   * ⚠️ `UI_DESIGN.md` S-04c の差3。**確認モードでは出さない。**
   * デザインHTMLのモックには描かれているが README が正（落とし穴 #19）。
   * **空の段として高さも残さない。**
   */
  it("確認モードでは「← 一覧」を出さない", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} mode="confirm" title="肉じゃが" />);

    expect(screen.queryByRole("link", { name: /一覧/ })).toBeNull();
  });

  it("通常モードでは右に「編集」を出し、編集画面（/recipes/<id>/edit）へ行ける", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} mode="view" title="肉じゃが" />);

    expect(screen.getByRole("link", { name: "編集" }).getAttribute("href")).toBe(
      `/recipes/${RECIPE_ID}/edit`,
    );
  });

  /**
   * ⚠️ recipe-edit 決定②。**確認モードでは `編集` も出さない**（上段ごと出さない）。
   * モックは上段に描いているが、確認モードの出口は最下部バーの「この内容で決定」「編集する」だけ。
   * 上段に出すと最下部の「編集する」と重複する。
   */
  it("確認モードでは「編集」を上段に出さない", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} mode="confirm" title="肉じゃが" />);

    expect(screen.queryByRole("link", { name: /編集/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^編集/ })).toBeNull();
  });

  /**
   * `編集` は「操作」（枠線・面は白）。**「移動」（面なし・枠なし）にすると `← 一覧` と区別が付かない**
   * （README の中核ルールの表が `編集` を「操作」の例に挙げている。落とし穴 #14）。
   */
  it("「編集」は枠線を持つ（「操作」の見た目）", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} mode="view" title="肉じゃが" />);

    expect(screen.getByRole("link", { name: "編集" }).className).toMatch(/(^|\s)border-\[1\.5px\]/);
  });

  it("「編集」は「画面の移動」の nav の外に置く（移動ではなく操作）", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} mode="view" title="肉じゃが" />);

    const nav = screen.getByRole("navigation", { name: "画面の移動" });
    expect(within(nav).queryByRole("link", { name: "編集" })).toBeNull();
  });

  /**
   * `← 一覧` は「移動」（面なし・枠なし・--color-link ＋ 方向記号）。
   * **面や枠を足すと「操作」や「絞り込み」と混ざり、中核ルールが壊れる**（落とし穴 #14）。
   */
  it("「← 一覧」が面も枠も持たない（「移動」の見た目）", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} mode="view" title="肉じゃが" />);

    const className = screen.getByRole("link", { name: "← 一覧" }).className;
    // ⚠️ 先頭が空白のときだけを見る。`\b` や素の /bg-/ だと `hover:bg-...` にも当たり、
    // **hover 時だけ面が付く実装を見逃す**（recipe-view の「`-` でも境界になる」の反省）。
    expect(className).not.toMatch(/(^|\s)bg-/);
    expect(className).not.toMatch(/(^|\s)border/);
  });

  /**
   * **数ではなく中身を固定する。** Phase 3 は「2つ」と数で見ていたが、
   * 上段が戻って3つになった。数だけだと**別の何かが増えても気づけない**ので、
   * 何が並んでいるかで見る。
   */
  it("ヘッダーのリンクは「← 一覧」「編集」と2つの移動リンクだけ", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} mode="view" title="肉じゃが" />);

    const labels = screen.getAllByRole("link").map((link) => link.textContent);
    expect(labels).toEqual(["← 一覧", "編集", "材料 ↓", "作り方 ↓"]);
  });

  it("確認モードでは移動リンク2つだけになる", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} mode="confirm" title="肉じゃが" />);

    const labels = screen.getAllByRole("link").map((link) => link.textContent);
    expect(labels).toEqual(["材料 ↓", "作り方 ↓"]);
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
    render(<RecipeHeader recipeId={RECIPE_ID} mode="view" title="肉じゃが" />);

    // ⚠️ ヘッダー全体では `✎ 改題`（操作）がボタンとして居る。
    // ここで見たいのは**移動が nav 内のリンクであること**なので、nav に絞る
    const nav = screen.getByRole("navigation", { name: "ページ内の移動" });

    expect(within(nav).queryAllByRole("button")).toHaveLength(0);
    expect(within(nav).getAllByRole("link")).toHaveLength(2);
  });

  it("方向記号を付ける", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} mode="view" title="肉じゃが" />);

    expect(screen.getByRole("link", { name: "材料 ↓" }).textContent).toContain("↓");
    expect(screen.getByRole("link", { name: "作り方 ↓" }).textContent).toContain("↓");
  });

  it("面（背景色）を持つクラスを当てない", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} mode="view" title="肉じゃが" />);

    // 絞り込みピルは bg-primary / bg-surface を持つ。移動リンクは面なし。
    //
    // **移動リンク（2つの nav の中）に絞る。** Phase 5 で上段に戻した `編集` もリンクだが、
    // 見た目は「操作」で面は白（README の中核ルール）。`編集` の見た目は上の「枠線を持つ」で固定している
    const navLinks = screen
      .getAllByRole("navigation")
      .flatMap((nav) => within(nav).getAllByRole("link"));

    expect(navLinks.map((link) => link.textContent)).toEqual(["← 一覧", "材料 ↓", "作り方 ↓"]);
    for (const link of navLinks) {
      expect(link.className).not.toMatch(/\bbg-/);
    }
  });
});

describe("長いタイトル", () => {
  it("折り返しても落ちない（切り詰めない）", () => {
    const long = "鶏肉と根菜のこっくり煮込み〜柚子胡椒を添えて〜たっぷり野菜と一緒に";

    render(<RecipeHeader recipeId={RECIPE_ID} mode="view" title={long} />);

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
    render(<RecipeHeader recipeId={RECIPE_ID} mode="view" title="肉じゃが" />);

    expect(screen.getByRole("link", { name: "材料 ↓" }).getAttribute("aria-current")).toBe(
      "location",
    );
  });

  it("開いた直後は「作り方」が現在位置ではない", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} mode="view" title="肉じゃが" />);

    expect(screen.getByRole("link", { name: "作り方 ↓" }).getAttribute("aria-current")).toBeNull();
  });

  it("現在位置は常に1つだけ", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} mode="view" title="肉じゃが" />);

    const current = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("aria-current") !== null);

    expect(current).toHaveLength(1);
  });

  it("現在位置を面ではなく太さと文字色で示す（絞り込みと混ぜない。落とし穴 #14）", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} mode="view" title="肉じゃが" />);

    const active = screen.getByRole("link", { name: "材料 ↓" });

    expect(active.className).toMatch(/\bfont-bold\b/);
    // 面を持つと絞り込みのピルと同じ見た目になる
    expect(active.className).not.toMatch(/\bbg-/);
  });

  it("ヘッダーの高さを CSS 変数に流す（飛び先の scroll-margin が参照する）", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} mode="view" title="肉じゃが" />);

    // jsdom では 0px になる。ここで見たいのは「設定しているか」だけ
    expect(document.documentElement.style.getPropertyValue("--recipe-header-h")).not.toBe("");
  });

  it("画面を離れたら CSS 変数を戻す（他の画面に持ち越さない）", () => {
    const { unmount } = render(<RecipeHeader recipeId={RECIPE_ID} mode="view" title="肉じゃが" />);
    unmount();

    expect(document.documentElement.style.getPropertyValue("--recipe-header-h")).toBe("");
  });
});

/**
 * 確認モード（S-04c / requirements.md Req5）。
 *
 * **Phase 4 で `← 一覧` が入ったので、差はバナーと上段の2点になった**
 * （最下部固定バーは別コンポーネント）。
 */
describe("確認モードのバナー", () => {
  it("確認モードではバナーを出す", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} mode="confirm" title="肉じゃが" />);

    expect(screen.getByText("確認画面 — 内容をチェック")).toBeDefined();
  });

  it("通常モードでは出さない", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} mode="view" title="肉じゃが" />);

    expect(screen.queryByText("確認画面 — 内容をチェック")).toBeNull();
  });

  it("確認モードでもタイトルと移動リンクは同じ（同一表示）", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} mode="confirm" title="肉じゃが" />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("肉じゃが");
    expect(screen.getByRole("link", { name: "材料 ↓" })).toBeDefined();
    expect(screen.getByRole("link", { name: "作り方 ↓" })).toBeDefined();
  });

  it("確認モードでも改題できる（読み取り間違いを直せる唯一の手段）", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} mode="confirm" title="肉じゃが" />);

    expect(screen.getByRole("button", { name: "✎ 改題" })).toBeDefined();
  });

  it("バナーはヘッダーの中に入れる（1つの sticky ブロックにする）", () => {
    const { container } = render(
      <RecipeHeader recipeId={RECIPE_ID} mode="confirm" title="肉じゃが" />,
    );

    // 外に出すと、バナーの高さぶんヘッダーの位置調整が要り、
    // --recipe-header-h の実測にも含まれなくなる（着地点がずれる）
    const header = container.querySelector("header");
    expect(header?.textContent).toContain("確認画面");
  });
});

/**
 * 上余白の持ち主（recipe-view design.md 6.4 / 落とし穴 #17）。
 *
 * 仕様の中段 padding は `0 16px 8px` で**上余白を持たない**。通常モードでは
 * 上段の padding-bottom 6px がその役目を果たす。
 *
 * **⚠️ 確認モードには上段が無い**ので、何もしないとタイトルがバナーの境界線に
 * 貼り付く。Phase 3 が中段に足していた 12px は、**いまや「上段が無いモード」
 * だけに必要な値**になった。
 */
describe("タイトルの上余白", () => {
  /** 中段そのものは仕様どおり上余白を持たない（二重にしない）。 */
  it("中段自体は上余白を持たない", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} mode="view" title="肉じゃが" />);

    const title = screen.getByRole("heading", { level: 1 });
    expect(title.parentElement?.className).not.toMatch(/(^|\s)pt-/);
  });

  it("確認モードではタイトルの上に余白がある（バナーに貼り付かない）", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} mode="confirm" title="肉じゃが" />);

    // 中段の外側のラッパが余白を持つ
    const wrapper = screen.getByRole("heading", { level: 1 }).parentElement?.parentElement;
    expect(wrapper?.className).toMatch(/(^|\s)pt-3(\s|$)/);
  });

  it("通常モードでは足さない（上段の余白と二重にしない）", () => {
    render(<RecipeHeader recipeId={RECIPE_ID} mode="view" title="肉じゃが" />);

    const wrapper = screen.getByRole("heading", { level: 1 }).parentElement?.parentElement;
    expect(wrapper?.className ?? "").not.toMatch(/(^|\s)pt-/);
  });
});
