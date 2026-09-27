import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));

// ⚠️ useRouter を返さないモックだと「No "useRouter" export is defined」で落ちる（recipe-list 落とし穴 #32）
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: replaceMock }) }));

import {
  RecipeEditor,
  type EditorIngredient,
  type EditorStep,
} from "@/app/recipes/[id]/edit/recipe-editor";
import { Category } from "@/generated/prisma/enums";
import { INTERNAL_ERROR } from "@/lib/api-response";
import {
  EMPTY_NAME_CONTENTS_MESSAGE,
  MAX_AMOUNT_LENGTH,
  MAX_STEP_LENGTH,
} from "@/lib/recipes/contents";

const RECIPE_ID = "clr1a2b3c4d5e6f7g8h9";

const INGREDIENTS: EditorIngredient[] = [
  { id: "i1", name: "じゃがいも", amount: "3個", category: Category.VEGETABLE },
  { id: "i2", name: "塩", amount: null, category: Category.SEASONING },
];
const STEPS: EditorStep[] = [{ id: "s1", text: "切る。" }];

const fetchMock = vi.fn();

function ok() {
  return new Response(JSON.stringify({ success: true, data: { id: RECIPE_ID }, error: null }), {
    status: 200,
  });
}

function renderEditor(ingredients = INGREDIENTS, steps = STEPS) {
  return render(<RecipeEditor recipeId={RECIPE_ID} ingredients={ingredients} steps={steps} />);
}

const saveButton = () => screen.getByRole("button", { name: /^保存/ }) as HTMLButtonElement;
const type = (name: string, value: string) =>
  fireEvent.change(screen.getByRole("textbox", { name }), { target: { value } });

/** 送った body */
function sentBody() {
  return JSON.parse(fetchMock.mock.calls[0][1].body as string);
}

