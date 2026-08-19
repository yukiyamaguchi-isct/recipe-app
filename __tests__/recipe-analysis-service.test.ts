import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock のファクトリは巻き上げられるため、参照するモックも vi.hoisted で一緒に巻き上げる。
const { normalizeMock, analyzeMock, uploadMock, saveMock } = vi.hoisted(() => ({
  normalizeMock: vi.fn(),
  analyzeMock: vi.fn(),
  uploadMock: vi.fn(),
  saveMock: vi.fn(),
}));

// 外部APIもDBも叩かない（design.md 8章）。この層で見たいのは「どの順序で何を呼ぶか」だけ。
vi.mock("@/lib/images/normalize", () => ({ normalizeImage: normalizeMock }));
vi.mock("@/lib/clients/claude", () => ({ analyzeRecipeImage: analyzeMock }));
vi.mock("@/lib/clients/s3", () => ({ uploadRecipeImage: uploadMock }));
vi.mock("@/lib/repositories/recipe", () => ({ saveRecipe: saveMock }));

import type { RecipeAnalysis } from "@/lib/clients/claude";
import {
  AnalysisFailedError,
  AnalysisTimeoutError,
  StorageFailedError,
  UnsupportedFormatError,
} from "@/lib/errors";
import { analyzeAndSaveRecipe } from "@/lib/services/recipe-analysis";

const RAW = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x11, 0x22]);
const NORMALIZED = Buffer.from([0xff, 0xd8, 0xff, 0x99]);
const USER_ID = "clx1a2b3c4d5e6f7g8h9";
const IMAGE_KEY = `${USER_ID}/8f14e45f-ceea-467a-9575-5b1f5d21ad5c.jpg`;

const ANALYSIS: RecipeAnalysis = {
  isRecipe: true,
  title: "肉じゃが",
  servings: 4,
  ingredients: [{ name: "じゃがいも", amount: "3個", category: "VEGETABLE" }],
  steps: ["じゃがいもを切る"],
};

const INPUT = { userId: USER_ID, image: RAW };

beforeEach(() => {
  for (const mock of [normalizeMock, analyzeMock, uploadMock, saveMock]) {
    mock.mockReset();
  }
  normalizeMock.mockResolvedValue(NORMALIZED);
  analyzeMock.mockResolvedValue(ANALYSIS);
  uploadMock.mockResolvedValue(IMAGE_KEY);
  saveMock.mockResolvedValue({ id: "recipe_1" });
});

