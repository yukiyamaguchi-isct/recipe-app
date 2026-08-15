# user-auth（Phase 1）の実装タスク

段階ごとにユーザーへ報告し、許可を得てからコミットする。**段階が終わったらこのファイルのチェックを更新する。**

> **このファイルは作業ログ。設計の「正」は design.md。** 各段階の「実施時の記録」のうち、以降も参照する内容は design.md 本体へ還元済み（`.kiro/README.md` の「design.md の書き方」6を参照）。ここの記録は「どの段階で何が分かったか」の履歴として残してある。

---

## 事前準備（ユーザー作業）

- [x] Google Cloud Console で OAuth クライアントを作成する（`SETUP.md` の Phase 1）
- [x] `.env` に `AUTH_SECRET` / `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` を設定する
- [ ] リダイレクトURI `http://localhost:3000/api/auth/callback/google` が登録済みか確認する

> **開発環境について**: このフェーズはリモート実行環境（Neon への接続情報を持たない）で実装している。`prisma migrate dev` と実際の Google ログインはローカルでの実行が必要。段階1・段階6を参照。

---

## 段階1: schema.prisma に Account モデルと User.emailVerified を追加する

Auth.js の Prisma アダプタが要求するスキーマを揃える。**型では捕まらないため、design.md の「調査結果6」で逆算した内容をそのまま入れる。**

- [x] `User` に `emailVerified DateTime?` と `accounts Account[]` を追加する
- [x] `Account` モデルを追加する（複合主キー `@@id([provider, providerAccountId])`）
- [x] `npx prisma generate` が通ることを確認する
- [x] スキーマのテストを追加する（型で捕まらないぶんの担保）
- [ ] **マイグレーションファイルを生成する（ローカル作業。下記参照）**

**受け入れ基準**: `prisma generate` 成功、`format` / `lint` / `tsc` / `test` が終了コード0

> **⚠️ この段階はローカルでの作業が要る。** `npx prisma migrate dev` は DB に接続してマイグレーションを生成・適用するため、Neon の接続情報が無い環境では実行できない。リモート側ではスキーマ変更までを行い、**マイグレーションの生成と適用はローカルで `npx prisma migrate dev --name add_auth_account` を実行する**。生成された `prisma/migrations/` をコミットに含める。

### 実施時の記録

- `npx prisma format` がフィールドの桁を揃えるため、`schema.prisma` は手で整形しない
- **スキーマのテストを `__tests__/schema.test.ts` に追加した。** `Prisma.AccountScalarFieldEnum` / `Prisma.UserScalarFieldEnum` が生成物に**実行時の値として**存在するため、フィールド名の一覧をそのまま比較できる
- テストが実際に欠落を捕まえることを確認した。`emailVerified` を一時的に削って `prisma generate` すると `expected [ Array(5) ] to include 'emailVerified'` で落ちる。確認後にスキーマを戻した
- `Account` のフィールドの並び順まで含めて比較している。順序に意味は無いが、`toEqual` のほうが「増えた」場合も検出できるため採用した。将来 Auth.js の要求が変わったらこのテストが落ちるので、そこで design.md ごと見直す

---

## 段階2: Auth.js を導入して Google 認証のエンドポイントを追加する

- [x] `next-auth@beta` と `@auth/prisma-adapter` を導入する（バージョンを固定する）
- [x] `auth.ts` を作る（Google provider / `session.strategy = "jwt"` / アダプタ / `jwt`・`session` コールバック）
- [x] `app/api/auth/[...nextauth]/route.ts` を作る
- [x] `types/next-auth.d.ts` で `session.user.id` の型を足す
- [x] `npm run build` が通ることを確認する

**受け入れ基準**: `format` / `lint` / `tsc` / `test` / `build` がすべて終了コード0

### 実施時の記録

