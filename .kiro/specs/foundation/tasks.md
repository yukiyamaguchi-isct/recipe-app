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

## 段階4: Vitest を導入して `npm run test` でテストを実行できるようにする ✅

- [x] Vitest を導入し、`vitest.config.mts` を作る
- [x] テストを2本書く（Prismaスキーマの検証 / トップページの描画）
- [x] `npm run test` が成功することを確認する
- [x] 意図的に失敗するテストで、失敗が終了コード1で検出されることを確認する

**受け入れ基準**: ✅ `format` / `lint` / `tsc` / `test` / `build` がすべて終了コード0

### 実施時の記録

- **`vite-tsconfig-paths` は不要だった。** Next.js の公式ガイド（`node_modules/next/dist/docs/.../vitest.md`）の手順に従って入れたが、Vitest 実行時に「Vite がネイティブ対応したので `resolve.tsconfigPaths: true` を使え」と警告が出た。**バンドルされている公式ガイドも最新とは限らない**。指示に従って差し替えたところ、**実行時間が 64秒 → 4.8秒 に短縮**された
- 設定ファイルは `.ts` ではなく **`.mts`**（公式ガイドの指定どおり）
- サンプルテストは「捨てにならないもの」を選んだ
  - `__tests__/schema.test.ts` — `Category` enum が3種のままか検証。**`@/*` エイリアスの解決とPrisma生成物のimportも同時に確認できる**
  - `__tests__/page.test.tsx` — DOM側（jsdom + Testing Library + React プラグイン）の疎通確認。対象は差し替わる初期ページなので、文言ではなく「見出しが存在する」ことだけを見る
- `npm run test` は `vitest run`（1回実行）、`npm run test:watch` が監視モード。既定の `vitest` は監視モードで止まらないため、検証手順には `run` を使う

---

## 段階5: Phase 0 の受け入れ基準をすべて確認しフェーズ表を完了に更新する ✅

- [x] requirements.md の Req1〜Req4 の受け入れ基準をすべて確認する（12項目）
- [x] `DATABASE_URL` を空にして、原因の分かるエラーが出ることを確認する（実装は段階2で済み）
- [x] `git status` に `.env` が出てこないことを確認する
- [x] `npm run format` `lint` `tsc` `test` `build` をもう一度通す
- [x] `.kiro/README.md` の実装フェーズ表で foundation を「完了」に更新する
- [x] ユーザーに報告し、許可を得てから push する

**受け入れ基準**: ✅ Req1〜Req4 の12項目すべてを実測で確認、フェーズ表を更新済み

### 実施時の記録

チェックを目視でなく**実際に動かして**確認した。

| 確認項目                  | 方法                                                                           |
| ------------------------- | ------------------------------------------------------------------------------ |
| Tailwind が効いているか   | 開発サーバーから配信CSSを取得し、`.flex` などのユーティリティが生成済みか検査  |
| Neon のテーブル           | `information_schema.tables` を問い合わせ、5テーブルの実在を確認                |
| lint がエラーを検出するか | 未使用変数のあるファイルを一時的に置いて実行                                   |
| DATABASE_URL 未設定時     | dotenv を読まずに `lib/prisma.ts` を import し、日本語のエラーが出ることを確認 |
| `.env.example` の網羅性   | `.env` と変数名を `diff` で突き合わせ                                          |

### 見つかった問題: `npm run lint` が warning では失敗しなかった → 解決済み

未使用変数を置いて `npm run lint` を実行したところ、**検出はされたが warning 扱いで終了コードは0**だった。

```
2:9  warning  'unused' is assigned a value but never used  @typescript-eslint/no-unused-vars
✖ 1 problem (0 errors, 1 warning)
→ 終了コード 0
```

CLAUDE.md の「段階終了前の検証」は「すべて終了コード0」を条件にしているため、**この状態では lint が実質的にゲートとして機能しない**（ハードエラー以外は素通りする）。

**対応（段階6）**: ユーザーの判断を受けて `package.json` の lint スクリプトを `eslint --max-warnings 0` に変更した。

> 旧「段階4: 環境変数の検証」は、実装が段階2（`lib/prisma.ts`）で完了したためこの段階に統合した。

---

## 段階6: `npm run lint` で warning も失敗扱いにする ✅

段階5で見つかった「lint がゲートとして機能していない」問題への対応。

- [x] `package.json` の `lint` を `eslint --max-warnings 0` に変更する
- [x] 現行コードで警告が出ないことを確認する（終了コード0）
- [x] 未使用変数を含むファイルを一時的に置き、**終了コード1で落ちる**ことを確認する

**受け入れ基準**: ✅ 警告なしで0、警告ありで1

### 実施時の記録

- 設定ファイル（`eslint.config.mjs`）ではなく `package.json` のスクリプトを変えた。ルールの追加ではなく**既存の警告を見逃さないようにする**変更なので、ここが最小の変更点になる
- 検証は前後2回実行した。「厳しくしたつもりで実は効いていない」を防ぐため、**落ちることまで確かめる**

---

## テスト方針

Phase 0 にはビジネスロジックがないため、本格的なテストは書かない。

- [x] Vitest が動くことを示すテストのみ（結果的に2本）
- 実質的なテストは Phase 1 以降、Service 層ができてから書く