describe("正常系", () => {
  it("保存したレシピのIDを返す", async () => {
    await expect(analyzeAndSaveRecipe(INPUT)).resolves.toEqual({ recipeId: "recipe_1" });
  });

  it("4つの処理を1回ずつ呼ぶ", async () => {
    await analyzeAndSaveRecipe(INPUT);

    expect(normalizeMock).toHaveBeenCalledTimes(1);
    expect(analyzeMock).toHaveBeenCalledTimes(1);
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it("正規化 → 解析 → S3 → 保存 の順で呼ぶ（design.md 4.1）", async () => {
    const order: string[] = [];
    normalizeMock.mockImplementation(async () => (order.push("normalize"), NORMALIZED));
    analyzeMock.mockImplementation(async () => (order.push("analyze"), ANALYSIS));
    uploadMock.mockImplementation(async () => (order.push("upload"), IMAGE_KEY));
    saveMock.mockImplementation(async () => (order.push("save"), { id: "recipe_1" }));

    await analyzeAndSaveRecipe(INPUT);

    expect(order).toEqual(["normalize", "analyze", "upload", "save"]);
  });
});

describe("何を次へ渡すか", () => {
  it("正規化には受け取った生の画像を渡す", async () => {
    await analyzeAndSaveRecipe(INPUT);

    expect(normalizeMock).toHaveBeenCalledWith(RAW);
  });

  it("Claude には正規化後の画像を渡す（生の画像を送らない）", async () => {
    await analyzeAndSaveRecipe(INPUT);

    expect(analyzeMock).toHaveBeenCalledWith(NORMALIZED);
    expect(analyzeMock).not.toHaveBeenCalledWith(RAW);
  });

  it("S3 にも正規化後の画像を置く（元画像は保持しない）", async () => {
    await analyzeAndSaveRecipe(INPUT);

    expect(uploadMock).toHaveBeenCalledWith(USER_ID, NORMALIZED);
  });

  it("保存には S3 のキーと解析結果を渡す", async () => {
    await analyzeAndSaveRecipe(INPUT);

    expect(saveMock).toHaveBeenCalledWith({
      userId: USER_ID,
      imageKey: IMAGE_KEY,
      analysis: ANALYSIS,
    });
  });

  it("userId を書き換えずにそのまま流す（Req7）", async () => {
    await analyzeAndSaveRecipe({ ...INPUT, userId: "another_user_id" });

    expect(uploadMock.mock.calls[0][0]).toBe("another_user_id");
    expect(saveMock.mock.calls[0][0].userId).toBe("another_user_id");
  });
});

describe("失敗時に後始末が要らない順序であること（design.md 4.1）", () => {
  it("正規化に失敗したら、解析もS3も保存も呼ばない", async () => {
    normalizeMock.mockRejectedValue(new UnsupportedFormatError());

    await expect(analyzeAndSaveRecipe(INPUT)).rejects.toBeInstanceOf(UnsupportedFormatError);
    expect(analyzeMock).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
    expect(saveMock).not.toHaveBeenCalled();
  });

  /**
   * **この段階の要。** S3 を先に呼ぶ実装にすると、解析が失敗するたびに
   * 誰も参照しない画像がバケットに溜まる。解析失敗は日常的に起きるので、
   * 順序を逆にした瞬間にこのテストが落ちるようにしてある。
   */
  it("解析に失敗したら S3 を呼ばない（孤児の画像を作らない）", async () => {
    analyzeMock.mockRejectedValue(new AnalysisFailedError());

    await expect(analyzeAndSaveRecipe(INPUT)).rejects.toBeInstanceOf(AnalysisFailedError);
    expect(uploadMock).not.toHaveBeenCalled();
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("タイムアウトでも S3 を呼ばない", async () => {
    analyzeMock.mockRejectedValue(new AnalysisTimeoutError());

    await expect(analyzeAndSaveRecipe(INPUT)).rejects.toBeInstanceOf(AnalysisTimeoutError);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("S3 に失敗したら保存しない（画像の無いレシピを作らない）", async () => {
    uploadMock.mockRejectedValue(new StorageFailedError());

    await expect(analyzeAndSaveRecipe(INPUT)).rejects.toBeInstanceOf(StorageFailedError);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("エラーの型を保ったまま投げ直す（握り潰さない・別の型に変えない）", async () => {
    const failure = new AnalysisFailedError();
    analyzeMock.mockRejectedValue(failure);

    await expect(analyzeAndSaveRecipe(INPUT)).rejects.toBe(failure);
  });

  it("保存に失敗したら呼び出し側に伝わる（成功として返さない）", async () => {
    const failure = new Error("db is down");
    saveMock.mockRejectedValue(failure);

    await expect(analyzeAndSaveRecipe(INPUT)).rejects.toBe(failure);
  });
});

describe("確認画面の前に保存を終える（requirements.md Req4）", () => {
  it("保存が完了してから返る", async () => {
    let saved = false;
    saveMock.mockImplementation(async () => {
      // 保存に時間がかかっても、待たずに返してはいけない
      await new Promise((resolve) => setTimeout(resolve, 10));
      saved = true;
      return { id: "recipe_1" };
    });

    await analyzeAndSaveRecipe(INPUT);

    expect(saved).toBe(true);
  });
});

describe("この層が知らないこと（.kiro/steering/architecture.md）", () => {
  it("HTTP を扱わない（Response を返さない）", async () => {
    const result = await analyzeAndSaveRecipe(INPUT);

    expect(result).not.toBeInstanceOf(Response);
    expect(result).toEqual({ recipeId: "recipe_1" });
  });

  it("返すのは recipeId だけ（解析結果の中身は返さない）", async () => {
    const result = await analyzeAndSaveRecipe(INPUT);

    expect(Object.keys(result)).toEqual(["recipeId"]);
  });
});