- 入ったのは `next-auth@5.0.0-beta.32` / `@auth/prisma-adapter@2.11.3`。**キャレットを外して固定した。** `^5.0.0-beta.32` は beta.33 以降や 5.0.0 安定版まで拾ってしまい、beta 間の破壊的変更を自動で踏むため
- **design.md の `route.ts` の記述が誤っていたので直した。** `auth.ts` が export するのは `handlers` であり、`export { GET, POST } from "@/auth"` では解決しない。正しくは `import { handlers } from "@/auth"` してから `export const { GET, POST } = handlers`
- **`JWT` の module augmentation は `@auth/core/jwt` に対して行う。** `next-auth/jwt` は再エクスポートのみで `JWT` を宣言しておらず、そちらを拡張すると合流せずに `token.userId` が `unknown` のまま残り、`TS2322: Type '{}' is not assignable to type 'string'` で落ちる。design.md に追記済み
- `DATABASE_URL` が無い環境でも `npm run build` は通った。`/api/auth/[...nextauth]` が動的ルート（`ƒ`）としてビルドされ、`lib/prisma.ts` がビルド時に評価されないため

---

## 段階3: S-01 ログイン画面を作る

- [x] `app/login/page.tsx` に「Googleでログイン」ボタンとアプリの説明を置く
- [x] Server Action から `signIn("google")` を呼ぶ
- [x] エラー時（キャンセル等）に日本語のメッセージと再試行の導線を出す
- [x] `searchParams` を `await` して読む（Next.js 16）
- [x] テストを書く: ボタンが描画される / **パスワード入力欄が存在しない** / エラー時にメッセージが出る

**受け入れ基準**: 上記5コマンドが終了コード0。ワイヤーフレームの古い S-01（メール＋パスワード）になっていないこと

### 実施時の記録

- **エラーコードの一覧は `@auth/core` のソースから取った。** `SignInPageErrorParam`（`src/types.ts` L205）と `ErrorPageParam`（同 L202）。Google のみの構成で出うるものだけを訳し、`ERROR_MESSAGES` に無いコードは既定の文言にフォールバックする
- キャンセル時に来るのは `AccessDenied`。`OAuthCreateAccount` は DB へのユーザー作成が失敗したときで、**スキーマ不足があるとここに落ちる**（design.md 調査結果6）
- **`vitest.setup.ts` を追加した。** Testing Library の自動クリーンアップは `globals: true` のときしか登録されず、このプロジェクトは無効。そのためテスト間で DOM が残り、2つ目以降の `getByRole("alert")` が「Found multiple elements」で落ちた（実測）。`afterEach(cleanup)` を明示的に登録して解消。**今後のコンポーネントテスト全部に効く箇所なので、テストファイル側では対処していない**
- テストでは `@/auth` を `vi.mock` で差し替えている。実体を読むと `lib/prisma.ts` が評価され、`DATABASE_URL` 未設定の環境で落ちるため
- Server Component は `render(await LoginPage({ searchParams: Promise.resolve({}) }))` の形で描画できる

---

## 段階4: セッションから userId を取得できるようにする

- [x] `lib/auth/session.ts` に `getUserId()` と `requireUserId()` を書く
- [x] `UnauthorizedError` を型付きエラーとして定義する（`.kiro/steering/architecture.md` のエラー処理）
- [x] テストを書く: 未ログインで `requireUserId()` が投げる / ログイン中は `userId` を返す

**受け入れ基準**: 上記5コマンドが終了コード0

### 実施時の記録

- `lib/errors.ts` は Phase 0 の design.md に名前だけ出ていたが未作成だったので、ここで作った。`AppError`（`code` を持つ基底）と `UnauthorizedError`（`code: "UNAUTHORIZED"`）のみ。**必要になったエラーだけを足す方針**とし、先回りして種類を増やさない
- `vi.mock` のファクトリはファイル先頭に巻き上げられるため、参照するモックは `vi.hoisted` で一緒に巻き上げる必要がある。素直に `const authMock = vi.fn()` と書くと TDZ で落ちる
- 「セッションはあるが `user.id` が無い」場合も未ログイン扱い（`null`）にした。`jwt` コールバックが `userId` を載せ損ねた場合に、`undefined` が `userId` として後続に流れるのを防ぐため

> **Req4 の受け入れ基準のうち、Route Handler に関する2項目（「Route Handler から同じ userId を取得できる」「未ログインで Route Handler を叩くと 401 が返る」）は Phase 1 では確認できない。** このフェーズには保護対象の Route Handler が無いため。**Phase 2 で最初の保護付きエンドポイントを作る際に、`UnauthorizedError` → 401 の変換とあわせて確認する。** 確認用のダミーendpointは作らない（本番に残る不要な経路を増やさないため）。

