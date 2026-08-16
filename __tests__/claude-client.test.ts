import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock のファクトリは巻き上げられるため、参照するモックも vi.hoisted で一緒に巻き上げる。
const { parseMock, constructorMock } = vi.hoisted(() => ({
  parseMock: vi.fn(),
  constructorMock: vi.fn(),
}));

// SDK 本体は差し替えるが、エラークラスは実物を残す。
// AnalysisTimeoutError への変換は instanceof で判定しているため、偽物だと素通りしてしまう。
vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  class MockAnthropic {
    messages = { parse: parseMock };
    constructor(options: unknown) {
      constructorMock(options);
    }
    static APIConnectionTimeoutError = actual.APIConnectionTimeoutError;
  }
  return { ...actual, default: MockAnthropic };
});

import Anthropic from "@anthropic-ai/sdk";

import { Category } from "@/generated/prisma/client";
import { RecipeAnalysisSchema, analyzeRecipeImage } from "@/lib/clients/claude";
import { AnalysisFailedError, AnalysisRefusedError, AnalysisTimeoutError } from "@/lib/errors";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0x00]);

const VALID_OUTPUT = {
  isRecipe: true,
  title: "肉じゃが",
  servings: 4,
  ingredients: [
    { name: "じゃがいも", amount: "3個", category: "VEGETABLE" },
    { name: "牛こま切れ肉", amount: "200g", category: "OTHER" },
    { name: "醤油", amount: "大さじ2", category: "SEASONING" },
    { name: "塩", amount: null, category: "SEASONING" },
  ],
  steps: ["じゃがいもを一口大に切る", "鍋で肉を炒める", "だしを加えて20分煮る"],
};

/** 成功レスポンスを組み立てる。個々のテストで一部だけ差し替える。 */
function response(overrides: Record<string, unknown> = {}) {
  return { stop_reason: "end_turn", stop_details: null, parsed_output: VALID_OUTPUT, ...overrides };
}

beforeEach(() => {
  parseMock.mockReset();
  constructorMock.mockReset();
});

describe("スキーマが Prisma と一致する（design.md 8章）", () => {
  /**
   * Zod と Prisma の enum がずれると、保存の段階まで気づけない。
   * 型でも捕まらないのでテストで固定する（Phase 1 のスキーマテストと同じ考え方）。
   */
  it("category の3値が Prisma の Category と一致する", () => {
    const zodValues = RecipeAnalysisSchema.shape.ingredients.element.shape.category.options;

    expect([...zodValues].sort()).toEqual(Object.values(Category).sort());
  });

  it("Prisma の Category は3値（増えたらプロンプトの分類基準も直す）", () => {
    expect(Object.values(Category)).toEqual(["SEASONING", "VEGETABLE", "OTHER"]);
  });

  it("amount は null を受け付ける（分量が書かれていない材料があるため）", () => {
    const parsed = RecipeAnalysisSchema.parse(VALID_OUTPUT);

    expect(parsed.ingredients[3].amount).toBeNull();
  });

  it("「少々」のような文字列をそのまま保持する（requirements.md Req3）", () => {
    const parsed = RecipeAnalysisSchema.parse({
      ...VALID_OUTPUT,
      ingredients: [{ name: "こしょう", amount: "少々", category: "SEASONING" }],
    });

    expect(parsed.ingredients[0].amount).toBe("少々");
  });

  it("servings は数値で受け取る（design.md 6.2.4）", () => {
    expect(RecipeAnalysisSchema.parse(VALID_OUTPUT).servings).toBe(4);
  });

  it("人数が読み取れない場合は servings が null", () => {
    // 「2〜3人分」「たっぷり」「記載なし」はすべてここに落ちる
    const parsed = RecipeAnalysisSchema.parse({ ...VALID_OUTPUT, servings: null });

    expect(parsed.servings).toBeNull();
  });

  it("servings に文字列を入れさせない（「4人分」ではなく 4）", () => {
    expect(() => RecipeAnalysisSchema.parse({ ...VALID_OUTPUT, servings: "4人分" })).toThrow();
  });

  it("servings は整数のみ（2.5人分のような値を弾く）", () => {
    expect(() => RecipeAnalysisSchema.parse({ ...VALID_OUTPUT, servings: 2.5 })).toThrow();
  });

  it("知らないカテゴリを弾く", () => {
    expect(() =>
      RecipeAnalysisSchema.parse({
        ...VALID_OUTPUT,
        ingredients: [{ name: "牛肉", amount: "200g", category: "MEAT" }],
      }),
    ).toThrow();
  });
});

