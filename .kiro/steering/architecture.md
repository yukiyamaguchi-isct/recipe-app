# Architecture Principles

> **ステータス: 確定（2026-08-13）**
> 変更する場合はユーザーの合意を取ること。

## ⚠️ Next.js 16 の破壊的変更

導入されたのは **Next.js 16.3.0**（当初の想定は15）。学習データの多くは15以前なので、**書く前に必ず確認すること**。一次情報は `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`。

| 変更                          | 内容                                                                                                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **リクエストAPIが非同期のみ** | `cookies()` `headers()` `draftMode()`、`layout.js` / `page.js` / `route.js` の `params`、`page.js` の `searchParams` は**すべて `await` が必要**。15にあった同期アクセスの互換は削除された   |
| **`middleware` → `proxy`**    | ファイル名は `proxy.ts`、エクスポートする関数名も `proxy`。**edge ランタイムは非対応**（`proxy` は nodejs 固定）。設定フラグも `skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize` に改名 |
| **Turbopack が既定**          | 明示的な有効化は不要                                                                                                                                                                         |
| 型ヘルパー                    | `npx next typegen` で `PageProps<'/path'>` `LayoutProps` `RouteContext` が生成される。手書きの型定義より優先して使う                                                                         |

```ts
// ❌ Next.js 15 までの書き方
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const id = params.id;
}

// ✅ Next.js 16
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
}
```

> **Phase 1 の注意**: Auth.js はルート保護に middleware を使う構成が一般的だが、Next.js 16 では `proxy` に改名され edge ランタイムも使えない。実装時に **Auth.js 側の Next.js 16 対応状況を公式ドキュメントで確認する**こと。

## レイヤ構成

Next.js に一本化するため、バックエンドは Route Handler を入口とする3層で構成する。

```
app/api/<route>/route.ts       … 入口。リクエスト検証とHTTPステータスへの変換のみ
  └→ lib/services/*.ts          … ビジネスロジック。ここがエラーを定義する
       └→ lib/repositories/*.ts … Prisma 経由のDB操作
            └→ Neon (PostgreSQL)
```

外部サービス（S3 / Claude API）へのアクセスは `lib/clients/` に置き、Service から呼ぶ。

- **Route Handler にビジネスロジックを書かない。** 検証して Service を呼び、結果を HTTP に変換するだけ
- **Service は HTTP を知らない。** `Response` や status code を扱わない
- **Repository は Prisma だけを知る。** ビジネスルールを持たない

## Server Actions ではなく Route Handlers を使う

画像を送る経路は **Route Handlers** に統一する。

理由: Server Actions は Next.js 側の `serverActions.bodySizeLimit` が**デフォルト1MB**で先に効くため、画像送信では引き上げ設定が必要になる。Route Handlers にはこの制限がなく、Vercel の 4.5MB 上限だけを考えればよい。

## API レスポンス形式

すべての Route Handler は以下の構造を返す。

```json
{ "success": true,  "data": { }, "error": null }
{ "success": false, "data": null, "error": { "code": "INVALID_IMAGE", "message": "..." } }
```

- `error.message` はユーザーにそのまま見せられる日本語にする
- `error.code` はクライアント側の分岐に使う機械可読な識別子

## エラー処理

- Service で型付きエラーを定義し、投げる（例: `ValidationError`, `ImageTooLargeError`, `AnalysisTimeoutError`）
- Route Handler でそれを HTTP ステータスへ変換する
- **例外を握り潰さない。** 空の catch は書かない
- 外部API（Claude / S3）の失敗は、そのまま500にせず原因が分かるコードに変換する

## 認証

- **Auth.js（NextAuth v5）+ Google provider**
- **session strategy は `jwt`。** 将来モバイルアプリから叩く際、Cookieベースだと作り直しになるため
- ユーザー固有のデータを返すエンドポイントは、必ずセッションから `userId` を取得する。**クライアントから渡された `userId` を信用しない**
- パスワードは保持しない（Googleに委譲）

## データベース

- `schema.prisma` が唯一の情報源
- マイグレーション: `npx prisma migrate dev`
- **接続URLは2本立てにする。** `DATABASE_URL` に Neon のプール接続、`DIRECT_URL` に直接接続。サーバーレス関数からのコネクション枯渇を避けるため
- **レシピは必ず `userId` でスコープする。** 他ユーザーのレシピを取得できる経路を作らない

## 画像解析の処理方式

**同期処理で実装する。ジョブキューによる非同期化は行わない。**

理由: Vercel Hobby の関数実行時間上限は Fluid compute 有効時で300秒あり、Claude API の10〜30秒に対して十分な余裕がある。非同期化は複雑さが割に合わない。

代わりに以下を入れる。

- Route Handler に `export const maxDuration = 60` を明示（暴走時の保険）
- Anthropic SDK に timeout を設定し、超過時は明確なエラーコードを返す
- クライアント側にローディング表示（段階表示）とタイムアウト時の再試行ボタン

## プロジェクト固有の決定

- **画像は必ず正規化してから保存・送信する。** クライアント（Canvas）とサーバー（sharp）の両方で長辺2576px / JPEG品質85（**1568px は Claude 4.6 以前の標準ティアの値。採用する Claude Opus 5 は高解像度ティアで 2576px**。`lib/images/constants.ts` の `MAX_EDGE_PX` が正）。sharp では `.rotate()` を必ず呼ぶ（EXIF回転を適用しないと写真が横倒しになる）
- **S3に置くのは変換後の画像のみ。** 元画像は保持しない
- **解析結果は確認画面を表示する前に保存する。** 確認画面での離脱により、APIコストと30秒を払った結果を失わせない
- **Claude への画像送信は1リクエスト1枚。** バッチ処理は行わない
- **ローカルファイルシステムに永続データを書かない。** Vercel の関数には永続的な書き込み可能ファイルシステムがなく、ローカルでは動いても本番で壊れる