---

## 段階5: proxy.ts を追加して未ログイン時にログイン画面へリダイレクトする

- [x] `proxy.ts` に `export { auth as proxy }` を書く
- [x] **`auth.ts` に `authorized` コールバックを足す**（これが無いと proxy は何も保護しない。下記）
- [x] `matcher` で `api` / `_next/static` / `_next/image` / `favicon.ico` を除外する
- [x] `app/page.tsx` を認証必須のホームにする（ユーザー名の表示とログアウト）
- [x] ログイン済みで `/login` を開いたらホームへ送る
- [x] **proxy を外しても保護が成立する**ことを確認する（認可の本体が `await auth()` 側にあること）

**受け入れ基準**: 上記5コマンドが終了コード0

### 実施時の記録

- **⚠️ `export { auth as proxy }` を置くだけでは何も保護されない。** next-auth の `handleAuth`（`node_modules/next-auth/lib/index.js` L146）は `let authorized = true;` から始まり、`config.callbacks.authorized` が無ければ常に通す。`auth.ts` に `authorized({ auth }) { return Boolean(session?.user) }` を足して初めてリダイレクトが起きる。**design.md の proxy.ts の記述が不十分だったので追記した**
- `authorized` が `false` を返すと、next-auth が `pages.signIn`（= `/login`）へ `callbackUrl` 付きでリダイレクトする。`/login` 自身は同じ判定で `false` になるが、`request.nextUrl.pathname !== signInPage` のガードがあるため無限ループにはならない（同 L173）
- **「proxy を外しても保護が成立する」を実測した。** `proxy.ts` を退避して `npm run dev` を起動し直し、`/` にアクセスすると **`callbackUrl` の付かない** `/login` へ 307 が返る。これは `app/page.tsx` 自身の `redirect("/login")` によるもの。proxy 有りだと `callbackUrl` が付くので、どちらが効いているか URL で見分けられる
- `app/page.tsx` は `getUserId()` ではなく `auth()` を直接呼んでいる。表示にユーザー名が要るため。**`userId` だけが必要な箇所（データ取得）は `lib/auth/session.ts` を通す**、という切り分けは変えない
- テストでは `next/navigation` の `redirect` をモックし、本物と同じく例外を投げる実装にしている。返り値が `undefined` だと後続のコードが走ってしまい、リダイレクトの検証にならないため

---

## 段階6: 実機で Google ログインを確認する（ローカル作業）

自動テストで担保できない部分。**ローカルで実行する。**

- [ ] `npx prisma migrate dev` を適用する（段階1の続き）
- [ ] `npm run dev` で実際に Google ログインを通す
- [ ] DB に `User` と `Account` が1件ずつ作られていることを確認する（`npx prisma studio`）
- [ ] 同じアカウントで再ログインしても `User` が増えないことを確認する
- [ ] ログアウト → 保護ページを開くと `/login` に飛ぶことを確認する
- [ ] Google の同意画面でキャンセルしたときのメッセージを確認する

**受け入れ基準**: requirements.md の Req1〜Req5 の受け入れ基準をすべて実測で確認

---

## 段階7: フェーズ表と引き継ぎ資料を更新する

- [ ] `.kiro/README.md` の実装フェーズ表で `user-auth` を「完了」にする
- [ ] `HANDOVER.md` を Phase 2 に向けて更新する（現在地・次にやること・Phase 2 で必要な環境変数）
- [ ] `CLAUDE.md` の「Current state」を更新する

**受け入れ基準**: 新しいセッションが `HANDOVER.md` だけで Phase 2 に入れる状態

---

## テスト方針

design.md の「テスト方針」を参照。要点は、**Prisma アダプタの型が `skipLibCheck` で潰れているぶんをテストと実機確認で補う**こと。

- 自動テスト: `lib/auth/session.ts` の分岐、S-01 の描画、スキーマの形
- 手動確認: 実際の Google OAuth フロー（段階6）
