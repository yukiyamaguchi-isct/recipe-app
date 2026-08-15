# user-auth（Phase 1）の設計書

Auth.js v5 + Google provider でログインを実装する。session strategy は `jwt`、ユーザーの永続化は Prisma アダプタに任せる。

## この文書の読み方

**主張ごとに検証状態のラベルを付けてある。**

| ラベル    | 意味                                                       | 実装時の扱い             |
| --------- | ---------------------------------------------------------- | ------------------------ |
| ✅ 実測   | 実際に動かして確認した。再現手順を併記している             | そのまま信じてよい       |
| 📄 出典   | ライブラリのソースか公式ドキュメントで確認した。行番号付き | そのまま信じてよい       |
| ⚠️ 未検証 | 妥当だと考えているが確かめていない                         | **実装時に必ず確かめる** |

**ラベルの無い記述は「方針・判断」であって事実の主張ではない。** 事実を書くならラベルを付ける。

> この文書は Phase 1 の実装完了後（2026-08-15）に、実物から書き直したもの。初版は記憶で書いた箇所に3件の誤りがあり、すべて出典を書かなかった節に集中していた。**出典を書かない事実は書かない**、というのがこの文書の運用規則。

## 確定事項（蒸し返さない）

| 項目               | 決定                                      | 出どころ                         |
| ------------------ | ----------------------------------------- | -------------------------------- |
| 認証方式           | Google のみ。メール＋パスワードは採らない | `REQUIREMENTS.md` 9章            |
| session strategy   | `jwt`                                     | `REQUIREMENTS.md` 6章            |
| パスワード         | 保持しない                                | `.kiro/steering/architecture.md` |
| ビジュアルデザイン | 待たずに着手。S-01 はボタン1つのため      | `CLAUDE.md`                      |

---

# 1. 調査結果

着手前および実装中に確認した事実。**すべて出典付き。**

## 1.1 Auth.js のバージョンは `5.0.0-beta.32`（📄 出典）

```
npm view next-auth dist-tags
  latest: 4.24.15
  beta:   5.0.0-beta.32   ← 2026-07-20 公開
```

v5 の安定版は出ていない。`next-auth@beta` を使う。

**⚠️ キャレット付きで入れてはいけない。** `^5.0.0-beta.32` は semver 上 `>=5.0.0-beta.32 <6.0.0` を意味し、beta.33 以降や 5.0.0 安定版まで拾う。beta 間の破壊的変更を自動で踏むため、`package.json` には**キャレット無しの完全固定**で書く。

```json
"next-auth": "5.0.0-beta.32",
"@auth/prisma-adapter": "2.11.3"
```

## 1.2 Next.js 16 には対応済み（📄 出典）

`next-auth@5.0.0-beta.32` の `peerDependencies`。

```json
"next": "^14.0.0-0 || ^15.0.0 || ^16.0.0"
```

## 1.3 `middleware` → `proxy` の影響：2分割は不要（📄 出典）

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

## 1.4 Next.js 公式は「proxy を認可の本体にするな」と明記している（📄 出典）

