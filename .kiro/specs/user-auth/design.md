# user-auth（Phase 1）の設計書

## 概要

Auth.js v5 + Google provider でログインを実装する。session strategy は `jwt`、ユーザーの永続化は Prisma アダプタに任せる。

**この文書の内容は着手前の調査で実物を確認したもの。** 根拠を各節に併記する。記憶で書き換えないこと。

## 調査結果（2026-08-13 時点・実測）

`HANDOVER.md` 4章が「コードを書く前に必ず調べること」として挙げた3点の結論。

### 1. Auth.js のバージョンは `5.0.0-beta.32`（beta のまま）

```
npm view next-auth dist-tags
  latest: 4.24.15
  beta:   5.0.0-beta.32   ← 2026-07-20 公開
```

v5 の安定版は出ていない。`next-auth@beta` を使う。

### 2. Next.js 16 には対応済み

`next-auth@5.0.0-beta.32` の `peerDependencies`。

```json
"next": "^14.0.0-0 || ^15.0.0 || ^16.0.0"
```

### 3. `middleware` → `proxy` の影響：**`auth.config.ts` / `auth.ts` の2分割は不要**

Auth.js v5 の一般的な構成は、設定を `auth.config.ts`（edge で動く分）と `auth.ts`（Prisma を含む分）に割る。**これは middleware が edge ランタイムで動くことへの対策**であって、それ以外の理由は無い。

Next.js 16 では前提が変わった。

| 出典                                                                           | 内容                                                                                                          |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` L221-223 | 「Proxy defaults to using the Node.js runtime. The `runtime` config option is not available in Proxy files.」 |
| 同 L774                                                                        | 「`v16.0.0` Middleware is deprecated and renamed to Proxy. Proxy defaults to the Node.js runtime」            |

proxy が Node.js ランタイムで動くため、**Prisma を含んだ設定をそのまま proxy から使える**。よって設定ファイルは `auth.ts` 1つにする。

ファイル名と export 名だけ読み替える。

```ts
// Auth.js のドキュメントの書き方（Next.js 15 まで）
// middleware.ts
export { auth as middleware } from "./auth";

// Next.js 16 での書き方
// proxy.ts
export { auth as proxy } from "@/auth";
```

`proxy.md` L57-59 に「The file must export a single function, either as a default export or named `proxy`」とあり、名前を変えた再エクスポートで要件を満たす。

### 4. Next.js 公式は「proxy を認可の本体にするな」と明記している

これは調査中に分かった追加事項で、設計に影響する。

| 出典                                        | 内容                                                                                                                                                                                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-app/01-getting-started/16-proxy.md` L29 | 「Proxy is _not_ intended for slow data fetching. While Proxy can be helpful for optimistic checks ... it should not be used as a full session management or authorization solution.」                                                  |
| `01-app/02-guides/authentication.md` L1024  | 節タイトルが「Optimistic checks with Proxy (**Optional**)」                                                                                                                                                                             |
| `.../file-conventions/proxy.md` L219        | 「A matcher change or a refactor that moves a Server Function to a different route can silently remove Proxy coverage. Always verify authentication and authorization inside each Server Function rather than relying on Proxy alone.」 |

**したがって認可の本体は各 Server Component / Route Handler の `await auth()` に置き、`proxy.ts` は先回りリダイレクト（体感の改善）と位置づける。** proxy が無くても保護が成立する構造にする。

### 5. Prisma アダプタは型が効かない（`skipLibCheck` の影響）

`@auth/prisma-adapter@2.11.3` の実装。

```ts
import type { PrismaClient } from "@prisma/client";
export function PrismaAdapter(prisma: PrismaClient | ...): Adapter { ... }
```

ところが Prisma 7 + `output` 指定の構成では、`@prisma/client` から `PrismaClient` が生えていない。実測。

```
error TS2305: Module '"@prisma/client"' has no exported member 'PrismaClient'.
```

このエラーは `node_modules` 内の `.d.ts` で起きるため、`tsconfig.json` の `skipLibCheck: true` に握り潰される。結果、**`PrismaAdapter()` の引数は実質 `any` になる**。

実際、`Account` モデルが無い状態の `PrismaAdapter(prisma)` が `tsc --noEmit` を通ることを確認済み。

> **これが意味すること**: スキーマの不足はコンパイルでは捕まらず、**初回ログインの実行時に初めて落ちる**。だからスキーマは下記のとおり過不足なく用意し、テストで実際にレコードが作られることを確認する。

### 6. スキーマに足りないもの（アダプタのソースから逆算）

