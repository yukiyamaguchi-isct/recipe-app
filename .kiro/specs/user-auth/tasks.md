# user-auth（Phase 1）の実装タスク

段階ごとにユーザーへ報告し、許可を得てからコミットする。**段階が終わったらこのファイルのチェックを更新する。**

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

- [ ] `app/login/page.tsx` に「Googleでログイン」ボタンとアプリの説明を置く
- [ ] Server Action から `signIn("google")` を呼ぶ
- [ ] エラー時（キャンセル等）に日本語のメッセージと再試行の導線を出す
- [ ] `searchParams` を `await` して読む（Next.js 16）
- [ ] テストを書く: ボタンが描画される / **パスワード入力欄が存在しない** / エラー時にメッセージが出る

**受け入れ基準**: 上記5コマンドが終了コード0。ワイヤーフレームの古い S-01（メール＋パスワード）になっていないこと

---

## 段階4: セッションから userId を取得できるようにする

- [ ] `lib/auth/session.ts` に `getUserId()` と `requireUserId()` を書く
- [ ] `UnauthorizedError` を型付きエラーとして定義する（`.kiro/steering/architecture.md` のエラー処理）
- [ ] テストを書く: 未ログインで `requireUserId()` が投げる / ログイン中は `userId` を返す

**受け入れ基準**: 上記5コマンドが終了コード0

---

## 段階5: proxy.ts を追加して未ログイン時にログイン画面へリダイレクトする

- [ ] `proxy.ts` に `export { auth as proxy }` を書く
- [ ] `matcher` で `api` / `_next/static` / `_next/image` / `favicon.ico` を除外する
- [ ] `app/page.tsx` を認証必須のホームにする（ユーザー名の表示とログアウト）
- [ ] ログイン済みで `/login` を開いたらホームへ送る
- [ ] **proxy を外しても保護が成立する**ことを確認する（認可の本体が `await auth()` 側にあること）

**受け入れ基準**: 上記5コマンドが終了コード0

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
