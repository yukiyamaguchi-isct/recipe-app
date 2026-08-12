# foundation（Phase 0）の実装タスク

段階ごとにユーザーへ報告し、許可を得てからコミットする。

---

## 事前準備（ユーザー作業）

コード作業の前に必要。

- [ ] Neon でプロジェクトを作成する
- [ ] 接続文字列を2種類取得する（pooled 用と direct 用）

---

## 段階1: Next.js 雛形の作成

- [ ] `create-next-app` で雛形を作る（TypeScript / Tailwind CSS / ESLint / App Router を有効化）
- [ ] `npm run dev` で起動し、ブラウザで表示されることを確認する
- [ ] `npm run build` が成功することを確認する
- [ ] `lib/services/` `lib/repositories/` `lib/clients/` `app/api/` の空ディレクトリを作る
- [ ] `.gitignore` に `.env` と `node_modules` が入っているか確認する

**受け入れ基準**: `http://localhost:3000` が表示され、`npm run build` が通る

---

## 段階2: Prisma と Neon の接続

- [ ] Prisma を導入する（`prisma` / `@prisma/client`）
- [ ] `.env` に `DATABASE_URL` と `DIRECT_URL` を設定する
- [ ] `.env.example` を作る（値は空、コメントでフェーズを明記）
- [ ] `prisma/schema.prisma` を design.md のとおり書く
- [ ] `lib/prisma.ts` に PrismaClient のシングルトンを書く
- [ ] `npx prisma migrate dev` を実行し、Neon 上にテーブルが作られることを確認する
- [ ] `npx prisma studio` でテーブルが見えることを確認する

**受け入れ基準**: マイグレーションが成功し、Neon のコンソールでもテーブルが確認できる

> `directUrl` の書式と Prisma のバージョン要件は公式ドキュメントで確認すること。記憶で書かない。

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