| 出典                                        | 内容                                                                                                                                                                                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-app/01-getting-started/16-proxy.md` L29 | 「Proxy is _not_ intended for slow data fetching. While Proxy can be helpful for optimistic checks ... it should not be used as a full session management or authorization solution.」                                                  |
| `01-app/02-guides/authentication.md` L1024  | 節タイトルが「Optimistic checks with Proxy (**Optional**)」                                                                                                                                                                             |
| `.../file-conventions/proxy.md` L219        | 「A matcher change or a refactor that moves a Server Function to a different route can silently remove Proxy coverage. Always verify authentication and authorization inside each Server Function rather than relying on Proxy alone.」 |

**したがって認可の本体は各 Server Component / Route Handler の `await auth()` に置き、`proxy.ts` は先回りリダイレクト（体感の改善）と位置づける。** proxy が無くても保護が成立する構造にする。→ 検証方法は 5.2 節。

## 1.5 Prisma アダプタは型が効かない（✅ 実測）

`@auth/prisma-adapter@2.11.3` の実装。

```ts
import type { PrismaClient } from "@prisma/client";
export function PrismaAdapter(prisma: PrismaClient | ...): Adapter { ... }
```

ところが Prisma 7 + `output` 指定の構成では、`@prisma/client` から `PrismaClient` が生えていない。

```
error TS2305: Module '"@prisma/client"' has no exported member 'PrismaClient'.
```

このエラーは `node_modules` 内の `.d.ts` で起きるため、`tsconfig.json` の `skipLibCheck: true` に握り潰される。結果、**`PrismaAdapter()` の引数は実質 `any` になる**。

`Account` モデルが無い状態の `PrismaAdapter(prisma)` が `tsc --noEmit` を通ることを確認済み。

> **これが意味すること**: スキーマの不足はコンパイルでは捕まらず、**初回ログインの実行時に初めて落ちる**。だからスキーマは 2章のとおり過不足なく用意し、テストで担保する（6章）。

## 1.6 スキーマに足りないもの（📄 出典＋✅ 実測）

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

つまり `emailVerified: null` がそのまま `p.user.create()` に渡る。**`User` にこのフィールドが無いと初回ログインで落ちる。**

同様に `linkAccount` は `p.account.create({ data })` に `Account` 型をそのまま渡す。`Account` は `Partial<TokenEndpointResponse>` を継承しているため、`access_token` / `id_token` / `refresh_token` / `expires_at` / `token_type` / `scope` を受け取れる必要がある。

## 1.7 `proxy.ts` を置くだけでは何も保護されない（📄 出典＋✅ 実測）

**この節が Phase 1 で最も見落としやすい。**

```js
// node_modules/next-auth/lib/index.js L146-149
let authorized = true;
if (config.callbacks?.authorized) {
  authorized = await config.callbacks.authorized({ request, auth });
}
```

`authorized` は `true` で初期化され、**`callbacks.authorized` が無ければそのまま通る**。`export { auth as proxy }` を書いただけでは、proxy は素通りするだけの存在になる。

`false` を返したときの挙動も同じファイルにある。

```js
// 同 L171-180
else if (!authorized) {
  const signInPage = config.pages?.signIn ?? `${config.basePath}/signin`;
  if (request.nextUrl.pathname !== signInPage) {
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = signInPage;
    signInUrl.searchParams.set("callbackUrl", request.nextUrl.href);
    response = NextResponse.redirect(signInUrl);
  }
}
```

読み取れること2つ。

- リダイレクト先は `pages.signIn`（= `/login`）で、**`callbackUrl` が自動で付く**
- `/login` 自身も `authorized` が `false` になるが、`pathname !== signInPage` のガードで無限ループにならない

---

# 2. データモデル

`Session` と `VerificationToken` は**追加しない**。

- `Session` は session strategy が `database` のときだけ使われる。`jwt` では `createSession` などが一度も呼ばれない
- `VerificationToken` は Email provider 専用。Google のみのため使わない

```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  image         String?
  // Auth.js が createUser 時に null を渡してくる（1.6）。無いと初回ログインで落ちる
  emailVerified DateTime?
  createdAt     DateTime  @default(now())
  accounts      Account[]
  recipes       Recipe[]
}

