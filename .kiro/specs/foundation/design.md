# foundation（Phase 0）の設計書

## 概要

`create-next-app` で雛形を作り、Prisma を Neon に繋ぎ、開発ツールを整える。アプリのコードはまだ書かない。

## ディレクトリ構成

`.kiro/steering/architecture.md` の3層構成に対応する空の入れ物を用意する。中身は後続フェーズで埋める。

```
recipe-app/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   └── api/                  # Route Handlers（Phase 1以降）
├── lib/
│   ├── services/             # ビジネスロジック（空）
│   ├── repositories/         # Prisma経由のDB操作（空）
│   ├── clients/              # S3 / Claude API（空）
│   ├── errors.ts             # 型付きエラーの定義
│   └── prisma.ts             # PrismaClient のシングルトン
├── prisma/
│   └── schema.prisma
├── .env                      # git管理外
├── .env.example
├── next.config.ts
├── tailwind.config.ts
├── vitest.config.ts
└── package.json
```

## PrismaClient のシングルトン

Next.js の開発サーバーはホットリロードのたびにモジュールを再評価するため、`new PrismaClient()` を素直に書くとコネクションが増え続ける。グローバルに1つだけ保持する形にする。

```ts
// lib/prisma.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

## Prisma スキーマ（初期）

`REQUIREMENTS.md` 8章のデータモデルに基づく。Auth.js が要求するモデルは Phase 1 で追加するため、この段階では**アプリ固有のモデルのみ**を定義する。

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")   // Neon プール接続（アプリから使う）
  directUrl = env("DIRECT_URL")     // Neon 直接接続（migrate 用）
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  image     String?
  createdAt DateTime @default(now())
  recipes   Recipe[]
}

model Recipe {
  id          String       @id @default(cuid())
  userId      String
  title       String
  imageUrl    String
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  user        User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  ingredients Ingredient[]
  steps       Step[]

  @@index([userId])
}

model Ingredient {
  id       String   @id @default(cuid())
  recipeId String
  name     String              // 例: 玉ねぎ
  amount   String?             // 例: 200g（単位込みの文字列。解析結果をそのまま保持）
  category Category
  order    Int
  recipe   Recipe   @relation(fields: [recipeId], references: [id], onDelete: Cascade)

  @@index([recipeId])
}

model Step {
  id       String @id @default(cuid())
  recipeId String
  order    Int
  text     String
  recipe   Recipe @relation(fields: [recipeId], references: [id], onDelete: Cascade)

  @@index([recipeId])
}

enum Category {
  SEASONING   // 調味料
  VEGETABLE   // 野菜
  OTHER       // その他
}
```

### スキーマ上の決定と理由

| 決定 | 理由 |
|---|---|
| `amount` を数値と単位に分けず1つの文字列にする | MVPでは分量を計算しない。「少々」「適量」「1/2個」など数値化できない表記が実際のレシピに多い。単位変換（後続フェーズ）を実装する段階で分割を検討する |
| `category` を enum にする | 3種類に固定されており、文字列だと表記ゆれが入る |
| `order` を持たせる | 材料も手順も、レシピ上の並び順に意味がある。DBの取得順に依存させない |
| `onDelete: Cascade` | レシピを削除したら材料・手順も消える。孤児レコードを残さない |
| `User` を今の段階で定義する | `Recipe.userId` の外部キーに必要。Auth.js のモデルとの整合は Phase 1 で取る |

> **Phase 1 での注意**: Auth.js の Prisma アダプタは `User` に特定のフィールドを要求する。ここで定義した `User` と衝突する可能性があるため、Phase 1 では**公式ドキュメントで必要なスキーマを確認してから**マージする。記憶で書かない。

## 環境変数

`.env.example`（コミットする）と `.env`（コミットしない）を用意する。Phase 0 で実際に値が必要なのは DB の2つだけ。

```
# Database (Neon) — Phase 0
DATABASE_URL=
DIRECT_URL=

# Auth.js + Google OAuth — Phase 1
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

# Anthropic Claude API — Phase 2
ANTHROPIC_API_KEY=

# AWS S3 — Phase 2
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
S3_BUCKET_NAME=
```

## npm scripts

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "format": "prettier --write .",
  "test": "vitest run",
  "test:watch": "vitest",
  "db:migrate": "prisma migrate dev",
  "db:studio": "prisma studio",
  "db:generate": "prisma generate"
}
```

## 実装の流れ

1. `create-next-app` で雛形を作る（TypeScript / Tailwind / ESLint / App Router を有効化）
2. ディレクトリの空の入れ物を作る
3. Prisma を導入し、Neon の接続文字列を `.env` に入れる
4. スキーマを書き、`prisma migrate dev` でテーブルを作る
5. Prettier と Vitest を追加し、サンプルテストを1本書く
6. `.env.example` を作る
7. 動作確認（Req1〜Req4 の受け入れ基準）

## リスクと対策

| リスク | 対策 |
|---|---|
| Neon の接続文字列を2種類取り違える | Neon のコンソールで pooled / direct の表示を確認する。`DIRECT_URL` は migrate 専用 |
| Prisma のバージョンによって `directUrl` の書き方が違う | 公式ドキュメントで現行の書式を確認する。記憶で書かない |
| Next.js 15 と各ライブラリの互換 | `create-next-app` の生成物をそのまま使い、後から手で書き換えない |
