# Technology Stack

> **ステータス: 確定（2026-08-13）**
> 変更する場合はユーザーの合意を取ること。

## Frontend

- Framework: Next.js 16（App Router）+ TypeScript
- UI: Tailwind CSS
- 状態管理: React の標準機能（useState / Server Components）。専用ライブラリは必要になるまで入れない
- 画像リサイズ: Canvas API（ブラウザ標準・ライブラリ不要）

## Backend

- Runtime: Node.js 20+
- API: **Next.js Route Handlers**（`app/api/`）— フロントと同一プロジェクト
- Database: **Neon**（PostgreSQL, Free プラン）
- ORM: **Prisma 7**（+ ドライバアダプタ `@prisma/adapter-pg`）
  - Prisma 7 は接続URLをスキーマに書けず、CLI用（`prisma.config.ts`）と実行時用（アダプタ）で指定箇所が分かれる。詳細は `.kiro/specs/foundation/design.md`
- 認証: **Auth.js（NextAuth v5）+ Google provider**
- 画像処理: sharp（サーバー側の正規化・EXIF回転）
- 画像ストレージ: AWS S3（`@aws-sdk/client-s3`）
- 画像解析: Anthropic Claude API（`@anthropic-ai/sdk`、vision対応モデル）

## Hosting

- **Vercel Hobby**

## Development

- Build: Next.js 標準（Turbopack）
- Test: Vitest + React Testing Library
- Lint / Format: ESLint + Prettier
- Version Control: Git（GitHub: `yukiyamaguchi-isct/recipe-app`, private）

---

## 決定事項と理由

| 決定                                          | 理由                                                                                                                                                 |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js に一本化（別Expressを立てない）       | 個人開発で管理対象を増やさない。Route Handlers で十分                                                                                                |
| 認証は Google アカウント                      | パスワードを保持しないため安全。リセット機能も不要になり実装が減る                                                                                   |
| **session strategy は `jwt`**                 | 将来モバイルアプリから叩く際、Cookieベースだと作り直しになるため初期設計時点でJWTにする                                                              |
| DB は Neon 一本（ローカルDockerを併用しない） | Vercelのサーバーレス関数はコネクション枯渇が起きやすく、Neonのプール接続前提で書く必要がある。ローカルを素のPostgreSQLにすると本番で初めて問題が出る |
| 画像ストレージは最初から S3                   | Vercelの関数には永続的な書き込み可能ファイルシステムがない。ローカルファイル保存では本番で壊れる                                                     |
| 状態管理ライブラリなし                        | MVPの画面数と状態量では過剰。必要になってから入れる                                                                                                  |

---

## Vercel Hobby の制約（2026-08-13 時点、公式ドキュメントで確認済み）

実装方針を左右する数値。**これ以外の制限値・料金が必要になったら記憶で答えず公式ドキュメントを確認し、出典付きで示すこと**（各サービスの料金・制限は改定される）。

| 項目                                    | 値                              | 実装への影響                                                                                               |
| --------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| リクエスト/レスポンスボディ上限         | **4.5MB**                       | クライアントで長辺1568px・品質85にリサイズ済み（約300KB/枚）のため余裕がある                               |
| 関数実行時間上限（Fluid compute有効時） | **デフォルト300秒 / 最大300秒** | Claude APIの10〜30秒は問題なく収まる                                                                       |
| Active CPU 無料枠                       | 4時間                           | I/O待ち（AI API呼び出し・DBクエリの待機）は**課金対象外**                                                  |
| Provisioned Memory 無料枠               | 360 GB-hrs                      | 個人利用の規模では十分                                                                                     |
| 呼び出し回数 無料枠                     | 100万回                         | 同上                                                                                                       |
| 利用条件                                | **非商用・個人利用限定**        | 決済・広告・アフィリエイト・寄付募集は不可。収益化する場合は Pro（$20/月）へ変更するだけでコード変更は不要 |

> 「Hobbyは10秒/最大60秒」という情報は **2025年4月23日以前かつ Fluid compute 未使用**のプロジェクトの値。新規プロジェクトは Fluid compute がデフォルトで有効なため該当しない。

---

## 必要な外部サービス

| サービス             | 必要フェーズ | 用途                                | 費用                                |
| -------------------- | ------------ | ----------------------------------- | ----------------------------------- |
| GitHub               | 済           | ソース管理                          | 無料                                |
| Neon                 | Phase 0      | PostgreSQL                          | Free プラン                         |
| Google Cloud Console | Phase 1      | OAuth クライアントID / シークレット | 無料                                |
| Anthropic API        | Phase 2      | 画像解析                            | 従量課金（月100回想定で200〜500円） |
| AWS S3               | Phase 2      | 画像保存                            | 従量課金（極小）                    |
| Vercel               | デプロイ時   | ホスティング                        | Hobby 無料                          |

**Google OAuth のリダイレクトURI**は、ローカル用 `http://localhost:3000/api/auth/callback/google` と本番用（Vercelのドメイン）の**両方**を Google Cloud Console に登録する。

**Anthropic API はモックで代替できる。** Phase 3（表示画面）の作業中は固定JSONを返すモックを用意し、毎回本物のAPIを叩かない。

---

## 環境変数

`.env`（gitignore済み）に置く。コードに直書きしない。

```
DATABASE_URL=          # Neon プール接続（アプリから使う）
DIRECT_URL=            # Neon 直接接続（Prisma migrate 用）
AUTH_SECRET=           # Auth.js のセッション署名鍵
AUTH_GOOGLE_ID=        # Google OAuth クライアントID
AUTH_GOOGLE_SECRET=    # Google OAuth クライアントシークレット
ANTHROPIC_API_KEY=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
S3_BUCKET_NAME=
```

---

## 未確定事項

- Claude のモデルID: 実装時に `claude-api` skill か公式ドキュメントで確認して確定する（記憶で書かない）
