# recipe-analysis（Phase 2）の設計書

写真を1枚受け取り、リサイズ → Claude API で解析 → S3 に保存 → DB に保存、までを1本の同期処理で通す。

## この文書の読み方

**主張ごとに検証状態のラベルを付けてある**（`.kiro/README.md` の「design.md の書き方」）。

| ラベル    | 意味                                           | 実装時の扱い             |
| --------- | ---------------------------------------------- | ------------------------ |
| ✅ 実測   | 実際に動かして確認した                         | そのまま信じてよい       |
| 📄 出典   | 公式ドキュメントかライブラリのソースで確認した | そのまま信じてよい       |
| ⚠️ 未検証 | 妥当だと考えているが確かめていない             | **実装時に必ず確かめる** |

**ラベルの無い記述は「方針・判断」であって事実の主張ではない。**

> **この文書は着手前に書いたもので、まだ `⚠️ 未検証` が残る。** Phase 1 の design.md（実装完了後に書き直したもの）とは成熟度が違う。**フェーズ完了時に実物から書き直し、`⚠️` を潰すこと。**
>
> **2026-08-15（段階1）に、依存をインストールして 1.5 / 1.6 / 1.7 を実測に置き換えた。** 残る主な `⚠️` は次の3つ。
>
> | 残っている ⚠️                    | 潰すタイミング                                      |
> | -------------------------------- | --------------------------------------------------- |
> | sharp が **Vercel 本番**で動くか | 段階3 で import 後に再確認、本番はデプロイ時（1.5） |
> | `effort: "low"` で精度が足りるか | 段階12 の実測（1.3 / 5.2）                          |
> | 材料3分類の線引きが実物と合うか  | 段階12 の実測（5.2）                                |

## 確定事項（蒸し返さない）

| 項目         | 決定                                            | 出どころ                         |
| ------------ | ----------------------------------------------- | -------------------------------- |
| 解析方式     | 同期処理。ジョブキューを入れない                | `REQUIREMENTS.md` 7.1            |
| モデル       | **`claude-opus-5`**                             | 2026-08-15 ユーザー決定          |
| 画像の正規化 | 長辺2576px / JPEG品質85、クライアント＋サーバー | `REQUIREMENTS.md` 4.2            |
| S3に置くもの | 変換後の画像のみ                                | `REQUIREMENTS.md` 4.2            |
| 送信経路     | Route Handlers（Server Actions は使わない）     | `.kiro/steering/architecture.md` |

---

# 1. 調査結果

## 1.1 画像の制約（📄 出典: `build-with-claude/vision`）

**初版の `REQUIREMENTS.md` 4.2 は2点とも誤っていた**ので、確認した値をここに置く。

| 項目           | 値                                                                    |
| -------------- | --------------------------------------------------------------------- |
| 1画像のサイズ  | **10MB**（base64、Claude API直接）。5MB は Bedrock / Google Cloud     |
| 解像度         | **長辺2576px / visual token 4784**（Claude 4.7 以降の高解像度ティア） |
| トークン数     | `⌈幅/28⌉ × ⌈高さ/28⌉`（28×28px のパッチが1 visual token）             |
| 対応形式       | **JPEG / PNG / GIF / WebP のみ**                                      |
| 最大寸法       | 8000×8000 px                                                          |
| リクエスト全体 | 32MB                                                                  |

**1568px は標準ティア（Claude 4.6 以前）の値。** 古い記述を見たら疑うこと。

読み取れる重要な帰結が3つある。

- **Claude は画像のメタデータを一切読まない。** EXIF の回転情報も渡らない。**`sharp` の `.rotate()` を呼ばないと、解析結果も横倒しの画像に対するものになる**（保存だけの問題ではない）
- **HEIC は API 自体が非対応。** クライアント側の都合以前の話
- 画像はリクエスト処理後に自動削除され、学習にも使われない

**コスト**（📄 出典: 同ドキュメントの試算 + `claude-api` skill の料金表）。`claude-opus-5` は入力 $5 / 出力 $25 per MTok。

| 解像度              | visual token | 1枚あたりの入力コスト |
| ------------------- | ------------ | --------------------- |
| 2576px 長辺（上限） | 4784         | 約 $0.024（約3.6円）  |
| 1568px 長辺         | 1568         | 約 $0.008（約1.2円）  |

