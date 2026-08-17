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
> | 残っている ⚠️                            | 潰すタイミング                                                |
> | ---------------------------------------- | ------------------------------------------------------------- |
> | ~~sharp が Vercel にバンドルされるか~~   | **✅ 段階3**（1.5）。ネイティブバイナリがトレース済み         |
> | ~~sharp が本番ビルドの実行時に動くか~~   | **✅ 2026-08-16**（1.5）。`next start` に実画像を通した       |
> | ~~ビジュアルデザインが未着手~~           | **✅ 2026-08-16 に受領**（6.2）                               |
> | ~~表示「最大30秒」と実装50秒の食い違い~~ | **✅ 2026-08-16 決着。実装50秒が正、文言を合わせる**（6.2.3） |
> | ~~`servings` がデータモデルに無い~~      | **✅ 2026-08-16 決着。Phase 2 で持つ**（6.2.4）               |
> | sharp が **Vercel 本番**で動くか         | 段階12（デプロイ時）。ローカルの本番ビルドまでは済んでいる    |
> | 関数サイズが Vercel の上限に収まるか     | 段階12（デプロイ時）。`@img` は45MB で余裕がある見込み（1.5） |
> | `effort: "low"` で精度が足りるか         | 段階12 の実測（1.3 / 5.2）                                    |
> | 材料3分類の線引きが実物と合うか          | 段階12 の実測（5.2）                                          |
> | `failOn: "warning"` が実写真を弾かないか | 段階12 の実測（5.3）                                          |
> | `imageUrl` にキーを入れるか              | Phase 3 の直前（5.6 / 6.2.5）                                 |

## 確定事項（蒸し返さない）

| 項目         | 決定                                             | 出どころ                         |
| ------------ | ------------------------------------------------ | -------------------------------- |
| 解析方式     | 同期処理。ジョブキューを入れない                 | `REQUIREMENTS.md` 7.1            |
| モデル       | **`claude-opus-5`**                              | 2026-08-15 ユーザー決定          |
| 画像の正規化 | 長辺2576px / JPEG品質85、クライアント＋サーバー  | `REQUIREMENTS.md` 4.2            |
| S3に置くもの | 変換後の画像のみ                                 | `REQUIREMENTS.md` 4.2            |
| 送信経路     | Route Handlers（Server Actions は使わない）      | `.kiro/steering/architecture.md` |
| ダークモード | **MVPでは不要**                                  | 2026-08-16 デザイン引き継ぎ資料  |
| タイムアウト | **実装の50秒が正。画面の文言をそちらに合わせる** | 2026-08-16 ユーザー決定（6.2.3） |
| `servings`   | **Phase 2 で持つ**                               | 2026-08-16 ユーザー決定（6.2.4） |

## ⚠️ 並行ブランチの統合（2026-08-16 決着）

**`feat/recipe-analysis` で同じ Phase 2 が並行して進んでいた。** `CLAUDE.md` の「実装は1セッションに保つ」に反する状態で、`tasks.md` が9段階と12段階の2種類、`design.md` の同じ節が別内容という衝突が出た。

**このブランチ（`claude/recipe-analysis-9hk507`）を正とする**（2026-08-16 ユーザー決定）。実装コード5ファイルとテスト111件はこちらにしかなく、移植コストが釣り合わないため。

**`feat/recipe-analysis` にしかなかった有用な発見は、この文書に取り込み済み**（すべてこちらの環境で裏取りした）。

| 取り込んだ内容                                | 反映先 |
| --------------------------------------------- | ------ |
| `sharp` は Next.js の外部化リストに入っている | 1.5    |
| `node_modules/@img` のサイズ実測（45MB）      | 1.5    |
| 本番ビルドを起動して実画像を通す検証          | 1.5    |

**`feat/recipe-analysis` はマージしない。** 取り込みは完了しているので、以後このブランチを参照しない。

> **両ブランチが独立に同じ落とし穴を踏んだ**（`_` 始まりディレクトリが Next.js の routing から除外される件）。**再現性のある罠**なので落とし穴表に残してある。

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