model Account {
  userId            String
  type              String // "oidc"（Google は OIDC プロバイダ）
  provider          String // "google"
  providerAccountId String // Google が振る不変のID。メールアドレスと違い変わらない
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

## 決定と理由

| 決定                                             | 理由                                                                                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Account` のフィールド名を snake_case にする     | Auth.js が渡してくるキー名がそのまま OAuth のレスポンス（`access_token` 等）。リネームすると `linkAccount` が実行時に落ちる。**プロジェクトの命名規則より優先する** |
| 複合主キー `@@id([provider, providerAccountId])` | アダプタが `where: { provider_providerAccountId }` で引くため、この組み合わせの一意制約が必須                                                                       |
| `onDelete: Cascade`                              | ユーザーを消したら Account も消える                                                                                                                                 |
| `emailVerified` を持つが UI では使わない         | Auth.js の要求を満たすためだけ。Google 側で検証済みのメールしか来ないので、アプリのロジックでは参照しない                                                           |
| `Session` / `VerificationToken` を作らない       | `jwt` 戦略 + Google のみの構成では一度も呼ばれない                                                                                                                  |

## マイグレーション

`prisma migrate dev` は DB への接続が要る。**Neon の接続情報が無い環境（リモート開発環境）では実行できない。** スキーマ変更と `prisma generate` までを行い、マイグレーションの生成・適用はローカルで行う。

```bash
npx prisma migrate dev --name add_auth_account
```

期待される SQL（✅ 実測）。`DROP` が含まれていたら想定外なので止めること。

```sql
ALTER TABLE "User" ADD COLUMN "emailVerified" TIMESTAMP(3);
CREATE TABLE "Account" (... CONSTRAINT "Account_pkey" PRIMARY KEY ("provider","providerAccountId"));
CREATE INDEX "Account_userId_idx" ON "Account"("userId");
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

---

# 3. ファイル構成

```
auth.ts                             # Auth.js の設定。handlers / auth / signIn / signOut / authorized
proxy.ts                            # export { auth as proxy }。先回りリダイレクト
types/next-auth.d.ts                # session.user.id と JWT.userId の型
app/
├── api/auth/[...nextauth]/route.ts # handlers をルートに割り当てる
├── login/page.tsx                  # S-01
├── page.tsx                        # ホーム（Phase 4 で S-02 に差し替わる暫定）
└── layout.tsx
lib/
├── errors.ts                       # AppError / UnauthorizedError
└── auth/session.ts                 # getUserId() / requireUserId()
```

`auth.ts` をプロジェクト直下に置くのは Auth.js の慣習に合わせるため（`app/` 配下だとルートとして解釈されうる）。

---

# 4. 実装

**コードは import 行を含む完全な形で載せる。** 断片だけを載せると、初版で `route.ts` の export を取り違えたのと同じ事故が起きる。

## 4.1 auth.ts

```ts
import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),

  // AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET は Auth.js が環境変数から自動で読むため、引数を渡さない
  providers: [Google],

  session: { strategy: "jwt" },

  // 失敗時も Auth.js の既定画面ではなく S-01 に戻す（Req5）
  pages: { signIn: "/login", error: "/login" },

  callbacks: {
    // jwt 戦略ではセッションが DB に無いため、userId をトークンに載せる。
    // user が入るのは初回ログイン時だけで、以降は token 側にしか無い。
    jwt({ token, user }) {
      if (user?.id) {
        token.userId = user.id;
      }
      return token;
    },

    session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId;
      }
      return session;
    },

    // proxy.ts が使う。false を返すと pages.signIn（/login）へリダイレクトされる
    authorized({ auth: session }) {
      return Boolean(session?.user);
    },
  },
});
```

**失敗モード**

| 抜けるもの                | 起きること                                                  | 気づき方                        |
| ------------------------- | ----------------------------------------------------------- | ------------------------------- |
| `authorized` コールバック | proxy が素通りし、**未ログインでも全ページが開ける**（1.7） | `/` に未ログインで 200 が返る   |
| `jwt` コールバック        | `session.user.id` が常に undefined。データ取得が全部落ちる  | ログイン後にホームが 500 になる |
| `pages.error`             | 失敗時に Auth.js の英語の既定画面が出る                     | キャンセルすると英語画面        |

## 4.2 types/next-auth.d.ts

```ts
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

// 拡張先は `next-auth/jwt` ではなく `@auth/core/jwt`
declare module "@auth/core/jwt" {
  interface JWT {
    userId?: string;
  }
}
```

**⚠️ `JWT` の拡張先を間違えやすい（✅ 実測）。** `next-auth/jwt.d.ts` の中身は `export * from "@auth/core/jwt"` だけで `JWT` を宣言していない。そのため `declare module "next-auth/jwt"` は既存の型と合流せず別物になる。合流しないと `JWT extends Record<string, unknown>` の index signature が効いて `token.userId` が `unknown` のまま残り、`session.user.id` への代入がこう落ちる。

```
auth.ts(37,9): error TS2322: Type '{}' is not assignable to type 'string'.
```

## 4.3 app/api/auth/[...nextauth]/route.ts

```ts
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

**⚠️ `export { GET, POST } from "@/auth"` とは書けない。** `auth.ts` が export しているのは `handlers` であって `GET` / `POST` ではない。

## 4.4 proxy.ts

```ts
export { auth as proxy } from "@/auth";

export const config = {
  // 静的アセットを除外する。ここに認証をかけると CSS / JS / 画像が読めなくなる。
  // api を除外するのは Auth.js 自身のエンドポイント（/api/auth/*）を通すため。
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

**このファイル単体では何も保護しない。** 4.1 の `authorized` とセットで初めて動く（1.7）。

## 4.5 lib/errors.ts

```ts
export class AppError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = new.target.name;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "ログインが必要です。") {
    super("UNAUTHORIZED", message);
  }
}
```

`code` は API レスポンスの `error.code` にそのまま載る（`.kiro/steering/architecture.md`）。**必要になったエラーだけを足す。** 先回りして種類を増やさない。

## 4.6 lib/auth/session.ts

**以降のフェーズが `userId` を得る唯一の経路。**

```ts
import { auth } from "@/auth";
import { UnauthorizedError } from "@/lib/errors";

/** ログイン中のユーザーの id を返す。未ログインなら null。 */
export async function getUserId(): Promise<string | null> {
  const session = await auth();

  return session?.user?.id ?? null;
}

/** ログイン必須の処理で使う。未ログインなら UnauthorizedError を投げる。 */
export async function requireUserId(): Promise<string> {
  const userId = await getUserId();

  if (!userId) {
    throw new UnauthorizedError();
  }

  return userId;
}
```

- **クライアントから渡された `userId` を信用しない**（`.kiro/steering/architecture.md`）
- `requireUserId()` が `null` を返さないのは、呼び出し側が未ログインを握り潰したまま先に進むのを防ぐため
- **「セッションはあるが `user.id` が無い」も未ログイン扱い（`null`）にする。** `jwt` コールバックが `userId` を載せ損ねたとき、`undefined` が `userId` として後続に流れると他人のデータに触れる経路になりうるため
- 表示にユーザー名など `userId` 以外が要る箇所は `auth()` を直接呼んでよい。**データ取得のスコープに使う `userId` はここを通す**、という切り分け

Route Handler では `UnauthorizedError` を 401 に変換する（レスポンス形式は architecture.md の `{ success, data, error }`）。**⚠️ この変換は Phase 1 では未実装。** 保護対象の Route Handler がまだ無いため、Phase 2 で最初の保護付きエンドポイントを作るときに実装・検証する。

---

# 5. 認可の設計

## 5.1 二重構造

| 層                                              | 役割                               | 無くなったら             |
| ----------------------------------------------- | ---------------------------------- | ------------------------ |
| `proxy.ts` + `authorized`                       | 先回りリダイレクト。**体感の改善** | 遅くなるが**保護は残る** |
| 各 Server Component / Route Handler の `auth()` | **認可の本体**                     | **保護が消える**         |

1.4 のとおり Next.js 公式が「proxy を認可の本体にするな」と明記しているため、この順序は動かさない。

## 5.2 「proxy を外しても保護が成立する」の確認方法（✅ 実測）

**この設計が守られているかは、URL の差で外から判定できる。**

```bash
# proxy あり
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" http://localhost:3000/
# → 307 -> http://localhost:3000/login?callbackUrl=http%3A%2F%2Flocalhost%3A3000%2F

# proxy.ts を退避して再起動
mv proxy.ts /tmp/ && npm run dev
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" http://localhost:3000/
# → 307 -> http://localhost:3000/login    ← callbackUrl が付かない
```

`callbackUrl` の有無で**どちらの層が効いているか見分けられる**。

- **proxy なしで 307 → 保護は本体側にある。正しい**
- **proxy なしで 200 → 本体側の保護が無い。設計違反**

リファクタで `auth()` の呼び出しを消してしまっても、この手順で検出できる。

---

# 6. 画面

見た目（配色・書体・余白）は `DESIGN.md` の完成待ちで、現状は Tailwind の暫定値。**この章で決めるのは構造と挙動だけ。**

## 6.1 S-01 ログイン（`/login`）

`UI_DESIGN.md` 3章のとおり、**「Googleでログイン」ボタン1つ。入力フォームは無い。**

> ⚠️ ワイヤーフレームのアーティファクトの S-01 は古く、メール＋パスワードのフォームが描かれている。`UI_DESIGN.md` が正（`HANDOVER.md` 4章）。テストで入力欄の不在を固定してある。

**挙動**

| 条件                 | 動作                                     |
| -------------------- | ---------------------------------------- |
| 未ログイン           | ボタンとアプリの説明を表示               |
| ログイン済み         | `/` へリダイレクト                       |
| `?error=<code>` 付き | エラーメッセージを `role="alert"` で表示 |

- `signIn("google", { redirectTo: "/" })` を Server Action から呼ぶ（ボタンを `<form action={...}>` で包む）
- **`searchParams` は Promise。`await` して読む**（Next.js 16）

### エラーコードと文言（📄 出典）

コードの一覧は `@auth/core/src/types.ts` の `SignInPageErrorParam`（L205）と `ErrorPageParam`（L202）。**Google のみの構成で出うるものだけを訳し、表に無いコードは既定の文言に落とす。**

| code                                              | いつ来るか                         | 文言の要点                             |
| ------------------------------------------------- | ---------------------------------- | -------------------------------------- |
| `AccessDenied`                                    | **同意画面でキャンセルした**       | キャンセルした旨＋「続行」を押せばよい |
| `Configuration`                                   | サーバー側の設定不備               | 時間をおいて駄目なら管理者へ           |
| `OAuthSignin` / `OAuthCallbackError` / `Callback` | Google との通信失敗                | 通信環境を確認して再試行               |
| `OAuthCreateAccount`                              | **DB へのユーザー作成に失敗**      | 時間をおいて駄目なら管理者へ           |
| `OAuthAccountNotLinked`                           | 同じメールが別方式で登録済み       | 最初に使ったアカウントで               |
| `SessionRequired`                                 | 要ログインの画面に未ログインで来た | ログインが必要                         |
| （上記以外）                                      | —                                  | 既定の文言                             |

> **`OAuthCreateAccount` が出たらスキーマを疑う。** 1.5 のとおり型では捕まらないスキーマ不足が、実行時にここへ落ちる。

## 6.2 ホーム（`/`）

Phase 4 で S-02 に差し替わる**暫定の着地先**。認証が通っていることを確認できる最小限に留める。

- ログイン中のユーザー名（無ければメールアドレス）を表示
- ログアウトのボタン（`signOut({ redirectTo: "/login" })`）
- 未ログインなら `/login` へリダイレクト ← **これが認可の本体**（5.1）

ログアウトは `UI_DESIGN.md` ではヘッダーのメニューに置くとしているが、ヘッダーは S-02 と一緒に作るため、ここでは仮置き。

---

# 7. テスト方針

**型が効かない（1.5）ぶんをテストと実機確認で補う。** ここが Phase 1 の要点。

| 対象                  | 見るもの                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| スキーマ              | `Account` が Auth.js の要求するフィールドを持つ / `User` に `emailVerified` がある              |
| `lib/auth/session.ts` | 未ログインで投げる / ログイン中は返す / `user.id` が無ければ `null`                             |
| S-01                  | ボタンが描画される / **入力欄が存在しない** / エラー時に文言が出る / ログイン済みはリダイレクト |
| ホーム                | 名前とログアウトが出る / **未ログインならリダイレクト**（本体側の保護の固定）                   |

**スキーマのテストは実行時の値で書ける（✅ 実測）。** Prisma の生成物に `Prisma.AccountScalarFieldEnum` が定数として存在するため、フィールド名の一覧をそのまま比較できる。

```ts
expect(Object.keys(Prisma.AccountScalarFieldEnum)).toEqual([
  "userId",
  "type",
  "provider",
  "providerAccountId",
  "refresh_token",
  "access_token",
  "expires_at",
  "token_type",
  "scope",
  "id_token",
  "session_state",
]);
```

このテストが空振りしないことを確認済み。`emailVerified` を削って `prisma generate` すると `expected [ Array(5) ] to include 'emailVerified'` で落ちる。

## テストを書くときの前提

| 事項                                   | 対処                                                                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@/auth` を実体で読むと落ちる          | `vi.mock("@/auth", ...)` で差し替える。実体は `lib/prisma.ts` を評価し、`DATABASE_URL` 未設定で throw する                                                                            |
| `vi.mock` のファクトリは巻き上げられる | 参照するモックは `vi.hoisted` で一緒に巻き上げる。素直に `const authMock = vi.fn()` と書くと TDZ で落ちる                                                                             |
| `redirect()` は例外を投げる            | モックも `throw` する実装にする。`undefined` を返すと後続が走ってしまい、検証にならない                                                                                               |
| Server Component の描画                | `render(await LoginPage({ searchParams: Promise.resolve({}) }))`                                                                                                                      |
| **DOM がテスト間で残る**（✅ 実測）    | `vitest.setup.ts` で `afterEach(cleanup)` を登録済み。Testing Library の自動クリーンアップは `globals: true` のときしか効かない。無いと2つ目以降が「Found multiple elements」で落ちる |

## 自動テストで担保しないもの

- Google の OAuth フローそのもの
- `User` / `Account` が実際に作られること

どちらも Neon に繋がる環境での**手動確認**（tasks.md 段階6）。

---

# 8. 落とし穴の一覧

**実装中に踏んだもの・踏みかけたものを一箇所に集めた。** 新しく入る人はここだけ先に読んでもよい。

| #   | 落とし穴                                         | 症状                                  | 対処      |
| --- | ------------------------------------------------ | ------------------------------------- | --------- |
| 1   | `proxy.ts` だけ置いて `authorized` を書かない    | 保護されないが**エラーも出ない**      | 1.7 / 4.1 |
| 2   | `User.emailVerified` を作らない                  | 初回ログインだけ失敗。型は通る        | 1.6 / 2章 |
| 3   | `Account` のフィールド名を camelCase にする      | `linkAccount` が実行時に落ちる        | 2章       |
| 4   | `JWT` を `next-auth/jwt` に対して拡張する        | `TS2322: Type '{}' is not assignable` | 4.2       |
| 5   | `export { GET, POST } from "@/auth"`             | 解決しない                            | 4.3       |
| 6   | `next-auth` をキャレット付きで入れる             | beta 間の破壊的変更を自動で踏む       | 1.1       |
| 7   | matcher から静的アセットを除外し忘れる           | CSS / JS / 画像が読めない             | 4.4       |
| 8   | `searchParams` を `await` せずに読む             | Next.js 16 で型エラー                 | 6.1       |
| 9   | Auth.js のドキュメントを `middleware` のまま写す | proxy として認識されない              | 1.3       |

---

# 9. 受け入れの確認手順

**「動くこと」ではなく、外から観測できる形で書く。** requirements.md の受け入れ基準と対応する。

| #   | 手順                                      | 期待される観測結果                               | Req  |
| --- | ----------------------------------------- | ------------------------------------------------ | ---- |
| 1   | 未ログインで `/` を開く                   | 307 → `/login?callbackUrl=...`                   | Req3 |
| 2   | `proxy.ts` を退避して 1 を再実行          | 307 → `/login`（`callbackUrl` なし）             | 5.2  |
| 3   | 「Googleでログイン」を押す                | Google の同意画面に遷移                          | Req1 |
| 4   | 承認する                                  | `/` に戻り、自分の名前が表示される               | Req1 |
| 5   | `npx prisma studio` で確認                | `User` 1件 / `Account` 1件                       | Req1 |
| 6   | ログアウト → 再度同じアカウントでログイン | `User` が**増えない**（1件のまま）               | Req1 |
| 7   | ログイン済みで `/login` を開く            | `/` にリダイレクト                               | Req3 |
| 8   | 同意画面でキャンセル                      | `/login?error=AccessDenied` で日本語のメッセージ | Req5 |
| 9   | ログアウト後に `/` を開く                 | `/login` にリダイレクト                          | Req2 |

Route Handler の 401 変換（Req4 の一部）は Phase 2 に持ち越し（4.6）。

---

# 10. リスクと対策

| リスク                                                 | 対策                                                                              |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| スキーマ不足が型で捕まらず、初回ログインで初めて落ちる | 2章のとおり定義し、スキーマのテストで固定。実機で初回ログインを必ず確認（9章 #5） |
| `next-auth` が beta のため、beta 間で破壊的変更が入る  | バージョンを完全固定。上げるときは変更点を確認してから                            |
| Google Cloud Console のリダイレクトURI 設定漏れ        | `http://localhost:3000/api/auth/callback/google` を登録済みか確認                 |
| Auth.js のドキュメントが `middleware` 前提             | ファイル名 `proxy.ts` / export 名 `proxy` に読み替える（1.3）                     |
| proxy の matcher を変えた際に保護が静かに外れる        | 認可の本体を `auth()` 側に置く。9章 #2 の手順で定期的に確認                       |
| ⚠️ 本番（Vercel）での挙動は未確認                      | デプロイ時に `AUTH_URL` / リダイレクトURI の本番値を設定し、9章を本番でも実行する |