`REQUIREMENTS.md` 6.1 の「月100回で200〜500円」の想定に収まる。

## 1.2 構造化出力は tool use ではなく `output_config.format` を使う（📄 出典: `claude-api` skill）

材料・手順・カテゴリを**構造化データ**として受け取る必要がある。手段は2つあるが、**structured outputs を採る。**

```ts
output_config: { format: { type: "json_schema", schema: {...} } }
```

| 手段                         | 採否 | 理由                                                       |
| ---------------------------- | ---- | ---------------------------------------------------------- |
| `output_config.format`       | ✅   | レスポンス全体をスキーマに強制できる。**これが本来の用途** |
| tool use（`strict: true`）   | ❌   | 「関数を呼ぶ」意味が無いのに tool を定義することになる     |
| プロンプトで「JSONで返して」 | ❌   | 保証が無く、パース失敗のリトライを自前で書くことになる     |

**⚠️ 旧APIの `output_format`（トップレベル）は非推奨。** `output_config.format` が正。

### JSON Schema の制約（📄 出典）

- **`additionalProperties: false` がすべてのオブジェクトで必須**
- 再帰スキーマは不可
- **数値制約（`minimum` / `maximum`）と文字列長制約（`minLength` / `maxLength`）は使えない**
- `enum` / `const` / `anyOf` は使える
- 初回リクエストはスキーマのコンパイルで遅くなる。以降24時間キャッシュされる
- **citations と併用すると400になる**（今回は使わないので問題なし）

TypeScript では Zod から生成するのが楽（📄 出典: `typescript/claude-api/tool-use.md`）。

```ts
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const response = await client.messages.parse({
  model: "claude-opus-5",
  max_tokens: 8000,
  messages: [...],
  output_config: { format: zodOutputFormat(RecipeSchema) },
});

// ⚠️ parsed_output はパース失敗時 null。必ずチェックする
if (!response.parsed_output) throw new AnalysisFailedError();
```

## 1.3 Claude Opus 5 のリクエスト面の注意（📄 出典: `claude-api` skill）

**Phase 1 の Auth.js と同じで、記憶で書くと落ちる箇所が複数ある。**

| 項目                              | Opus 5 での挙動                                                        |
| --------------------------------- | ---------------------------------------------------------------------- |
| `temperature` / `top_p` / `top_k` | **送ると400。** プロンプトで制御する                                   |
| `thinking`                        | **省略すると adaptive で ON。** Opus 4.8 以前と逆                      |
| `thinking: {type:"disabled"}`     | effort が `xhigh` / `max` だと**400**。`high` 以下でのみ可             |
| `max_tokens`                      | **thinking と本文の合計に対する上限。** thinking ON なら余裕を持たせる |
| `effort`                          | `output_config.effort` に入れる。トップレベルではない                  |

**effort は `low` から始める。** Opus 5 は `low` / `medium` が同世代比で強く、レシピの読み取りと3分類は極端に難しい推論ではない。**⚠️ 実測で精度が足りなければ上げる**（段階12）。

**`stop_reason: "refusal"` を必ず見る。** Opus 5 は安全性分類器が働き、HTTP 200 のまま `content` が空で返ることがある。料理の写真で発火する見込みは低いが、`content[0]` を無条件に読むコードは壊れる。

## 1.4 SDK のタイムアウトは**ミリ秒**（📄 出典: `claude-api` skill）

**TypeScript SDK の `timeout` はミリ秒。** Python / Ruby は秒で、取り違えやすい。既定は10分で、これは Vercel の関数上限を超える。

```ts
new Anthropic({ timeout: 50_000 }); // 50秒。maxDuration=60 の内側に収める
```

`maxRetries` の既定は2。**タイムアウトもリトライ対象**なので、最悪 `timeout × 3` の時間がかかる。`maxRetries: 0` にして、リトライはユーザーの再試行に委ねる。

## 1.5 `sharp` の挙動（✅ 実測 2026-08-15）／Vercel は ⚠️ 未検証のまま

`sharp@0.35.3`（libvips 8.18.3）をインストールし、**実際に動かして**確認した。再現手順は `npm i sharp` して以下を Node で実行するだけ。