**effort は `low` から始める。** Opus 5 は `low` / `medium` が同世代比で強く、レシピの読み取りと3分類は極端に難しい推論ではない。**API の既定は `high` なので、これは明示的に下げている。⚠️ 実測で精度が足りなければ上げる**（段階12）。

**`stop_reason: "refusal"` を必ず見る。** Opus 5 は安全性分類器が働き、HTTP 200 のまま `content` が空で返ることがある。料理の写真で発火する見込みは低いが、`content[0]` を無条件に読むコードは壊れる。

### ⚠️ 訂正: `max_tokens` は 8000 では足りない（📄 出典: `claude-api` skill、段階4で発覚）

**初版の 5.1 は `max_tokens: 8000` としていたが、これは本文の長さだけを見た値だった。**

`max_tokens` は **thinking と本文の合計**に対する上限で、Opus 5 は thinking が既定でONになる。skill の推奨は「非ストリーミングは ~16000 を既定にし、安易に下げない」。**下げすぎると `stop_reason: "max_tokens"` で本文が途中で切れ、structured outputs のパースに失敗して `parsed_output` が null になる。**

**見分け方**: 解析が `ANALYSIS_FAILED` になったとき `stop_reason` を見る。`max_tokens` なら画像の問題ではなく上限の問題。実装では両者を別の `cause` で投げ分けてある。

### ⚠️ `thinking` を切ってはいけない（📄 出典: `claude-api` skill）

`thinking: {type:"disabled"}` は effort `high` 以下なら400にはならないが、**Opus 5 で切ると別の不具合が2つ出る。**

| 症状                                          | 何が起きるか                                                   |
| --------------------------------------------- | -------------------------------------------------------------- |
| tool 呼び出しが**本文テキストとして**出る     | ターンは正常終了し、呼び出しは実行されない。**エラーも出ない** |
| `<thinking>` タグが**画面向けの本文に漏れる** | ユーザーに内部タグが見える                                     |

コストとレイテンシを下げたいなら **`thinking` を切るのではなく `effort` を下げる**のが正しい手段。**このフェーズでは `thinking` を一切指定しない**（既定のONのまま使う）。

### `stop_details` で分岐しない（📄 出典: `claude-api` skill）

`stop_details` は `stop_reason === "refusal"` のときだけ入る補助情報で、**拒否であっても `null` になりうる**。分岐は必ず `stop_reason` で行い、`stop_details` は原因調査（`cause`）にだけ使う。

## 1.4 SDK のタイムアウトは**ミリ秒**（📄 出典: `claude-api` skill）

**TypeScript SDK の `timeout` はミリ秒。** Python / Ruby は秒で、取り違えやすい。既定は10分で、これは Vercel の関数上限を超える。

```ts
new Anthropic({ timeout: 50_000 }); // 50秒。maxDuration=60 の内側に収める
```

`maxRetries` の既定は2。**タイムアウトもリトライ対象**なので、最悪 `timeout × 3` の時間がかかる。`maxRetries: 0` にして、リトライはユーザーの再試行に委ねる。

## 1.5 `sharp` の挙動とバンドル（✅ 実測 2026-08-15）／本番実行時のみ ⚠️ 未検証

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

### Vercel へのバンドルは確認済み（✅ 実測 2026-08-15、段階3）

**判定方法が要点。** 「`npm run build` が成功した」では**何も確かめたことにならない**。Next.js は**ルートから到達できるモジュールしかバンドルしない**ため、`lib/images/normalize.ts` を置いただけの状態ではビルドが通って当然だった（実際、`.next` を検索しても `sharp` は出てこなかった）。

そこで**使い捨ての Route Handler**（`app/api/sharp-probe/route.ts`）を一時的に置いて `normalizeImage` を import させ、ビルド出力を検査した。**確認後に削除済み。**

結果、Next.js のファイルトレース（`route.js.nft.json`）に**ネイティブバイナリが含まれていた**。

