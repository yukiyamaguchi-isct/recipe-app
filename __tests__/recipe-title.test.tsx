import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RecipeTitle } from "@/app/recipes/[id]/recipe-title";
import { MAX_TITLE_LENGTH } from "@/lib/recipes/title";

const RECIPE_ID = "clr1a2b3c4d5e6f7g8h9";

const fetchMock = vi.fn();

/** サーバーの成功レスポンスを模す。 */
function ok(title: string) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ success: true, data: { title }, error: null }),
  };
}

/** サーバーの失敗レスポンスを模す。 */
function fail(status: number, code: string, message: string) {
  return {
    ok: false,
    status,
    text: async () => JSON.stringify({ success: false, data: null, error: { code, message } }),
  };
}

function setup(title = "肉じゃが") {
  const onRenamed = vi.fn();
  render(<RecipeTitle recipeId={RECIPE_ID} title={title} onRenamed={onRenamed} />);
  return { onRenamed };
}

/** 「✎ 改題」を押して編集に入る。 */
function startEditing() {
  fireEvent.click(screen.getByRole("button", { name: "✎ 改題" }));
  return screen.getByRole("textbox", { name: "レシピのタイトル" });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(ok("新しい名前"));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("表示のとき", () => {
  it("タイトルを見出しとして出す", () => {
    setup();

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("肉じゃが");
  });

  it("改題のボタンを出す", () => {
    setup();

    expect(screen.getByRole("button", { name: "✎ 改題" })).toBeDefined();
  });

  it("入力欄は出さない", () => {
    setup();

    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

describe("編集に入る（requirements.md Req7）", () => {
  it("✎ を押すと入力欄になる", () => {
    setup();

    expect(startEditing()).toBeDefined();
  });

  it("入力欄には今のタイトルが入っている", () => {
    setup();

    expect((startEditing() as HTMLInputElement).value).toBe("肉じゃが");
  });

  it("編集中も見出しは残る（文書構造を崩さない）", () => {
    setup();
    startEditing();

    expect(screen.getByRole("heading", { level: 1 })).toBeDefined();
  });

  it("やめると元の表示に戻る", () => {
    setup();
    const input = startEditing();
    fireEvent.change(input, { target: { value: "書きかけ" } });

    fireEvent.click(screen.getByRole("button", { name: "やめる" }));

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("肉じゃが");
  });

  it("Escape でもやめられる（閉じる手段をボタンだけにしない）", () => {
    setup();
    const input = startEditing();

    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("やめた後に開き直すと下書きが残っていない", () => {
    setup();
    fireEvent.change(startEditing(), { target: { value: "書きかけ" } });
    fireEvent.click(screen.getByRole("button", { name: "やめる" }));

    expect((startEditing() as HTMLInputElement).value).toBe("肉じゃが");
  });
});

describe("保存できたとき", () => {
  it("PATCH を送る", async () => {
    setup();
    fireEvent.change(startEditing(), { target: { value: "新しい名前" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/recipes/${RECIPE_ID}`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ title: "新しい名前" });
  });

  it("前後の空白を落として送る（サーバーと同じ規則）", async () => {
    setup();
    fireEvent.change(startEditing(), { target: { value: "  新しい名前  " } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).title).toBe("新しい名前");
  });

  it("親に新しいタイトルを知らせる（ヘッダーが高さを測り直す）", async () => {
    const { onRenamed } = setup();
    fireEvent.change(startEditing(), { target: { value: "新しい名前" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(onRenamed).toHaveBeenCalledWith("新しい名前"));
  });

  it("表示に戻る", async () => {
    setup();
    fireEvent.change(startEditing(), { target: { value: "新しい名前" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
  });

  it("変えずに保存したら通信しない", async () => {
    const { onRenamed } = setup();
    startEditing();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onRenamed).not.toHaveBeenCalled();
  });
});

/**
 * 検証（requirements.md Req7）。
 *
 * **文言は `lib/recipes/title.ts` をサーバーと共有している。**
 * ここで独自の文言を作ると、どちらで弾かれたかで見えるものが変わる
 * （`.kiro/specs/recipe-analysis/design.md` 落とし穴 #27）。
 */
describe("入力の検証", () => {
  it("空では保存できない", async () => {
    setup();
    fireEvent.change(startEditing(), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByRole("alert")).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("空白だけでも保存できない", async () => {
    setup();
    fireEvent.change(startEditing(), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByRole("alert")).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("弾かれても編集を続けられる（入力が消えない）", async () => {
    setup();
    const input = startEditing();
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await screen.findByRole("alert");
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("   ");
  });

  it("長すぎると保存できず、上限が文言に出る", async () => {
    setup();
    fireEvent.change(startEditing(), { target: { value: "あ".repeat(MAX_TITLE_LENGTH + 1) } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(String(MAX_TITLE_LENGTH));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("入力欄に問題があることを伝える（aria-invalid）", async () => {
    setup();
    fireEvent.change(startEditing(), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await screen.findByRole("alert");
    expect(screen.getByRole("textbox").getAttribute("aria-invalid")).toBe("true");
  });
});

describe("保存に失敗したとき（requirements.md Req7）", () => {
  it("サーバーの文言をそのまま出す", async () => {
    fetchMock.mockResolvedValue(fail(404, "RECIPE_NOT_FOUND", "レシピが見つかりませんでした。"));
    setup();
    fireEvent.change(startEditing(), { target: { value: "新しい名前" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect((await screen.findByRole("alert")).textContent).toBe("レシピが見つかりませんでした。");
  });

  it("失敗しても編集をやめさせない（入力が残る）", async () => {
    fetchMock.mockResolvedValue(fail(500, "INTERNAL_ERROR", "問題が発生しました。"));
    setup();
    fireEvent.change(startEditing(), { target: { value: "新しい名前" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await screen.findByRole("alert");
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("新しい名前");
  });

  it("失敗したら親に知らせない（画面のタイトルを変えない）", async () => {
    fetchMock.mockResolvedValue(fail(500, "INTERNAL_ERROR", "問題が発生しました。"));
    const { onRenamed } = setup();
    fireEvent.change(startEditing(), { target: { value: "新しい名前" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await screen.findByRole("alert");
    expect(onRenamed).not.toHaveBeenCalled();
  });

  it("通信そのものが失敗したときも案内を出す", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    setup();
    fireEvent.change(startEditing(), { target: { value: "新しい名前" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect((await screen.findByRole("alert")).textContent).toContain("通信");
  });

  it("JSON でない応答でも英語の生メッセージを出さない", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, text: async () => "<html>Bad Gateway" });
    setup();
    fireEvent.change(startEditing(), { target: { value: "新しい名前" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toMatch(/html|Bad Gateway/);
    expect(alert.textContent).toMatch(/問題が発生しました/);
  });
});

/**
 * 「移動 / 操作 / 絞り込み」の描き分け（design.md 6.2。**このデザインの中核ルール**）。
 *
 * `✎ 改題` は**モードが変わる＝操作**なので、枠線・角丸・面は白。
 * **面なしにすると「移動」と混ざる**（design.md 6.7 の食い違い7）。
 */
describe("✎ 改題は「操作」として描く", () => {
  it("枠線を持つ", () => {
    setup();

    expect(screen.getByRole("button", { name: "✎ 改題" }).className).toMatch(/border-/);
  });

  it("塗りつぶしの面を持たない（絞り込みのピルと混ぜない）", () => {
    setup();

    const button = screen.getByRole("button", { name: "✎ 改題" });

    // ⚠️ `hover:bg-primary-soft` は「面」ではなく hover 時の色。
    // 素朴に /bg-/ で見ると hover まで拾ってしまうので、
    // **variant の付いていない**クラスだけを見る
    const base = button.className.split(/\s+/).filter((name) => !name.includes(":"));

    expect(base.some((name) => name.startsWith("bg-"))).toBe(false);
  });
});