| 確認したこと                       | 入力             | 出力                       | 判定 |
| ---------------------------------- | ---------------- | -------------------------- | ---- |
| 長辺2576pxに収まる                 | 4000×3000        | **2576×1932**（69KB→29KB） | ✅   |
| 2576px 未満を拡大しない            | 800×600          | **800×600**（据え置き）    | ✅   |
| `.rotate()` が EXIF 回転を適用する | 1000×500 / Ori=6 | **500×1000**（正立）       | ✅   |
| `.rotate()` を省いた場合           | 同上             | **1000×500**（横倒し）     | ✅   |

`resize({ width: 2576, height: 2576, fit: "inside", withoutEnlargement: true })` が design 5.3 の意図どおりに動くことを確認した。

### ⚠️ `.rotate()` を省くと「横倒しのまま、直す手がかりも消える」

**9章 #4 の記述は実際より甘かった。** 実測では、`.rotate()` を呼ばなかった出力は寸法が 1000×500 のままなだけでなく、**EXIF の `orientation` タグ自体が `undefined` になる**（sharp は既定で入力のメタデータを出力へ引き継がない）。

つまり失敗モードは「Claude がメタデータを読まないから解析が横倒しになる」だけではない。**S3 に置かれた画像も恒久的に横倒しになり、後からビューア側で回転して救うこともできない。** 元画像は保持しない方針（`REQUIREMENTS.md` 4.2）なので、**やり直しが効かない**。

**見分け方**: 縦に構えて撮った写真を通し、S3 の画像の幅 < 高さ になっていること。横長のままなら `.rotate()` が抜けている。

### ⚠️ Vercel 本番はまだ確認できていない

**ローカルの `npm run build` は成功した**（Next.js 16.3.0 / Turbopack、Linux x64）。ただし **この時点では sharp を `import` するコードがまだ無く、バンドルに含まれていない。** したがって「build が通った」ことは Vercel 対応の根拠にならない。

**段階3（`lib/images/normalize.ts` の追加）で実際に import した後、`npm run build` を再実行して確かめること。** 本番デプロイでの確認はユーザーのローカル／Vercel 側に回す（タスク表の「ローカル限定」欄）。

動かなかった場合の代替は変えていない。

- WASM 版の画像処理ライブラリに切り替える
- サーバー側の再正規化を諦め、クライアント側の正規化のみを信頼する（**セキュリティ上は劣る**ので最後の手段）

## 1.6 AWS SDK v3 の S3 クライアント（✅ 実測 2026-08-15）

`@aws-sdk/client-s3@3.1111.0` の実物で確認した。

```ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// 認証情報はコードに書かない。既定のプロバイダチェーンが環境変数を読む。
const s3 = new S3Client({});

await s3.send(
  new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME!, // 必須
    Key: key, // 必須
    Body: buffer,
    ContentType: "image/jpeg",
  }),
);
```

- **`new S3Client({})` だけで `AWS_REGION` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` を環境変数から解決する**（✅ 実測。`config.region()` と `config.credentials()` を呼んで確認）。**認証情報を明示的にコードへ渡さない**
- `PutObjectCommandInput` の必須は `Bucket` と `Key` のみ。`Body` / `ContentType` は任意だが両方付ける
- エクスポートを確認済み: `S3Client` / `PutObjectCommand` / `GetObjectCommand` / `DeleteObjectCommand`

## 1.7 Anthropic SDK の実物確認（✅ 実測 2026-08-15）

`@anthropic-ai/sdk@0.117.1` の型定義で、1.2〜1.4 に書いた内容を裏取りした。**Phase 1 の4件のハルシネーションはすべてこの手順を省いた箇所から出たため、着手前に必ず通す。**

| design.md の記述                        | 実物での確認                                                     | 判定 |
| --------------------------------------- | ---------------------------------------------------------------- | ---- |
| `client.messages.parse()` が使える      | `resources/messages/messages.d.ts` に `parse<Params>(...)` あり  | ✅   |
| `zodOutputFormat` は `helpers/zod` から | `helpers/zod.d.ts` L12 が export                                 | ✅   |
| `output_config` に `format` と `effort` | `OutputConfig` は `effort?` と `format?` の2つだけを持つ（L854） | ✅   |
| `effort` はトップレベルではない         | 同上。`MessageCreateParams` 直下には無い                         | ✅   |
| `parsed_output` はパース失敗時 `null`   | `lib/parser.d.ts` L20 `parsed_output: ParsedT \| null`           | ✅   |
| `stop_reason` に `refusal` がある       | `StopReason` に `'refusal'` を確認（L1067）                      | ✅   |
| `timeout` はミリ秒                      | `client.d.ts` の JSDoc に **`@unit milliseconds`** と明記        | ✅   |
| `maxRetries` の既定は2                  | `client.d.ts` の JSDoc に **`@default 2`**                       | ✅   |
| モデルIDは `claude-opus-5`              | `Model` 型のユニオンに `'claude-opus-5'` を確認（L853）          | ✅   |
| `thinking` に adaptive がある           | `ThinkingConfigAdaptive { type: 'adaptive' }` を確認             | ✅   |

**`effort` の取りうる値**（型定義そのまま）: `'low' | 'medium' | 'high' | 'xhigh' | 'max'`。design 1.3 の「`low` から始める」は有効。

**zod のバージョン**: SDK の `peerDependencies` は `"zod": "^3.25.0 || ^4.0.0"`。インストールしたのは **zod 4.4.3**。`helpers/zod.d.ts` は `import * as z from 'zod/v4'` なので、**zod 4 系を入れておけば整合する**（zod 3 を入れると `zod/v4` サブパス経由になり書き味が変わる）。

---

# 2. データモデル

**`prisma/schema.prisma` は Phase 0 で作成済みで、このフェーズでの変更は不要**という見立て。

```prisma
model Recipe {
  id, userId, title, imageUrl, createdAt, updatedAt
  ingredients Ingredient[]
  steps       Step[]
}

