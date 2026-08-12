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

## 段階3: Prettier を導入して `npm run format` でコードを整形できるようにする ✅

- [x] Prettier を導入し、設定ファイル（`.prettierrc.json`）を作る
- [x] ESLint と Prettier が競合しないか確認する → **競合なし。追加設定は不要だった**
- [x] 整形対象から外すものを `.prettierignore` に定義する
- [x] `npm run format` を実行し、実際にコードが整形されることを確認する
- [x] `npm run lint` が引き続き通ることを確認する

**受け入れ基準**: ✅ `prettier --check` / `lint` / `tsc` / `build` がすべて終了コード0

### 実施時の記録

- **`eslint-config-prettier` は不要だった。** 競合を想定して入れたが、`eslint-config-next` 16 は整形ルールを含まないため `npm run lint` は最初から通った。**推測で入れる前に実測すべきだった**ので、確認後にアンインストールした
- **`prettier --write .` が参照ガイド2件（計3300行）を書き換えた。** `kiro-personal-app-guide.md` と `kiro-ai-prompts-template.md` は外部から持ち込んだ資料なので原文のまま保つべき。`git checkout` で戻し、`.prettierignore` に追加した
- `.prettierrc.json` に `prettier-plugin-prisma` を書いたため Prettier が起動しなくなった。設定から消すのではなくプラグインを入れて解決した（`.prisma` ファイルも整形対象になる）
- 自プロジェクトの `.md`（REQUIREMENTS.md / UI_DESIGN.md / .kiro配下 など）は整形対象に含めた。表の桁が揃うため、生のまま読むときに見やすい

---

## 段階4: Vitest を導入して `npm run test` でテストを実行できるようにする

- [ ] Vitest を導入し、`vitest.config.ts` を作る
- [ ] サンプルテストを1本書く
- [ ] `npm run test` が成功することを確認する
- [ ] 意図的に失敗するテストで、失敗が検出されることを確認する

**受け入れ基準**: `npm run test` でテストが実行され、成功と失敗の両方が正しく判定される

---

## 段階5: Phase 0 の受け入れ基準をすべて確認しフェーズ表を完了に更新する

- [ ] requirements.md の Req1〜Req4 の受け入れ基準をすべて確認する
- [ ] `DATABASE_URL` を空にして、原因の分かるエラーが出ることを確認する（実装は段階2で済み）
- [ ] `git status` に `.env` が出てこないことを確認する
- [ ] `npm run build` `npm run lint` `npm run test` をもう一度通す
- [ ] `.kiro/README.md` の実装フェーズ表で foundation を「完了」に更新する
- [ ] ユーザーに報告し、許可を得てから push する

**受け入れ基準**: Req1〜Req4 がすべて満たされ、フェーズ表が更新されている

> 旧「段階4: 環境変数の検証」は、実装が段階2（`lib/prisma.ts`）で完了したためこの段階に統合した。

---

## テスト方針

Phase 0 にはビジネスロジックがないため、本格的なテストは書かない。

- [ ] Vitest が動くことを示すサンプルテスト1本のみ
- 実質的なテストは Phase 1 以降、Service 層ができてから書く