describe("リクエストの組み立て（design.md 5.1 / 落とし穴 #1・#11）", () => {
  it("画像ブロックをテキストブロックより前に置く", async () => {
    parseMock.mockResolvedValue(response());

    await analyzeRecipeImage(JPEG);

    const content = parseMock.mock.calls[0][0].messages[0].content;
    expect(content.map((block: { type: string }) => block.type)).toEqual(["image", "text"]);
  });

  it("画像を base64 の JPEG として送る", async () => {
    parseMock.mockResolvedValue(response());

    await analyzeRecipeImage(JPEG);

    expect(parseMock.mock.calls[0][0].messages[0].content[0].source).toEqual({
      type: "base64",
      media_type: "image/jpeg",
      data: JPEG.toString("base64"),
    });
  });

  it("temperature / top_p / top_k を送らない（送ると400）", async () => {
    parseMock.mockResolvedValue(response());

    await analyzeRecipeImage(JPEG);

    const params = parseMock.mock.calls[0][0];
    expect(params).not.toHaveProperty("temperature");
    expect(params).not.toHaveProperty("top_p");
    expect(params).not.toHaveProperty("top_k");
  });

  it("thinking を指定しない（Opus 5 は既定でON。切ると別の不具合を招く）", async () => {
    parseMock.mockResolvedValue(response());

    await analyzeRecipeImage(JPEG);

    expect(parseMock.mock.calls[0][0]).not.toHaveProperty("thinking");
  });

  it("モデルIDと effort と max_tokens を指定する", async () => {
    parseMock.mockResolvedValue(response());

    await analyzeRecipeImage(JPEG);

    const params = parseMock.mock.calls[0][0];
    expect(params.model).toBe("claude-opus-5");
    expect(params.output_config.effort).toBe("low");
    // thinking と本文の合計に対する上限。thinking が既定でONなので余裕を持たせる
    expect(params.max_tokens).toBeGreaterThanOrEqual(16000);
  });

  it("output_config.format に構造を渡す（トップレベルの output_format ではない）", async () => {
    parseMock.mockResolvedValue(response());

    await analyzeRecipeImage(JPEG);

    const params = parseMock.mock.calls[0][0];
    expect(params.output_config.format).toBeDefined();
    expect(params).not.toHaveProperty("output_format");
  });

  it("timeout をミリ秒で、maxRetries を0で作る（design.md 1.4）", async () => {
    // クライアントは初回呼び出し時に1度だけ作られる
    vi.resetModules();
    parseMock.mockResolvedValue(response());
    const { analyzeRecipeImage: fresh } = await import("@/lib/clients/claude");

    await fresh(JPEG);

    expect(constructorMock).toHaveBeenCalledWith({ timeout: 50_000, maxRetries: 0 });
  });

  it("プロンプトに出力形式の指示を含めない（構造はスキーマが保証する）", async () => {
    parseMock.mockResolvedValue(response());

    await analyzeRecipeImage(JPEG);

    const text = parseMock.mock.calls[0][0].messages[0].content[1].text;
    expect(text).not.toMatch(/JSON|json/);
  });

  it("プロンプトに3分類の基準を含める（design.md 5.2）", async () => {
    parseMock.mockResolvedValue(response());

    await analyzeRecipeImage(JPEG);

    const text = parseMock.mock.calls[0][0].messages[0].content[1].text;
    for (const category of Object.values(Category)) {
      expect(text).toContain(category);
    }
  });

  it("プロンプトが人数の丸めを禁じている（design.md 6.2.4）", async () => {
    parseMock.mockResolvedValue(response());

    await analyzeRecipeImage(JPEG);

    // スキーマは「数値か null」しか保証しない。「2〜3人分」を勝手に 2 や 3 にしないことは
    // プロンプトでしか担保できないので、指示が消えていないことを固定する。
    const text = parseMock.mock.calls[0][0].messages[0].content[1].text;
    expect(text).toContain("人分");
    expect(text).toMatch(/推測や丸めをしないでください/);
  });
});