model Ingredient { id, recipeId, name, amount?, category, order }
model Step       { id, recipeId, order, text }
enum Category    { SEASONING, VEGETABLE, OTHER }
```

- **`amount` は1文字列**（`amount_value` / `amount_unit` に分けない）。「少々」「適量」「1/2個」が実際のレシピに多いため（`.kiro/specs/foundation/design.md`）
- `order` は材料・手順の両方にある。**Claude が返した配列の添字をそのまま入れる**
- `Category` の enum 値がそのまま Claude に渡すスキーマの `enum` になる

> **⚠️ `REQUIREMENTS.md` 8章のデータモデルは古い**（`amount_value` / `amount_unit` に分かれている）。`schema.prisma` が正。8章には注記を追加済み。

---

# 3. ファイル構成

```
app/
├── api/recipes/analyze/route.ts   # 解析エンドポイント（POST, multipart）
└── upload/page.tsx                # S-03
lib/
├── clients/
│   ├── claude.ts                  # Anthropic クライアントと解析呼び出し
│   └── s3.ts                      # S3 クライアントとアップロード
├── services/
│   └── recipe-analysis.ts         # 一連の流れ。HTTPを知らない
├── repositories/
│   └── recipe.ts                  # Prisma 経由の保存
├── images/
│   ├── normalize.ts               # サーバー側（sharp）
│   └── normalize.client.ts        # クライアント側（Canvas）
├── errors.ts                      # エラーを追加
└── api-response.ts                # { success, data, error } の組み立て
```

`.kiro/steering/architecture.md` の3層に従う。**Route Handler にビジネスロジックを書かない。Service は HTTP を知らない。Repository は Prisma だけを知る。**

---

# 4. 処理の流れ

```
クライアント
  1. ファイル選択 → 形式・サイズ検証（HEIC はここで弾く）
  2. Canvas で長辺2576px / JPEG品質85 に正規化
  3. POST /api/recipes/analyze （multipart/form-data）

サーバー（Route Handler → Service）
  4. requireUserId()                    ← 未ログインなら 401
  5. 形式・サイズ検証（クライアントを信用しない）
  6. sharp で .rotate() → 長辺2576px / 品質85 に再正規化
  7. Claude API で解析                   ← 最も高価で最も失敗しやすい
  8. S3 に変換後の画像をアップロード
  9. DB に Recipe / Ingredient / Step を保存
 10. { success: true, data: { recipeId } } を返す

クライアント
 11. 確認画面（S-04c, Phase 3）へ遷移