`@auth/core` の OAuth ログイン処理はこう呼ぶ。

```ts
// @auth/core/src/lib/actions/callback/handle-login.ts L316
user = await createUser({ ...profile, emailVerified: null });
```

アダプタ側の `createUser` は `stripUndefined` を通すだけで、**`undefined` は落とすが `null` は落とさない**。

```ts
// @auth/prisma-adapter/src/index.ts L129-133
function stripUndefined<T>(obj: T) {
  const data = {} as T;
  for (const key in obj) if (obj[key] !== undefined) data[key] = obj[key];
  return { data };
}
```

つまり `emailVerified: null` がそのまま `p.user.create()` に渡る。**現行の `User` にはこのフィールドが無いため、追加しないと初回ログインで Prisma が落ちる。**

同様に `linkAccount` は `p.account.create({ data })` に `Account` 型をそのまま渡す。`Account` は `Partial<TokenEndpointResponse>` を継承しているため、`access_token` / `id_token` / `refresh_token` / `expires_at` / `token_type` / `scope` を受け取れる必要がある。

## スキーマの変更

`Session` と `VerificationToken` は**追加しない**。

- `Session` は session strategy が `database` のときだけ使われる。今回は `jwt` で確定しているため、`createSession` などは一度も呼ばれない
- `VerificationToken` は Email provider 専用。Google のみのため使わない

使わないテーブルを作らない、という判断。将来 `database` 戦略に変えるなら、そのときに追加する（`jwt` は確定事項なので想定しない）。

```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  image         String?
  emailVerified DateTime? // Auth.js が createUser 時に null を渡してくる。無いと落ちる
  createdAt     DateTime  @default(now())
  accounts      Account[]
  recipes       Recipe[]
}

model Account {
  userId            String
  type              String // "oidc"（Google は OIDC プロバイダ）
  provider          String // "google"
  providerAccountId String // Google が振る不変のID。メールアドレスは変わりうるがこれは変わらない
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([provider, providerAccountId])
  @@index([userId])
}
```

### スキーマ上の決定と理由

| 決定                                             | 理由                                                                                                                                                        |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Account` のフィールド名を snake_case にする     | Auth.js が渡してくるキー名がそのまま OAuth のレスポンス（`access_token` 等）。リネームすると `linkAccount` が落ちる。**プロジェクトの命名規則より優先する** |
| 複合主キー `@@id([provider, providerAccountId])` | アダプタが `where: { provider_providerAccountId }` で引くため、この組み合わせの一意制約が必須                                                               |
| `onDelete: Cascade`                              | ユーザーを消したら Account も消える                                                                                                                         |
| `emailVerified` を持つが UI では使わない         | Auth.js の要求を満たすためだけ。Google 側で検証済みのメールしか来ないので、アプリのロジックでは参照しない                                                   |
| `Session` / `VerificationToken` を作らない       | `jwt` 戦略 + Google のみの構成では一度も呼ばれない                                                                                                          |

> **マイグレーションの注意**: `prisma migrate dev` は DB への接続が要る。リモート開発環境（Neon の接続情報が無い環境）では実行できないため、**適用はローカルで行う**。tasks.md の段階1を参照。

## ファイル構成

```
auth.ts                             # Auth.js の設定。handlers / auth / signIn / signOut を export
proxy.ts                            # export { auth as proxy }。先回りリダイレクト
app/
├── api/auth/[...nextauth]/route.ts # export const { GET, POST } = handlers
├── login/page.tsx                  # S-01
├── page.tsx                        # ホーム（Phase 4 で S-02 に差し替わる暫定）
└── layout.tsx
lib/
└── auth/session.ts                 # requireUserId() など。セッションから userId を取る唯一の経路
```

`auth.ts` をプロジェクト直下に置くのは Auth.js の慣習に合わせるため（`app/` 配下だとルートとして解釈されうる）。

## auth.ts

```ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Google],
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    // jwt 戦略ではセッションがDBに無いため、userId をトークンに載せる。
    // user が入るのは初回ログイン時だけで、以降は token 側にしか無い。
    jwt({ token, user }) {
      if (user) token.userId = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.userId) session.user.id = token.userId as string;
      return session;
    },
  },
});
```

- プロバイダの認証情報は `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` を Auth.js が自動で読むため、`Google` に引数を渡さない
- `pages.error` を `/login` に向け、失敗時も S-01 に戻す（Req5）

### `session.user.id` の型

`next-auth` の `Session["user"]` に `id` は無いため、module augmentation で足す。`types/next-auth.d.ts` に置く。

**`JWT` の拡張先は `next-auth/jwt` ではなく `@auth/core/jwt`。** `next-auth/jwt.d.ts` の中身は `export * from "@auth/core/jwt"` だけで `JWT` を宣言していないため、`declare module "next-auth/jwt"` は既存の型と合流せず別物になる。合流しないと `JWT extends Record<string, unknown>` の index signature が効いて `token.userId` が `unknown` のままになり、`session.user.id` への代入が `TS2322: Type '{}' is not assignable to type 'string'` で落ちる（実測）。

## 認可の実装方針

**本体は `await auth()`。proxy は補助。** 上記「調査結果4」に基づく。

```ts
// lib/auth/session.ts
import { auth } from "@/auth";

