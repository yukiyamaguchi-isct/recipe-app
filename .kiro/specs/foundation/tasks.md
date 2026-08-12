# foundation（Phase 0）の実装タスク

段階ごとにユーザーへ報告し、許可を得てからコミットする。**段階が終わったらこのファイルのチェックを更新する。**

---

## 事前準備（ユーザー作業）

コード作業の前に必要。手順は `SETUP.md` の「Phase 0」を参照。

- [x] Neon でプロジェクトを作成する
- [x] 接続文字列を2種類取得する（pooled 用と direct 用）
- [x] `.env` に `DATABASE_URL` と `DIRECT_URL` を設定する

---

## 段階1: Next.js 雛形の作成 ✅

- [x] `create-next-app` で雛形を作る（TypeScript / Tailwind CSS / ESLint / App Router を有効化）
- [x] `npm run dev` で起動し、ブラウザで表示されることを確認する
- [x] `npm run build` が成功することを確認する
- [x] `lib/services/` `lib/repositories/` `lib/clients/` `app/api/` の空ディレクトリを作る
- [x] `.gitignore` に `.env` と `node_modules` が入っているか確認する

**受け入れ基準**: ✅ `http://localhost:3000` が HTTP 200、`npm run build` 成功

### 実施時の記録

- `create-next-app` は空でないディレクトリを拒否するため、一時ディレクトリに生成してから移動した
- 入ったのは **Next.js 16.3.0**（設計時の想定は15）。破壊的変更を `.kiro/steering/architecture.md` に記録した
- `package.json` の name が一時ディレクトリ名になるので `recipe-app` に修正した
- `.gitignore` の `.env*` が `.env.example` まで無視していたため `!.env.example` の例外を追加した

---

## 段階2: Prisma と Neon の接続 ✅

- [x] Prisma を導入する（`prisma` / `@prisma/client`）
- [x] `.env` に `DATABASE_URL` と `DIRECT_URL` を設定する
- [x] `.env.example` を作る（値は空、コメントでフェーズを明記）
- [x] `prisma/schema.prisma` を design.md のとおり書く
- [x] `lib/prisma.ts` に PrismaClient のシングルトンを書く
- [x] `npx prisma migrate dev` を実行し、Neon 上にテーブルが作られることを確認する
- [x] コード経由でNeonに接続できることを確認する（`User=0件, Recipe=0件` を取得）

**受け入れ基準**: ✅ マイグレーション成功、アプリコードからの接続も確認

### 実施時の記録

入ったのは **Prisma 7.9.1** で、設計時に想定した v6 とは構成が大きく異なった。詳細は design.md の「Prisma 7 の構成」を参照。

- `url` / `directUrl` は**スキーマに書けない**（P1012エラー）。CLI用は `prisma.config.ts`、実行時用はドライバアダプタと、**指定箇所が2つに分かれる**
- ジェネレータは `prisma-client`（`prisma-client-js` は非推奨）で `output` が必須。import 元も生成先パスになる
- ドライバアダプタは `@prisma/adapter-pg` を採用。`@prisma/adapter-neon` は実測で遅い場合に検討する
- 接続時に `pg` から `sslmode` の将来変更に関する警告が出るが、現時点では動作に影響しない

> **教訓**: ライブラリのメジャーバージョンは、記憶ではなく実際に入ったものを確認してから書く。

---

## 段階3: 開発ツールの整備

- [ ] Prettier を導入し、設定ファイルを作る
- [ ] ESLint と Prettier が競合しないよう設定する
- [ ] Vitest を導入し、`vitest.config.ts` を作る
- [ ] サンプルテストを1本書き、`npm run test` が通ることを確認する
- [ ] `package.json` の scripts を design.md のとおり整える

**受け入れ基準**: `npm run lint` / `npm run format` / `npm run test` がすべて動く

---

## 段階4: 環境変数の検証

- [ ] 必要な環境変数が欠けている場合に、原因が分かるエラーを出す仕組みを入れる
- [ ] `DATABASE_URL` を空にして、エラーメッセージが分かりやすいことを確認する
- [ ] `git status` に `.env` が出てこないことを確認する

**受け入れ基準**: 環境変数の設定漏れが起動時に分かる

---

## 段階5: 検証と締め

- [ ] requirements.md の受け入れ基準をすべて確認する
- [ ] `npm run build` `npm run lint` `npm run test` をもう一度通す
- [ ] `.kiro/README.md` の実装フェーズ表で foundation を「完了」に更新する
- [ ] ユーザーに報告し、許可を得てから push する

---

## テスト方針

Phase 0 にはビジネスロジックがないため、本格的なテストは書かない。

- [ ] Vitest が動くことを示すサンプルテスト1本のみ
- 実質的なテストは Phase 1 以降、Service 層ができてから書く