```

## 4.1 なぜ「解析 → S3 → DB」の順なのか

**S3 への保存を解析の後に置く。** 理由は失敗時の後始末。

| 順序               | 解析失敗時                             | S3失敗時                       |
| ------------------ | -------------------------------------- | ------------------------------ |
| S3 → 解析 → DB     | **S3に孤児の画像が残る**（要削除処理） | 解析前なので損失なし           |
| **解析 → S3 → DB** | S3に何も残らない                       | 解析結果を失う（30秒とコスト） |

**失敗の頻度が違う。** 解析失敗（文字が読めない、タイムアウト）は日常的に起きるが、S3 のアップロード失敗は稀。頻度の高い方で後始末が要らない順序を選ぶ。

**⚠️ この判断は S3 の失敗率が十分低いことを前提にしている。** 実運用で S3 失敗が目立つようなら、解析結果を先に DB へ保存し `imageUrl` を後から埋める形に変える（`imageUrl` を nullable にする変更が要る）。

## 4.2 確認画面の前に保存する（`REQUIREMENTS.md` 4.6）

手順9で保存が完了してから手順10を返すので、**確認画面に到達した時点で必ず保存済み**になる。確認画面で離脱してもレシピは残る。

---

# 5. 実装

## 5.1 Claude への送り方

```ts
// lib/clients/claude.ts
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const RecipeSchema = z.object({
  title: z.string(),
  ingredients: z.array(
    z.object({
      name: z.string(),
      amount: z.string().nullable(),
      category: z.enum(["SEASONING", "VEGETABLE", "OTHER"]),
    }),
  ),
  steps: z.array(z.string()),
  // レシピが写っていない場合に true。Req6 の「撮り直しを促す」判定に使う
  isRecipe: z.boolean(),
});

const client = new Anthropic({
  timeout: 50_000, // ⚠️ ミリ秒。Python/Ruby は秒なので取り違えない（1.4）
  maxRetries: 0, // リトライはユーザーの再試行に委ねる
});
```

**リクエストの形**（1.3 の注意をすべて反映）。

```ts
const response = await client.messages.parse({
  model: "claude-opus-5",
  max_tokens: 8000, // thinking と本文の合計に対する上限
  output_config: {
    effort: "low", // ⚠️ 精度が足りなければ上げる
    format: zodOutputFormat(RecipeSchema),
  },
  // temperature / top_p / top_k は送らない（送ると400）
  messages: [
    {
      role: "user",
      content: [
        // 画像はテキストより前に置く（公式が推奨）
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
        { type: "text", text: PROMPT },
      ],
    },
  ],
});

if (response.stop_reason === "refusal") throw new AnalysisRefusedError();
if (!response.parsed_output) throw new AnalysisFailedError();
```

**失敗モード**

| 抜けるもの                       | 起きること                                      |
| -------------------------------- | ----------------------------------------------- |
| `stop_reason` のチェック         | 拒否時に `parsed_output` が無く、意味不明な例外 |
| `parsed_output` の null チェック | 型上は通るが実行時に undefined を触る           |
| `timeout` をミリ秒で書かない     | 既定10分。Vercel の上限に先に当たる             |
| `maxRetries: 0` を書かない       | タイムアウトが3回繰り返され最悪150秒            |
| 画像をテキストの後に置く         | 精度が落ちる（公式が image-then-text を推奨）   |

## 5.2 プロンプトの方針

**構造はスキーマが保証するので、プロンプトは「何を読み取るか」に集中する。** 形式の指示（「JSONで返して」等）は書かない。

含める内容:

- 料理本のレシピページである前提
- 分量は**書かれているとおりの文字列**で返す（「少々」「適量」を数値化しない）
- カテゴリ判定の基準（野菜 / 調味料 / その他の線引き）
- 手順は原文の順序を保つ
- **レシピが読み取れない場合は `isRecipe: false`**（推測で埋めない）

**⚠️ 分類の線引きは実物で調整が要る。** 「にんにく」「しょうが」は野菜か調味料か、「だし」「めんつゆ」は調味料か、といった判断が分かれる。段階12で実際のレシピを通して詰める。

## 5.3 画像の正規化

**クライアントとサーバーで同じ値**（長辺2576px / JPEG品質85 / 拡大しない）。

```ts
// lib/images/normalize.ts（サーバー）
await sharp(buffer)
  .rotate() // ⚠️ 必須。呼ばないとEXIF回転が適用されず、解析も横倒しの画像に対して行われる
  .resize({ width: 2576, height: 2576, fit: "inside", withoutEnlargement: true })
  .jpeg({ quality: 85 })
  .toBuffer();