```
@img/sharp-linux-x64/lib/sharp-linux-x64-0.35.3.node
@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.18.3
@img/sharp-linuxmusl-x64/lib/sharp-linuxmusl-x64-0.35.3.node
@img/sharp-wasm32/lib/sharp-wasm32-0.35.3.node
```

**nft のトレースが、Vercel が関数に同梱するファイルを決めている。** ここに `.node` と `libvips-cpp.so` が載っている以上、**最も恐れていた失敗（本番で `Cannot find module sharp` になる）は起きない。** glibc 版と musl 版の両方が追跡されている。

**再現手順**: `npm run build` の後に
`cat .next/server/app/api/recipes/analyze/route.js.nft.json | tr ',' '\n' | grep '\.node'`。
ここが空なら sharp は同梱されていない。

> **✅ 段階8で、使い捨てではない実コードから確認できた。** `POST /api/recipes/analyze` が
> Service → `normalizeImage` 経由で sharp に到達するため、**本番の構成そのままで**
> `sharp-linux-x64-0.35.3.node` がトレースされている。段階3の probe による確認と同じ結果。

### 本番ビルドを起動して実際に動かした（✅ 実測 2026-08-16）

トレースだけでは「同梱される」ことしか言えないので、**本番サーバーを起動して実画像を通した。**

```
npm run build && npm run start
curl -X POST http://localhost:3000/api/sharp-probe --data-binary @probe.jpg
→ {"success":true,"data":{"bytes":29487},"error":null}
```

入力は 4000×3000 / EXIF `orientation: 6` の JPEG（71,453 bytes）。**出力 29,487 bytes。開発サーバーではなく `next start` の本番ビルドで、sharp のネイティブバイナリが実際にロードされて JPEG を生成した。**（probe ルートは確認後に削除済み。寸法は probe が返していないので、回転の正しさは 5.3 の単体テストが担保する）

### `serverExternalPackages` の設定は要らない（📄 出典 2026-08-16）

**`sharp` は Next.js が既定で外部化するパッケージの一覧に入っている。**

```
node_modules/next/dist/lib/server-external-packages.jsonc の88行目: "sharp",
```

`next.config.ts` に `serverExternalPackages: ["sharp"]` を書く必要はない。ネイティブの `require` で解決されるため、**バイナリがバンドルに巻き込まれて壊れることもない。** 「動かないのでは」と設定を足したくなるが、**推測で設定ファイルを触らない**（`CLAUDE.md` の Conventions）。

### 関数サイズ（✅ 実測 2026-08-16）

| 対象                     | サイズ |
| ------------------------ | ------ |
| `node_modules/sharp`     | 1.4MB  |
| `node_modules/@img` 全体 | 45MB   |

**Vercel の関数サイズ上限（展開後250MB）に対しては余裕がある。** ただし実際に同梱されるのはトレースされたものだけで、`@img` 全体が載るわけではない。**⚠️ 本番の実サイズはデプロイ時に確認する。**

> **⚠️ Vercel 上で動かしたわけではない。** ここまでで確認できたのは「ローカルの本番ビルドで動く」「同梱対象としてトレースされる」の2点。**リスクの大部分は消えたが、ゼロではない**（段階12）。

動かなかった場合の代替は変えていない。

