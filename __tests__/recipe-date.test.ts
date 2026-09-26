import { describe, expect, it } from "vitest";

import { formatRecipeDate } from "@/lib/recipes/date";

describe("formatRecipeDate（recipe-list design.md 1.4）", () => {
  it("「2026年8月12日」の形式になる", () => {
    // 正午の UTC。どのタイムゾーンで見ても8月12日なので、書式だけを見ている
    expect(formatRecipeDate(new Date("2026-08-12T12:00:00Z"))).toBe("2026年8月12日");
  });

  /**
   * ⚠️ このフェーズで2番目に踏みやすい間違い（落とし穴 #11）。
   *
   * `timeZone` を省くと実行環境の既定になる。**Vercel は UTC、手元は JST。**
   * 下の時刻は UTC では8月11日、JST では8月12日の朝8時。
   *
   * **timeZone を外すと、手元（JST）では通り、本番（UTC）でだけ落ちる。**
   * CI も手元も JST とは限らないので、ここで固定しておく。
   */
  it("UTC の深夜でも日本時間の日付になる（timeZone を省くと落ちる）", () => {
    expect(formatRecipeDate(new Date("2026-08-11T23:00:00Z"))).toBe("2026年8月12日");
  });

  it("日本時間の日付が変わる境目で切り替わる", () => {
    // JST 8/11 23:59（= UTC 8/11 14:59）はまだ8月11日
    expect(formatRecipeDate(new Date("2026-08-11T14:59:00Z"))).toBe("2026年8月11日");
    // JST 8/12 00:00（= UTC 8/11 15:00）から8月12日
    expect(formatRecipeDate(new Date("2026-08-11T15:00:00Z"))).toBe("2026年8月12日");
  });

  it("月と日をゼロ埋めしない（デザインの「2026年8月12日」に合わせる）", () => {
    const formatted = formatRecipeDate(new Date("2026-01-05T12:00:00Z"));

    expect(formatted).toBe("2026年1月5日");
    expect(formatted).not.toContain("01月");
    expect(formatted).not.toContain("05日");
  });

  it("年をまたぐ日付も正しく出る", () => {
    // JST 2027/1/1 00:00（= UTC 2026/12/31 15:00）。**年まで繰り上がる**
    expect(formatRecipeDate(new Date("2026-12-31T15:00:00Z"))).toBe("2027年1月1日");
  });

  it("実行のたびに同じ結果になる（フォーマッタを使い回しても壊れない）", () => {
    const date = new Date("2026-08-12T12:00:00Z");

    expect(formatRecipeDate(date)).toBe(formatRecipeDate(date));
  });

  it("文字列を返す（Date を Client Component へ渡さないため）", () => {
    expect(typeof formatRecipeDate(new Date("2026-08-12T12:00:00Z"))).toBe("string");
  });
});