```

`fit: "inside"` + `withoutEnlargement: true` で「長辺2576px、拡大しない」になる。

**サーバー側は最終防衛線。** クライアント側の検証は迂回できるので、サーバーで必ずやり直す。

## 5.4 Route Handler

```ts
// app/api/recipes/analyze/route.ts
export const maxDuration = 60; // Vercel の関数実行時間（REQUIREMENTS.md 7.1）
```

**Phase 1 からの持ち越しをここで実装する**（requirements.md Req7）。

- `requireUserId()` で `userId` を取得する。**リクエストボディの `userId` は見ない**
- `UnauthorizedError` → 401 に変換する
- 成功・失敗とも `{ success, data, error }` で返す

```ts
// lib/api-response.ts — 型付きエラーを HTTP に変換する唯一の場所
const STATUS: Record<string, number> = {
  UNAUTHORIZED: 401,
  INVALID_IMAGE: 400,
  IMAGE_TOO_LARGE: 413,
  UNSUPPORTED_FORMAT: 415,
  ANALYSIS_FAILED: 422,
  // 拒否も「リクエストは正しいが内容を処理できない」なので ANALYSIS_FAILED と同じ 422。
  ANALYSIS_REFUSED: 422,
  ANALYSIS_TIMEOUT: 504,
  STORAGE_FAILED: 502,
};
```

> **✅ 実測（段階2）: 初版のこの表には `ANALYSIS_REFUSED` が抜けていた。** 7章のエラー表には載っているのに 5.4 の対応表に無く、そのまま実装すると**拒否だけ 500 になる**ところだった。対応表に無いコードは 500 にフォールバックするため、**型でもテストでも捕まらない**。同じ抜けを繰り返さないよう、`lib/errors.ts` の全エラーが対応表に載っていることをテストで固定した（`__tests__/api-response.test.ts`）。

## 5.5 内部情報を `cause` に隔離する（✅ 実測 2026-08-15）

**`error.message` はユーザーにそのまま出る**（`.kiro/steering/architecture.md`）。一方で、原因調査には外部APIの生メッセージが要る。両立させるため、`AppError` に `cause` を持たせた。

```ts
// lib/errors.ts
export class AppError extends Error {
  readonly code: string;
  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
    this.name = new.target.name;
  }
}
```

- **`message`** — 固定の日本語。各サブクラスがコンストラクタで持ち、呼び出し側は差し替えられない
- **`cause`** — 外部APIの例外。`errorResponse()` が `console.error` に出すだけで、**レスポンスの body には載せない**

**見分け方**: `StorageFailedError` にバケット名入りの `cause` を渡し、レスポンスの JSON 文字列にバケット名が含まれないこと。含まれていれば漏れている。

**無いとどうなるか**: `new StorageFailedError(s3Error.message)` のような書き方が自然に見えてしまい、`Access Denied: bucket recipe-app-prod-images` がそのまま画面に出る。**サブクラスに message を受け取らせない**ことで、この書き方自体を不可能にしている。

---

# 6. 画面: S-03 アップロード / 解析中（`UI_DESIGN.md`）

見た目（配色・書体）は `DESIGN.md` の完成待ち。**ここで決めるのは構造と挙動だけ。**

| 状態           | 表示                                                           |
| -------------- | -------------------------------------------------------------- |
| 初期（PC）     | ドラッグ＆ドロップ領域＋クリック選択。「JPEG / PNG・10MBまで」 |
| 初期（スマホ） | 「カメラで撮る」を第一候補、次に「写真を選ぶ」                 |
| 検証エラー     | その場でメッセージ（HEIC / サイズ超過 / 形式違い）             |
| 解析中         | 段階表示。**離脱させない**                                     |
| 失敗           | 原因＋次の行動＋再試行                                         |

## 6.1 進捗の段階表示（Req5）

**⚠️ 正直に設計する必要がある。** 同期POST1本なので、サーバー側の進捗は本来クライアントに見えない。

| 表示             | 根拠                                               |
| ---------------- | -------------------------------------------------- |
| アップロード中   | **実データ。** `XMLHttpRequest` の upload progress |
| 文字を読み取り中 | **実データ。** アップロード完了イベント            |
| 材料を仕分け中   | **推定。** 上記から一定秒数の経過で切り替える      |

3つ目だけが時間ベースの推定になる。**これを「実際の進捗」と偽らない**。切り替え秒数は段階12の実測から決める。

> 真の進捗が要るならストリーミングか SSE になるが、`REQUIREMENTS.md` 7.1 の「同期処理」の枠を出る。MVPでは採らない。

---

# 7. エラー設計（Req6）

| code                 | 起きる場面                     | 文言の要点                                             |
| -------------------- | ------------------------------ | ------------------------------------------------------ |
| `UNSUPPORTED_FORMAT` | HEIC など                      | 対応形式を挙げ、JPEGで撮り直す方法を示す               |
| `IMAGE_TOO_LARGE`    | 10MB超                         | 上限を示す                                             |
| `ANALYSIS_FAILED`    | `isRecipe: false` / パース失敗 | **明るい場所で、ページ全体が入るように撮り直す**       |
| `ANALYSIS_TIMEOUT`   | SDK タイムアウト               | 時間がかかっている旨と再試行                           |
| `ANALYSIS_REFUSED`   | `stop_reason: "refusal"`       | 解析できない画像である旨。**内部の分類理由は出さない** |
| `STORAGE_FAILED`     | S3 失敗                        | 保存に失敗した旨と再試行                               |
| `UNAUTHORIZED`       | 未ログイン                     | ログインが必要                                         |
| `INVALID_IMAGE`      | 画像として読めない・壊れている | 壊れていないか確認して再試行                           |
| `INTERNAL_ERROR`     | **上記以外のすべて**           | 原因を明かさない固定文言。500                          |

**内部エラーの詳細を画面に出さない。** スタックトレース、APIキー、S3のバケット名などは `error.message` に載せない。仕組みは 5.5。

**`INTERNAL_ERROR` は `lib/errors.ts` に無い。** `AppError` を継承しない例外（外部ライブラリが投げたもの）に `errorResponse()` が付ける受け皿で、**中身を一切見ずに**固定文言を返す。Phase 1 の `Configuration` と同じ考え方（「クライアントに見せてよいエラー以外の受け皿」）。

---

# 8. テスト方針

**外部APIを叩くテストは書かない。** Claude API と S3 はモックする。

| 対象                      | 見るもの                                                             |
| ------------------------- | -------------------------------------------------------------------- |
| `lib/images/normalize.ts` | 長辺2576pxに収まる / 拡大されない / **`.rotate()` が呼ばれる**       |
| `lib/clients/claude.ts`   | `stop_reason: "refusal"` で投げる / `parsed_output` が null で投げる |
| Service                   | 解析失敗時に S3 を呼ばない（4.1 の順序の固定）                       |
| Route Handler             | **未ログインで401** / ボディの `userId` を無視する（Req7）           |
| `api-response.ts`         | 各エラーが期待する HTTP ステータスに変換される                       |
| S-03                      | 検証エラーの表示 / 段階表示が進む                                    |

**⚠️ Zod スキーマと Prisma の enum がずれると実行時に落ちる。** `Category` の3値が一致することをテストで固定する（Phase 1 のスキーマテストと同じ考え方）。

## 手動確認に回すもの

- 実際の料理本での読み取り精度
- 分類の妥当性
- 30秒の体感

---

# 9. 落とし穴の一覧

**着手前に書いているので、実装中に増える。**

| #   | 落とし穴                                                | 症状                                                                                          | 対処            |
| --- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------- |
| 1   | `temperature` を送る                                    | 400                                                                                           | 1.3             |
| 2   | `thinking` を省略して「OFFのつもり」になる              | Opus 5 は既定ON。トークンと時間が増える                                                       | 1.3             |
| 3   | `timeout` を秒で書く                                    | 既定10分のまま。Vercel上限に先に当たる                                                        | 1.4             |
| 4   | `sharp` の `.rotate()` を呼ばない                       | **解析結果も S3 の画像も横倒しになり、orientation タグも消えるので後から救えない**（✅ 実測） | 1.1 / 1.5 / 5.3 |
| 5   | 1568px でリサイズする                                   | 高解像度ティアの利点を捨てる                                                                  | 1.1             |
| 6   | `parsed_output` を null チェックせずに使う              | 実行時に undefined                                                                            | 1.2 / 5.1       |
| 7   | `stop_reason: "refusal"` を見ない                       | 拒否時に意味不明な例外                                                                        | 1.3             |
| 8   | JSON Schema に `additionalProperties: false` を書かない | スキーマが通らない                                                                            | 1.2             |
| 9   | S3 を解析より先に呼ぶ                                   | 解析失敗のたびに孤児画像が残る                                                                | 4.1             |
| 10  | ボディの `userId` を信用する                            | 他人のレシピを作れる                                                                          | 5.4             |
| 11  | 画像をテキストブロックの後に置く                        | 精度が落ちる                                                                                  | 5.1             |
| 12  | zod 3 を入れる                                          | `helpers/zod` は `zod/v4` を見るため書き味がずれる                                            | 1.7             |
| 13  | 「build が通ったから sharp は Vercel で動く」と考える   | import しなければバンドルされない。**通って当然**                                             | 1.5             |

## 9.1 環境側で踏んだもの（Phase 2 着手時に実際に踏んだ）

**リポジトリを新しくクローンした直後は、コードが正しくても検証コマンドが落ちる。** リモート実行環境（Claude Code on the web）は毎回まっさらなクローンから始まるので、セッションのたびに踏む。

| 症状                                                                   | 原因                                                                    | 対処                                                               |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `prisma generate` が `Cannot resolve environment variable: DIRECT_URL` | `.env` が無い（`.gitignore` 済みでクローンに含まれない）                | `.env.example` を写してダミー値の `.env` を作る                    |
| `tsc` が `@/generated/prisma/client` を解決できない                    | 上記で `prisma generate` が失敗し `generated/` が無い                   | `.env` を作ってから `npx prisma generate`                          |
| `tsc` が `Cannot find name 'LayoutProps'`                              | Next.js 16 が `.next/types` に生成する型。クローン直後は `.next` が無い | **`npm run build` を1回通す。** その後 `tsc --noEmit` が exit 0 に |

**この3つは連鎖する。** 上から順に解消しないと、下の症状だけ見て「コードが壊れている」と誤診する。

---

# 10. 受け入れの確認手順

**外から観測できる形で書く。** requirements.md の受け入れ基準と対応する。

| #   | 手順                                     | 期待される観測結果                             | Req  |
| --- | ---------------------------------------- | ---------------------------------------------- | ---- |
| 1   | 未ログインで `POST /api/recipes/analyze` | **401**、`{ success: false, error: {...} }`    | Req7 |
| 2   | 5〜10MB の写真を選ぶ                     | 送信サイズが1MB程度（DevTools のネットワーク） | Req1 |
| 3   | HEIC を選ぶ                              | 送信前に日本語のエラー                         | Req2 |
| 4   | 10MB超を直接POST                         | **413**                                        | Req2 |
| 5   | 料理本の写真を送る                       | 材料・分量・手順・タイトルが返る               | Req3 |
| 6   | 5 の直後に `prisma studio` を見る        | **確認画面を開く前に** Recipe が1件ある        | Req4 |
| 7   | 6 のレシピの `userId`                    | ログイン中のユーザーと一致                     | Req4 |
| 8   | 横向きに撮った写真を送る                 | S3 の画像が正立している                        | 4.2  |
| 9   | 解析中の画面                             | 表示が2回以上変わる                            | Req5 |
| 10  | レシピでない写真を送る                   | 撮り直しを促す日本語のメッセージ               | Req6 |
| 11  | ボディに他人の `userId` を入れて送る     | 自分のレシピとして作られる                     | Req7 |

---

# 11. リスクと対策

| リスク                              | 対策                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------- |
| **⚠️ `sharp` が Vercel で動かない** | 着手時に最優先で確認（1.5）。動かなければ代替を検討                     |
| 見開きページで小さい文字が潰れる    | `REQUIREMENTS.md` 5章の既知の検証事項。段階12で実測し、駄目なら分割送信 |
| 分類の線引きが実物と合わない        | 段階12でプロンプトを調整（5.2）                                         |
| 30秒を超える                        | `maxDuration = 60` と SDK timeout 50秒で二重に保険                      |
| effort `low` で精度が足りない       | 段階的に上げる。**コストと精度のトレードオフはユーザーに確認する**      |
| ⚠️ Vercel 本番での挙動は未確認      | デプロイ時に10章を本番でも実行する                                      |