- WASM 版の画像処理ライブラリに切り替える（`@img/sharp-wasm32` もトレースされているため、切り替え先の候補として現実的）
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
  max_tokens: 16000, // ⚠️ thinking と本文の合計に対する上限。8000 では足りない（1.3 の訂正）
  output_config: {
    effort: "low", // ⚠️ 精度が足りなければ上げる。API の既定は "high"
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

### 定数は `lib/images/constants.ts` に置く（実装で追加）

長辺・品質・上限バイト数は**クライアントとサーバーの両方が読む**。`normalize.ts` に置くと、クライアント側から import した瞬間に **sharp がブラウザ向けバンドルに混入する**。だから sharp を import しない別ファイルに切り出した。

### 形式は宣言された MIME ではなく先頭バイトで判定する（実装で決定）

`Content-Type: image/jpeg` と書いて HEIC を送るのは開発者ツールから簡単にできる。**実データの先頭バイトだけを根拠にする。**

| 形式   | 判定に使うバイト                                          | 扱い                     |
| ------ | --------------------------------------------------------- | ------------------------ |
| JPEG   | `FF D8 FF`                                                | 通す                     |
| PNG    | `89 50 4E 47 0D 0A 1A 0A`                                 | 通す                     |
| HEIF   | 4〜8バイト目が `ftyp`、8〜12バイト目が `heic` / `mif1` 等 | `UnsupportedFormatError` |
| その他 | 上記以外（GIF / WebP を含む）                             | `UnsupportedFormatError` |

**GIF / WebP は Claude API 自体は読めるが弾く**（requirements.md Req2 が JPEG / PNG のみと定めているため）。

**エラーの投げ分け**: 形式が JPEG / PNG と判定できたのに sharp が読めなかった場合だけ `InvalidImageError`。「対応していない形式」と「壊れている」は、ユーザーの次の行動が違うので混ぜない。

### `failOn` は既定の `"warning"` のままにする（📄 出典: `sharp/lib/index.d.ts` L992-996）

sharp の型定義に **「信頼できない入力には既定の `warning` レベルを使え」** と明記されている。アップロードされた画像はまさに信頼できない入力なので緩めない。`limitInputPixels` の既定（268402689px）も展開爆弾への防御なのでそのまま。

> **⚠️ 副作用として、軽微な破損のある実写真も弾かれる可能性がある。** 段階12 の実測で、実際の料理本の写真が `InvalidImageError` になるようなら、`failOn: "error"` への緩和を検討する。**その判断はユーザーに確認してから行う**（セキュリティと利便性のトレードオフのため）。

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

### ⚠️ `proxy.ts` の matcher が `api` を除外していることに依存している（✅ 実測 2026-08-16）

`proxy.ts` の matcher は `"/((?!api|_next/static|_next/image|favicon.ico).*)"`。**`api` を除外しているので `/api/recipes/analyze` は proxy を通らない。**

これは元々「Auth.js 自身の `/api/auth/*` を通すため」の除外だが、**結果としてこのエンドポイントの挙動を決めている。**

| matcher              | 未ログインでの応答                           |
| -------------------- | -------------------------------------------- |
| `api` を除外（現状） | **401 + `{ success: false, error: {...} }`** |
| `api` も対象にすると | `/login` への **307 リダイレクト**           |

**requirements.md Req7 が求めているのは 401。** matcher に `api` を含める変更を入れると、**テストは通るのに実機では 307 が返る**という食い違いが生まれる（ユニットテストは Route Handler を直接呼ぶため proxy を経由しない）。

**見分け方**: 未ログインで `curl -i -X POST /api/recipes/analyze` して `HTTP/1.1 401` であること。`307` なら matcher が変わっている。

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

## 5.6 S3 のオブジェクトキー（段階5で決定）

形は **`<userId>/<ランダム>.jpg`**。2つの性質を同時に満たす必要がある。

| 性質                                       | 何のためか                                                       |
| ------------------------------------------ | ---------------------------------------------------------------- |
| **ユーザーごとにプレフィックスが分かれる** | 誰の画像か分かる。IAM でプレフィックス単位の制限をかけられる     |
| **ファイル名が推測できない**               | キーの形を知られても、連番やレシピIDから他人の画像を当てられない |

ランダム部分は Node 組み込みの **`crypto.randomUUID()`**（122bit）。`schema.prisma` は `cuid()` を使っているが、**キー生成に使える cuid 関数は Prisma の生成物から取れず、専用ライブラリを足しても得られる性質は同じ**なので、依存を増やさない選択をした。

**`userId` は正規表現で検証してから連結する。** セッション由来なので通常は安全だが、ここが崩れると `../` でバケット内の別プレフィックスに書ける。**起きたらバグなので、ユーザー向けエラーではなく素の例外にする**（`INTERNAL_ERROR` として 500 になる）。

**見分け方**: `buildImageKey("../victim")` が例外を投げること。キーが返ってきたら防御が外れている。

**`ACL` は指定しない。** バケット側の非公開設定に従う。`public-read` を付けると、**URLを知る誰でも他人のレシピ写真を見られる**。

### ⚠️ 未決: `Recipe.imageUrl` に何を入れるか（Phase 3 の直前に決める）

`uploadRecipeImage()` が返すのは **オブジェクトキーであってURLではない**。バケットが非公開である以上、表示用のURLは参照時に署名付きで発行することになる（有効期限があるため、DBに保存しても意味がない）。

したがって `Recipe.imageUrl` には**キーを入れる**ことになるが、**カラム名と中身が食い違う**。選択肢は3つ。

| 案                                  | 影響                                                    |
| ----------------------------------- | ------------------------------------------------------- |
| キーをそのまま `imageUrl` に入れる  | マイグレーション不要。名前が実態と合わない              |
| `imageKey` にリネームする           | マイグレーションが1本増える。名前は正確になる           |
| バケットを公開にして公開URLを入れる | **採らない。** レシピ写真は個人のものなので非公開が前提 |

**段階6（保存）では1案で進め、Phase 3 で表示を作る直前にユーザーへ確認する。** 署名付きURLの発行は Phase 3 のスコープ。

---

# 6. 画面: S-03 アップロード / 解析中（`UI_DESIGN.md`）

**ビジュアルデザインは 2026-08-16 に到着した**（`Design_引き継ぎ資料/design_handoff_recipe_design_system/`）。**見た目は 6.2 が正。** ここでは構造と挙動を先に決める。

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

**✅ デザイン側の3段階と一致していた**（6.2）。段階名も「アップロード中 → 文字を読み取り中 → 材料を仕分け中」で同一。

---

# 6.2 ビジュアル仕様（📄 出典: `Design_引き継ぎ資料/design_handoff_recipe_design_system/README.md`、2026-08-16 受領）

Claude Design から受け取った確定仕様。**`CLAUDE.md` は「合流は Phase 3 の直前」としていたが、資料が先に届いたため段階10（S-03の実装）から使える。**

- **正は `Recipe Design System v2.dc.html`。** 同梱の `Recipe Design System.dc.html`（緑基調）は履歴で、**実装に使わない**
- HTML は**デザインリファレンスであって本番コードではない。** Tailwind CSS v4 + React 19 の規約で再現する
- **hifi（ピクセル精度）。** 色・書体・余白・角丸・影・状態はすべて確定値

## 6.2.1 Phase 2 に効く確定事項

| 項目                     | 確定内容                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **ダークモード**         | **MVPでは不要**（明るいキッチンでの利用が中心）。`DESIGN_BRIEF.md` の食い違いは解消                                         |
| トークンの置き場         | Tailwind v4 の `@theme`。README の CSS をそのまま使える                                                                     |
| 本文の最小サイズ         | **17px**（`--text-body`）。30〜50cm 離れて読むため                                                                          |
| タップ領域               | 最小 **48×48px**、主要ボタン **56px**、隣接間隔 8px 以上                                                                    |
| コントラスト             | **4.5:1 以上**（実測は全て 5.6:1 以上）                                                                                     |
| フォント                 | Noto Sans JP（400/500/700）                                                                                                 |
| アイコン                 | テキストグリフのみ（← ↓ ✎ ＋ ✓ ×）。**有料素材を使わない**                                                                  |
| 将来の React Native 移植 | `border` / `border-radius` / `box-shadow` / `flex` / `grid` だけで組む。**グラデーションや `backdrop-filter` に依存しない** |

**`#00C6D7`（accent）の上に文字を置かない。** 白文字 2.1:1 / 濃色 4.2:1 でどちらも不足する。進捗バー・完了マーク・ブランドマークなど**非文字要素専用**。

## 6.2.2 S-03 の視覚仕様

padding 24px / gap 28px / 背景 `#FFFFFF`。上から順に:

1. `← 中止`（面なし・48px）
2. 撮影写真プレビュー（aspect 4/3、角丸12px）
3. 見出し「読み取り中（最大30秒）」22px 700
4. 3段階の進捗
5. 最下部にバー（`margin-top: auto`）

**3段階の丸の状態**（各32px）:

| 状態   | 見た目                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------ |
| 完了   | 面 `#00C6D7` ＋ 白の ✓、ラベル 17px `#4A6570`                                                                      |
| 進行中 | 枠3px `#00C6D7`（面は透明）、ラベル **19px/700 `#0B2D39`**、`opacity .55→1` の 1.4s ease-in-out 無限アニメーション |
| 未着手 | 枠2px `#C8E4E8`、ラベル 17px `#8AA3AB`                                                                             |

**下部のバー**: 高さ8px / 角丸999px / トラック `#DFF1F3` / フィル `#00C6D7`（幅 = 進捗%）。

**エラー表示**（段階11で使う）: 面 `#FDECEA` / 枠 1px `#E3AEAA` / 角丸12px / padding 18px 20px。見出し 19px 700 `#8C1D18`、本文 17px line-height 1.8 `#5F1B16`、危険ボタン（面 `#B3261E` ＋ 白文字 17px 700、48px）。

**ボタンのラベルは体言止め・最大8文字**（「撮り直す」「やめる」など）。

## 6.2.3 ⚠️ 食い違い1: 「最大30秒」と実装のタイムアウトが合っていない

**デザインは「読み取り中（最大30秒）」と画面に表示し、「最大30秒でタイムアウト → エラー表示（撮り直す）」と定義している。**

一方この設計の実装値は 1.4 のとおり **SDK timeout 50秒 / `maxDuration` 60秒**。**画面に30秒と書いておいて50秒待たせることになる。**

| 案                                           | 影響                                                                       |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| **A. 実装を30秒に合わせる**                  | 表示と実態が一致する。**30秒を超える解析は成功していても打ち切る**         |
| **B. 表示を実装に合わせる**（「最大1分」等） | 打ち切りが減る。デザインの文言を変えることになる                           |
| **C. 表示は30秒のまま、内部は50秒**          | **採らない。** ユーザーに嘘をつく形になり、Req6 の「原因が分かる」に反する |

**どちらを採るかはユーザーに確認する。** 段階12 で実際の所要時間を測ってから決めるのが妥当だが、**段階11（進捗表示）の実装前には決まっている必要がある。**

## 6.2.4 `servings`（何人分）を追加する（✅ 2026-08-16 決着）

**決定: `Recipe.servings Int?` を Phase 2 で持つ**（A案）。型は**数値**（ユーザー決定）。

```prisma
model Recipe {
  // ...
  servings Int?
}
```

**`Int?`（nullable）にする理由。** 実際のレシピには「2〜3人分」のように幅のある表記や、人数がそもそも書かれていないものがある。**数値1つに落とせないものは `null` にして、見出しから人数を省く。**

Claude 側のスキーマも `z.number().int().nullable()` で対になっている。**`type: "integer"` として JSON Schema に出ることを確認済み**（1.2 の「数値制約は使えない」に抵触しない。使えないのは `minimum` / `maximum` であって型指定ではない）。

**丸めの禁止はプロンプトでしか担保できない。** スキーマは「整数か null」しか保証しないので、**「2〜3人分」を勝手に 2 や 3 にしない**ことはプロンプトの指示に依存する。指示が消えていないことをテストで固定してある（`__tests__/claude-client.test.ts`）。

**Prisma と Zod のズレも固定した。** `Prisma.RecipeScalarFieldEnum` の列一覧をテストで比較している（`__tests__/schema.test.ts`）。片方だけ変えても型では捕まらないため。

> **⚠️ マイグレーションはローカルでしか作れない。** `npx prisma migrate dev` は DB に接続する。Phase 1 の `add_auth_account` と同じ構図で、**生成された `prisma/migrations/` をコミットに含める**必要がある。

### 経緯（元の食い違い）

デザインは S-04 に **「材料（4人分）」** という見出しを置き、State Management にも `recipe.servings` がある。

**しかし `schema.prisma` にも `REQUIREMENTS.md` にも `UI_DESIGN.md` にも人数のフィールドは無い。** 対応するには3つとも変更が要る。

| 案                              | 影響                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| **A. `Recipe.servings` を足す** | マイグレーション1本 ＋ Claude のスキーマに `servings` を追加。**Phase 2 のスコープが増える** |
| **B. Phase 3 以降に送る**       | 見出しは「材料」だけにする。デザインとの差は Phase 3 で埋める                                |
| **C. 恒久的に持たない**         | デザインの見出しを変更してもらう                                                             |

**A を採った**（2026-08-16）。`REQUIREMENTS.md` と `UI_DESIGN.md` は人数に触れていないままなので、**フェーズ完了時に追記する**（tasks.md の「フェーズ完了時」を参照）。

## 6.2.5 その他、後続フェーズへの申し送り

- **State Management の命名がデータモデルとずれている。** デザインは `qty`、`schema.prisma` は `amount`。**DB は `amount` が正**（`.kiro/specs/foundation/design.md` の決定）。UI 側の変数名で吸収する
- **`recipes[]` に `thumbnailUrl` がある。** 5.6 の「`imageUrl` にキーを入れるか」の判断と直結する。**Phase 3 の表示を作る前にまとめて決める**
- **確認モード（S-04c）の視覚仕様も確定済み** — 上部バナー（面 `#FDEEDA` / 下境界 `#F7B267` /「確認画面 — 内容をチェック」）＋ 最下部固定バー（[この内容で決定] → [編集する] の縦並び）。Phase 3 で使う
- **「移動 / 操作 / 絞り込み」を面の有無で描き分ける**のがこのデザインの中核ルール。**この3種以外の見た目をヘッダー・タブに足さない**

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
| 14  | `max_tokens` を本文の長さだけで見積もる                 | thinking と合算されるため出力が途中で切れ、パースに失敗する                                   | 1.3             |
| 15  | コスト削減のつもりで `thinking` を切る                  | tool 呼び出しが本文テキストとして出る／`<thinking>` が漏れる。**下げるなら effort**           | 1.3             |
| 16  | `stop_details` の有無で拒否を判定する                   | 拒否でも `null` になりうるため取りこぼす                                                      | 1.3             |
| 17  | Zod の enum を文字列で並べ直す                          | `schema.prisma` とズレても保存の段階まで気づけない                                            | 5.1             |
| 18  | `#00C6D7` の上に文字を置く                              | 白文字 2.1:1 / 濃色 4.2:1 でどちらもコントラスト不足                                          | 6.2.1           |
| 19  | 画面に「最大30秒」と出しつつ50秒待たせる                | ユーザーに嘘をつく形になる。**先に方針を決める**                                              | 6.2.3           |
| 20  | 旧版の緑基調 `Recipe Design System.dc.html` を参照する  | 履歴として同梱されているだけ。**正は v2**                                                     | 6.2             |
| 21  | デザインHTMLをそのままコードに写す                      | あれはリファレンス。Tailwind v4 + React 19 の規約で組み直す                                   | 6.2             |
| 22  | Route Handler のテストを jsdom で走らせる               | `formData()` の File が壊れ、実装が悪いように見える                                           | 9.3             |
| 23  | `formData()` の戻りを `instanceof File` で判定する      | 実行環境によって `false` になる。**文字列かどうかで見る**                                     | 9.3             |
| 24  | `proxy.ts` の matcher に `api` を含める                 | 未ログインで 401 ではなく 307 が返る。**ユニットテストは通る**                                | 5.4             |

## 9.1 環境側で踏んだもの（Phase 2 着手時に実際に踏んだ）

**リポジトリを新しくクローンした直後は、コードが正しくても検証コマンドが落ちる。** リモート実行環境（Claude Code on the web）は毎回まっさらなクローンから始まるので、セッションのたびに踏む。

| 症状                                                                   | 原因                                                                    | 対処                                                               |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `prisma generate` が `Cannot resolve environment variable: DIRECT_URL` | `.env` が無い（`.gitignore` 済みでクローンに含まれない）                | `.env.example` を写してダミー値の `.env` を作る                    |
| `tsc` が `@/generated/prisma/client` を解決できない                    | 上記で `prisma generate` が失敗し `generated/` が無い                   | `.env` を作ってから `npx prisma generate`                          |
| `tsc` が `Cannot find name 'LayoutProps'`                              | Next.js 16 が `.next/types` に生成する型。クローン直後は `.next` が無い | **`npm run build` を1回通す。** その後 `tsc --noEmit` が exit 0 に |

**この3つは連鎖する。** 上から順に解消しないと、下の症状だけ見て「コードが壊れている」と誤診する。

## 9.2 外部から持ち込んだ資料は lint / format から外す（✅ 実測 2026-08-16）

デザイン引き継ぎ資料をリポジトリに取り込んだ直後、**自分のコードを1行も触っていないのに `npm run format` と `npm run lint` が落ちた。**

| コマンド         | 原因                                                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `npm run format` | 同梱の `.dc.html` を Prettier のHTMLパーサが解釈できない（`Unexpected closing tag "div"`）。**終了コード2**                   |
| `npm run lint`   | 同梱の `support.js`（プロトタイプ用のバンドル済みスクリプト）が `ReactDOM.render` などを含む。`--max-warnings 0` なので落ちる |

`.prettierignore` と `eslint.config.mjs` の `globalIgnores` に追加して解消した。**どちらにも「外部から持ち込んだ参照資料」の前例があった**ので、同じ形に揃えてある。

> **`CLAUDE.md` の「lint / format の設定ファイルを推測で変更しない」に反しない。** あの規則が禁じているのは「競合するはず」という思い込みで設定を足すこと。ここでは**実際にコマンドを走らせて失敗を確認してから**追加している。

### ⚠️ さらに: Prettier は資料そのものを書き換えた

除外する前の `npm run format` は、**エラーを出しつつ `README.md` と一部の `.dc.html` を整形して保存していた。** 受け取った原文が変わってしまうため、`git checkout` で戻した。**外部資料を取り込んだら、コードを触る前に先に除外設定を入れる。**

**`.prettierignore` は gitignore 構文。** パスを `"..."` で囲むと引用符ごと1つのパターンとして扱われ、**除外が効かないまま `format` が成功したように見える**（実際には資料が書き換わり続ける）。囲まずに `Design_引き継ぎ資料/` と書く。

## 9.3 Route Handler のテストは node 環境で走らせる（✅ 実測 2026-08-16、段階8）

`vitest.config.mts` の `environment` は **jsdom**（React の描画テストに DOM が要るため）。だが **Route Handler のテストを jsdom で走らせると `multipart/form-data` が壊れる。**

| 症状                              | 実際に起きたこと                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `file instanceof File` が `false` | `formData()` が返すのは **undici の File**。jsdom のグローバル `File` とは別物                        |
| 画像の中身が化ける                | jsdom の `File` を `FormData` に入れて読み直すと、バイト列が `[117,110,100,101,…]`（`"unde…"`）になる |

**どちらも「実装が間違っている」ように見えるが、環境の食い違い。** 12件のテストが 400 を返して落ち、原因を実装側に探すと時間を溶かす。

**対処は2つとも入れてある。**

1. **テストファイルの先頭に `// @vitest-environment node`。** Route Handler に DOM は要らない
2. **実装側で `instanceof File` を使わない。** 仕様上 `FormData.get()` の戻りは `string | File` なので、**文字列でなければファイル**と判定する。環境をまたいでも壊れない

```ts
// ❌ 環境によって false になる
if (!(file instanceof File)) throw new InvalidImageError();

// ✅ 仕様どおり
if (file === null || typeof file === "string") throw new InvalidImageError();
```

**見分け方**: `formData()` から取った値の `constructor.name` が `File` なのに `instanceof File` が `false` なら、この食い違い。

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