beforeEach(() => {
  replaceMock.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(ok());
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("送るもの", () => {
  it("PUT /api/recipes/<id> に JSON で送る", async () => {
    renderEditor();

    fireEvent.click(saveButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/recipes/${RECIPE_ID}`);
    expect(init.method).toBe("PUT");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("整えた形で送る: 前後の空白を落とし、分量の空は null（design.md 4.4）", async () => {
    renderEditor();

    type("材料名（1行目）", "  新じゃが  ");
    type("分量（1行目）", "   ");
    fireEvent.click(saveButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody()).toEqual({
      ingredients: [
        { name: "新じゃが", amount: null, category: Category.VEGETABLE },
        { name: "塩", amount: null, category: Category.SEASONING },
      ],
      steps: ["切る。"],
    });
  });

  it("**空の行・空の手順は捨てて送る**（止めない）", async () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "＋ 行を追加" }));
    fireEvent.click(screen.getByRole("button", { name: "＋ 手順を追加" }));
    fireEvent.click(saveButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody().ingredients).toHaveLength(2);
    expect(sentBody().steps).toEqual(["切る。"]);
  });

  it("材料も手順も全部消したら、空の配列で送る（0件を許す）", async () => {
    renderEditor([], []);

    fireEvent.click(saveButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody()).toEqual({ ingredients: [], steps: [] });
  });
});

describe("成功したとき", () => {
  it("S-04 通常モードへ replace で戻る（push ではない。落とし穴 #N10）", async () => {
    renderEditor();

    fireEvent.click(saveButton());

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith(`/recipes/${RECIPE_ID}`));
  });

  it("遷移が終わるまで「保存中…」のまま押せない", async () => {
    renderEditor();

    fireEvent.click(saveButton());

    await waitFor(() => expect(replaceMock).toHaveBeenCalled());
    expect(saveButton().textContent).toBe("保存中…");
    expect(saveButton().disabled).toBe(true);
  });
});

describe("二重送信", () => {
  it("**同じ瞬間に2回押しても1回しか送らない**（ref による2層目）", async () => {
    let resolve: (response: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    renderEditor();

    // 描画をはさまずに2回呼ぶ（disabled が効く前）
    act(() => {
      saveButton().click();
      saveButton().click();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => resolve(ok()));
  });

  it("保存中はボタンが押せない（1層目）", async () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));
    renderEditor();

    fireEvent.click(saveButton());

    await waitFor(() => expect(saveButton().disabled).toBe(true));
    fireEvent.click(saveButton());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("欄ごとの検証（送る前）", () => {
  it("**材料名だけ空の行があると送らず**、その欄に「材料名：未入力」を出してフォーカスする", () => {
    renderEditor();

    // 1行目は分量「3個」が残るので「材料名だけ空」になる
    type("材料名（1行目）", "");
    fireEvent.click(saveButton());

    expect(fetchMock).not.toHaveBeenCalled();

    const name = screen.getByRole("textbox", { name: "材料名（1行目）" });
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(name.getAttribute("aria-describedby")!)?.textContent).toBe(
      "材料名：未入力",
    );
    expect(document.activeElement).toBe(name);
  });

  it("**押す前は「未入力」を出さない**（行を追加した直後から赤くしない）", () => {
    renderEditor();

    type("材料名（1行目）", "");

    expect(screen.queryByText("材料名：未入力")).toBeNull();
    expect(
      screen.getByRole("textbox", { name: "材料名（1行目）" }).getAttribute("aria-invalid"),
    ).toBe("false");
  });

  it("一度押したあとは、直すとその場で消える", () => {
    renderEditor();

    type("材料名（1行目）", "");
    fireEvent.click(saveButton());
    expect(screen.getByText("材料名：未入力")).toBeTruthy();

    type("材料名（1行目）", "男爵いも");

    expect(screen.queryByText("材料名：未入力")).toBeNull();
  });

  it("分量・手順の長すぎも欄ごとに出し、送らない", () => {
    renderEditor();

    type("分量（1行目）", "あ".repeat(MAX_AMOUNT_LENGTH + 1));
    type("手順1の本文", "あ".repeat(MAX_STEP_LENGTH + 1));
    fireEvent.click(saveButton());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(`分量：${MAX_AMOUNT_LENGTH}文字以内`)).toBeTruthy();
    expect(screen.getByText(`本文：${MAX_STEP_LENGTH}文字以内`)).toBeTruthy();
    // 最初の問題（画面の上から）へフォーカス
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "分量（1行目）" }));
  });

  it("入力欄は scroll-margin-top を持つ（フォーカスで固定ヘッダーの下に潜らない）", () => {
    renderEditor();

    expect(screen.getByRole("textbox", { name: "材料名（1行目）" }).className).toMatch(
      /(^|\s)scroll-mt-/,
    );
    expect(screen.getByRole("textbox", { name: "手順1の本文" }).className).toMatch(
      /(^|\s)scroll-mt-/,
    );
  });
});

describe("失敗したとき", () => {
  it("サーバーの文言をヘッダーの中に出し、**下書きを残し**、また押せる", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          data: null,
          error: { code: "VALIDATION_ERROR", message: EMPTY_NAME_CONTENTS_MESSAGE },
        }),
        { status: 400 },
      ),
    );
    renderEditor();

    type("材料名（1行目）", "新じゃが");
    fireEvent.click(saveButton());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(EMPTY_NAME_CONTENTS_MESSAGE);
    expect(screen.getByRole("banner").contains(alert)).toBe(true);
    expect(
      (screen.getByRole("textbox", { name: "材料名（1行目）" }) as HTMLInputElement).value,
    ).toBe("新じゃが");
    expect(saveButton().disabled).toBe(false);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("JSON でない応答は INTERNAL_ERROR の文言に倒す（クライアントで文言を作らない）", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Bad Gateway</html>", { status: 502 }));
    renderEditor();

    fireEvent.click(saveButton());

    expect((await screen.findByRole("alert")).textContent).toBe(INTERNAL_ERROR.message);
  });

  it("通信そのものの失敗は通信の文言", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    renderEditor();

    fireEvent.click(saveButton());

    expect((await screen.findByRole("alert")).textContent).toMatch(/通信に失敗しました/);
  });

  it("もう一度押すと前回の失敗の表示が消える", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderEditor();

    fireEvent.click(saveButton());
    await screen.findByRole("alert");

    fetchMock.mockReturnValueOnce(new Promise<Response>(() => {}));
    fireEvent.click(saveButton());

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