/** ログイン中の userId を返す。未ログインなら null。 */
export async function getUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/** ログイン必須の場所で使う。未ログインなら投げる。 */
export async function requireUserId(): Promise<string> {
  const userId = await getUserId();
  if (!userId) throw new UnauthorizedError();
  return userId;
}
```

- **クライアントから渡された `userId` を信用しない**（`.kiro/steering/architecture.md`）。以降のフェーズで `userId` を得る経路はここだけにする
- Route Handler では `UnauthorizedError` を 401 に変換する。レスポンス形式は architecture.md の `{ success, data, error }` に従う

```ts
// proxy.ts
export { auth as proxy } from "@/auth";

export const config = {
  // 静的アセットに認証をかけると CSS / JS / 画像が読めなくなる（proxy.md の matcher の注意）
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

## 画面

### S-01 ログイン（`/login`）

`UI_DESIGN.md` 3章のとおり、**「Googleでログイン」ボタン1つ。入力フォームは無い。**

> ⚠️ ワイヤーフレームのアーティファクトの S-01 は古く、メール＋パスワードのフォームが描かれている。`UI_DESIGN.md` が正（`HANDOVER.md` 4章）。

- アプリの説明を1〜2行添える
- `signIn("google")` を Server Action から呼ぶ（ボタンを `<form action={...}>` で包む）
- `searchParams` に Auth.js からのエラーが載るので、日本語のメッセージに変換して表示する（Req5）
  - Next.js 16 では `searchParams` は Promise。`await` が必要（`.kiro/steering/architecture.md`）

### ホーム（`/`）

Phase 4 で S-02 に差し替わる**暫定の着地先**。このフェーズでは認証が通っていることを確認できる最小限にする。

- ログイン中のユーザー名を表示する
- ログアウトのボタンを置く（`UI_DESIGN.md` はヘッダーのメニューに置くとしているが、ヘッダーは S-02 と一緒に作るため、ここでは仮置き）
- 未ログインなら `/login` へリダイレクト

## テスト方針

**型が効かない（調査結果5）ぶんをテストで補う。** ここが今回の要点。

| 対象                  | 見るもの                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `lib/auth/session.ts` | 未ログインで `requireUserId()` が投げる / ログイン中は `userId` を返す（`auth()` をモック） |
| S-01                  | 「Googleでログイン」ボタンが描画される / パスワード入力欄が**存在しない**                   |
| S-01（エラー時）      | エラー付きで開くと日本語のメッセージが出る                                                  |
| スキーマ              | `Account` が Auth.js の要求するフィールドを持つ / `User` に `emailVerified` がある          |

- Google の OAuth フローそのものは自動テストの対象外。実際のログインは手で確認する（Req1 の受け入れ基準）
- `User` と `Account` が実際に作られることの確認は、Neon に繋がる環境での手動確認とする

## リスクと対策

| リスク                                                               | 対策                                                                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| スキーマ不足が型で捕まらず、初回ログインで初めて落ちる               | 調査結果6のとおり過不足なく定義する。初回ログインを実機で必ず確認する                                              |
| `next-auth` が beta のため、beta 間で破壊的変更が入る                | バージョンを `package.json` に固定し、上げるときは変更点を確認してから上げる                                       |
| Google Cloud Console のリダイレクトURI 設定漏れ                      | ローカル用 `http://localhost:3000/api/auth/callback/google` を登録済みか確認する（`.kiro/steering/tech-stack.md`） |
| Auth.js のドキュメントが `middleware` 前提で、そのまま書くと動かない | ファイル名 `proxy.ts` / export 名 `proxy` に読み替える。調査結果3を参照                                            |
| proxy の matcher を変えた際に保護が静かに外れる                      | 認可の本体を `await auth()` 側に置く。proxy が無くても保護が成立する構造にする                                     |
