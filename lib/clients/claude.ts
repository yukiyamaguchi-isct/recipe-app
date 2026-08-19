import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { Category } from "@/generated/prisma/client";
import { AnalysisFailedError, AnalysisRefusedError, AnalysisTimeoutError } from "@/lib/errors";

/**
 * Claude API にレシピ画像を送り、構造化データとして材料と手順を受け取る。
 *
 * 実装上の注意はすべて `.kiro/specs/recipe-analysis/design.md` の 1.2〜1.4 / 1.7 と
 * 9章の落とし穴に出典付きで書いてある。**記憶で書き換えないこと。**
 */

/** ✅ 実測: `Model` 型のユニオンに含まれる（design.md 1.7）。日付サフィックスは付けない。 */
const MODEL = "claude-opus-5";

/**
 * thinking と本文の**合計**に対する上限（design.md 1.3）。
 *
 * **Opus 5 は thinking が既定でONなので、本文の長さだけで見積もると足りない。**
 * 足りないと `stop_reason: "max_tokens"` で本文が途中で切れ、structured outputs の
 * パースに失敗して `parsed_output` が null になる。
 */
const MAX_TOKENS = 16000;

/** SDK のタイムアウトは**ミリ秒**（design.md 1.4）。`maxDuration = 60` の内側に収める。 */
const TIMEOUT_MS = 50_000;

/**
 * Claude が返す構造。
 *
 * **`category` は Prisma の enum から作る。** 文字列を並べ直すと schema.prisma と
 * ズレたときに実行時まで気づけない（design.md 8章）。
 */
export const RecipeAnalysisSchema = z.object({
  /** レシピが読み取れなかった場合は false。推測で埋めさせない（design.md 5.2）。 */
  isRecipe: z.boolean(),
  title: z.string(),
  /**
   * 何人分か。**数値**で持つ（design.md 6.2.4）。
   *
   * 「2〜3人分」のような幅のある表記や、人数が書かれていないレシピは `null`。
   * **範囲を勝手に1つの数字に丸めさせない**（プロンプトで指示している）。
   */
  servings: z.number().int().nullable(),
  ingredients: z.array(
    z.object({
      name: z.string(),
      /** 「少々」「適量」をそのまま入れる。数値と単位に分けない（requirements.md Req3）。 */
      amount: z.string().nullable(),
      category: z.enum(Category),
    }),
  ),
  steps: z.array(z.string()),
});

export type RecipeAnalysis = z.infer<typeof RecipeAnalysisSchema>;

/**
 * 読み取りの指示。
 *
 * **形式の指示は書かない。** JSON の構造は structured outputs が保証するので、
 * ここは「何を読み取るか」だけに集中する（design.md 5.2）。
 */
const PROMPT = `この画像は料理本またはレシピカードのページです。書かれている内容を読み取ってください。

- タイトルは、そのレシピの料理名です。
- 何人分かが「4人分」「2人前」のように**1つの数値で**書かれている場合だけ、その数値を読み取ります。「2〜3人分」のように幅がある場合、「たっぷり」のように数値でない場合、どこにも書かれていない場合は、**空にします。推測や丸めをしないでください。**
- 材料は、書かれている順に、名前と分量に分けて読み取ります。
- 分量は**書かれているとおりの文字列**にします。「少々」「適量」「1/2個」などを数値に直したり、単位を補ったりしないでください。分量が書かれていない材料は分量を空にします。
- 材料の分類は次の基準です。
  - VEGETABLE: 野菜・きのこ・いも類・豆類など、青果として扱われるもの。
  - SEASONING: 塩・砂糖・醤油・味噌・酢・油・だし・スパイス・酒・みりんなど、味付けに使うもの。
  - OTHER: 肉・魚介・卵・乳製品・穀類・麺・加工食品など、上のどちらでもないもの。
  - にんにく・しょうが・ねぎのような薬味は、青果として買うものなので VEGETABLE にします。
- 手順は原文の順序を保ち、1工程を1つの文字列にします。番号や「①」などの記号は本文に含めません。

**読み取れなかった場合は推測で埋めないでください。** レシピが写っていない、文字が潰れて読めない、ページの一部しか写っていない、といった場合は isRecipe を false にし、他の項目は空にしてください。`;

/**
 * 遅延生成する。モジュール読み込み時に作ると、`ANTHROPIC_API_KEY` が無い環境
 * （テスト・ビルド）でファイルを import しただけで落ちる。
 */
let client: Anthropic | undefined;

function getClient(): Anthropic {
  client ??= new Anthropic({
    timeout: TIMEOUT_MS,
    // タイムアウトもリトライ対象なので、既定の2のままだと最悪 timeout × 3 かかる。
    // リトライはユーザーの再試行に委ねる（design.md 1.4）。
    maxRetries: 0,
  });
  return client;
}

/**
 * 正規化済みのJPEG画像を解析する。
 *
 * @param jpeg 長辺2576px / JPEG品質85に正規化済みの画像（`lib/images/normalize.ts`）
 * @throws {AnalysisTimeoutError} SDK のタイムアウト
 * @throws {AnalysisRefusedError} `stop_reason: "refusal"`
 * @throws {AnalysisFailedError} 出力が途中で切れた / パースできない / レシピが写っていない
 */
export async function analyzeRecipeImage(jpeg: Buffer): Promise<RecipeAnalysis> {
  let response;
  try {
    response = await getClient().messages.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      output_config: {
        // ⚠️ 精度が足りなければ上げる（段階12で実測）。API の既定は "high"。
        effort: "low",
        format: zodOutputFormat(RecipeAnalysisSchema),
      },
      // temperature / top_p / top_k は送らない。Opus 5 では400になる（落とし穴 #1）。
      // thinking も指定しない。Opus 5 は既定でONで、切ると別の不具合を招く（5.1 の表）。
      messages: [
        {
          role: "user",
          content: [
            // 画像はテキストより前に置く。逆にすると精度が落ちる（落とし穴 #11）。
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") },
            },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });
  } catch (cause) {
    if (cause instanceof Anthropic.APIConnectionTimeoutError) {
      throw new AnalysisTimeoutError({ cause });
    }
    throw cause;
  }

  // 分岐は stop_reason で行う。stop_details は拒否時のみ入る補助情報で、
  // 拒否でも null になりうる（claude-api skill）。
  if (response.stop_reason === "refusal") {
    throw new AnalysisRefusedError({ cause: response.stop_details });
  }

  // 出力が上限で切れると structured outputs は完成しない。
  // 下の parsed_output チェックでも捕まるが、原因が分かるようここで分ける。
  if (response.stop_reason === "max_tokens") {
    throw new AnalysisFailedError({ cause: new Error("max_tokens に達して出力が切れた") });
  }

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new AnalysisFailedError({ cause: new Error("parsed_output が null") });
  }

  // レシピが写っていない。Req6 の「撮り直しを促す」に繋がる。
  if (!parsed.isRecipe) {
    throw new AnalysisFailedError();
  }

  return parsed;
}