describe("成功時", () => {
  it("解析結果をそのまま返す", async () => {
    parseMock.mockResolvedValue(response());

    await expect(analyzeRecipeImage(JPEG)).resolves.toEqual(VALID_OUTPUT);
  });
});

describe("失敗時（design.md 5.1 の失敗モード表）", () => {
  it("stop_reason が refusal なら AnalysisRefusedError", async () => {
    parseMock.mockResolvedValue(
      response({
        stop_reason: "refusal",
        stop_details: { category: "cyber" },
        parsed_output: null,
      }),
    );

    await expect(analyzeRecipeImage(JPEG)).rejects.toBeInstanceOf(AnalysisRefusedError);
  });

  it("拒否の理由を画面向けの文言に混ぜない", async () => {
    parseMock.mockResolvedValue(
      response({
        stop_reason: "refusal",
        stop_details: { category: "cyber" },
        parsed_output: null,
      }),
    );

    await expect(analyzeRecipeImage(JPEG)).rejects.toSatisfy((error: AnalysisRefusedError) => {
      expect(error.message).not.toContain("cyber");
      expect(error.cause).toEqual({ category: "cyber" });
      return true;
    });
  });

  it("stop_details が null の拒否でも取りこぼさない（分岐は stop_reason で行う）", async () => {
    parseMock.mockResolvedValue(
      response({ stop_reason: "refusal", stop_details: null, parsed_output: null }),
    );

    await expect(analyzeRecipeImage(JPEG)).rejects.toBeInstanceOf(AnalysisRefusedError);
  });

  it("stop_reason が max_tokens なら AnalysisFailedError（出力が途中で切れている）", async () => {
    parseMock.mockResolvedValue(response({ stop_reason: "max_tokens", parsed_output: null }));

    await expect(analyzeRecipeImage(JPEG)).rejects.toBeInstanceOf(AnalysisFailedError);
  });

  it("parsed_output が null なら AnalysisFailedError", async () => {
    parseMock.mockResolvedValue(response({ parsed_output: null }));

    await expect(analyzeRecipeImage(JPEG)).rejects.toBeInstanceOf(AnalysisFailedError);
  });

  it("isRecipe が false なら AnalysisFailedError（撮り直しを促す）", async () => {
    parseMock.mockResolvedValue(
      response({
        parsed_output: { isRecipe: false, title: "", servings: null, ingredients: [], steps: [] },
      }),
    );

    await expect(analyzeRecipeImage(JPEG)).rejects.toBeInstanceOf(AnalysisFailedError);
  });

  it("撮り直しの文言に具体的な指示が入っている（Req6）", async () => {
    parseMock.mockResolvedValue(
      response({
        parsed_output: { isRecipe: false, title: "", servings: null, ingredients: [], steps: [] },
      }),
    );

    await expect(analyzeRecipeImage(JPEG)).rejects.toThrow(/明るい場所/);
  });

  it("SDK のタイムアウトを AnalysisTimeoutError に変換する", async () => {
    parseMock.mockRejectedValue(new Anthropic.APIConnectionTimeoutError({ message: "timed out" }));

    await expect(analyzeRecipeImage(JPEG)).rejects.toBeInstanceOf(AnalysisTimeoutError);
  });

  it("タイムアウト以外の例外はそのまま投げ直す（握り潰さない）", async () => {
    const other = new Error("something else");
    parseMock.mockRejectedValue(other);

    await expect(analyzeRecipeImage(JPEG)).rejects.toBe(other);
  });
});
