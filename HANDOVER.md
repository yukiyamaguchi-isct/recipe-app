# 引き継ぎ資料

**別セッションへ作業を引き継ぐための文書。** 新しいチャットを始めたら、まずこのファイルを読むこと。

- 最終更新: 2026-08-13
- 現在地: **Phase 0（foundation）完了 / Phase 1（user-auth）未着手**
- ブランチ: `feat/foundation` は `main` にマージ済み・push済み。**次のフェーズは `main` から切る**

現在地を自分で確認するコマンド:

```bash
cd /c/recipe-app && git log --oneline -5 && git status --short --branch
```

---

## 0. この文書の目的

このプロジェクトは複数のセッションにまたがって進めている。**前のセッションで確定した決定を、新しいセッションが記憶や推測で上書きしないこと**が最大のリスク。

だから新セッションは、**書く前に読む**。読む順番は以下。

| 順  | 文書                      | 何が書いてあるか                                       |
| --- | ------------------------- | ------------------------------------------------------ |
| 1   | `CLAUDE.md`               | 作業フロー・制約・規約。**自動で読み込まれる**         |
| 2   | `HANDOVER.md`（本書）     | 今どこまで終わっていて、次に何をするか                 |
| 3   | `REQUIREMENTS.md`         | アプリ全体の要件。3章=MVPスコープ / 9章=決定事項と理由 |
| 4   | `UI_DESIGN.md`            | 画面設計。4章=UI上の決定事項                           |
| 5   | `.kiro/steering/`         | 技術スタックとアーキテクチャ方針（確定済み）           |
| 6   | `.kiro/specs/foundation/` | Phase 0 で実際に起きたことの記録                       |

---

## 1. 今どこまで終わっているか

### 完了: Phase 0 — foundation

動くようになったもの（すべて**実際にコマンドを走らせて**確認済み）。

| 項目           | 状態                                                           |
| -------------- | -------------------------------------------------------------- |
| Next.js 16.3.0 | `npm run dev` / `npm run build` 成功。Tailwind の生成CSSも確認 |
| Prisma 7.9.1   | Neon へマイグレーション実行済み。5テーブル実在を SQL で確認    |
| Prettier       | `npm run format` で整形される                                  |
| ESLint         | `npm run lint` が動く（⚠️ 2.1 の未決事項あり）                 |
| Vitest 4.1.10  | `npm run test` でテスト2本成功                                 |
| 環境変数       | `.env.example` に全変数を列挙。`.env` は git 管理外            |

現在のファイル構成（実装分のみ）:

```
app/
├── layout.tsx, page.tsx, globals.css   # create-next-app の初期状態のまま
└── api/.gitkeep                        # 空。Route Handlers はここに置く
lib/
├── prisma.ts                           # PrismaClient シングルトン（唯一の実装コード）
├── services/.gitkeep                   # 空
├── repositories/.gitkeep               # 空
└── clients/.gitkeep                    # 空
prisma/
├── schema.prisma                       # User / Recipe / Ingredient / Step / Category
└── migrations/20260812195541_init/
__tests__/
├── schema.test.ts                      # Category enum の検証（@/* エイリアスの疎通も兼ねる）
└── page.test.tsx                       # jsdom + Testing Library の疎通確認
```

> **アプリの機能コードはまだ1行も無い。** `app/page.tsx` は create-next-app の初期ページのまま。

### 未着手: Phase 1 以降

`.kiro/README.md` のフェーズ表が正。

| #   | feature           | 状態     |
| --- | ----------------- | -------- |
| 0   | `foundation`      | **完了** |
| 1   | `user-auth`       | 未着手   |
| 2   | `recipe-analysis` | 未着手   |
| 3   | `recipe-view`     | 未着手   |
| 4   | `recipe-list`     | 未着手   |
| 5   | `recipe-edit`     | 未着手   |

---

## 2. 決着済みの論点（蒸し返さないこと）

Phase 0 の終了時に未決だった2件は、いずれもユーザーが判断済み。

### 2.1 `npm run lint` は warning でも失敗する ✅ 決定済み

未使用変数を置いて実測したところ、当初は **warning 扱いで終了コードが 0** になり、`CLAUDE.md` の「すべて終了コード0」という検証条件をすり抜けていた。

**対応: `package.json` の `lint` を `eslint --max-warnings 0` に変更した。**

```
✖ 1 problem (0 errors, 1 warning)
ESLint found too many warnings (maximum: 0).   → 終了コード 1
```

**未使用変数が1つでもあるとコミット前の検証が落ちる。** 落ちたら設定を緩めるのではなく、コードを直す。

### 2.2 `main` へマージ済み ✅ 決定済み

`feat/foundation` は `main` に fast-forward マージして push 済み。**次のフェーズのブランチは `main` から切る。**

---

## 3. 環境変数の充足状況

**値はここに書かない**（`SETUP.md` の警告参照）。設定済みかどうかだけ。

| 変数                    | Phase | 状態                                  |
| ----------------------- | ----- | ------------------------------------- |
| `DATABASE_URL`          | 0     | ✅ 設定済み                           |
| `DIRECT_URL`            | 0     | ✅ 設定済み                           |
| `AUTH_GOOGLE_ID`        | 1     | ✅ 設定済み                           |
| `AUTH_GOOGLE_SECRET`    | 1     | ✅ 設定済み                           |
| `AUTH_SECRET`           | 1     | ❌ **空**                             |
| `ANTHROPIC_API_KEY`     | 2     | ❌ 空（未着手フェーズなので問題なし） |
| `AWS_ACCESS_KEY_ID`     | 2     | ❌ 空（同上）                         |
| `AWS_SECRET_ACCESS_KEY` | 2     | ❌ 空（同上）                         |
| `AWS_REGION`            | 2     | ✅ 設定済み                           |
| `S3_BUCKET_NAME`        | 2     | ❌ 空（同上）                         |

### ⚠️ Phase 1 に入る前にユーザーがやること

**`AUTH_SECRET` の生成が残っている。** これが無いと Auth.js のセッション署名ができない。

```bash
npx auth secret
```

出力を `.env` の `AUTH_SECRET=` に貼る。詳細は `SETUP.md` の Phase 1。

---

## 4. 次にやること: Phase 1（user-auth）

### やること

Google アカウントでログインできるようにする。session strategy は **`jwt`**（将来のモバイルアプリを見据えた決定。`REQUIREMENTS.md` 9章）。

### コードを書く前に必ず調べること

**記憶で設計を書かないこと。** 以下は公式ドキュメント（https://authjs.dev）で確認してから design.md を書く。

1. **Auth.js が Next.js 16 に対応しているか。**
   Next.js 16 で `middleware` が `proxy` に改名され、edge ランタイムが廃止された（`.kiro/steering/architecture.md` の破壊的変更表）。**Auth.js の一般的な構成はこの2点に依存しているため、影響を受ける可能性が高い。** 対応状況次第で設計が変わる
2. **Auth.js が要求する Prisma のモデル定義。**
   現在の `schema.prisma` には `User` しかない。`Account` / `Session` / `VerificationToken` が必要かどうかは、アダプタを使うか・`jwt` 戦略かで変わる。**現行スキーマとの差分を実際のドキュメントで確認する**
3. **Auth.js のバージョン。** v5（`next-auth@beta`）がまだ beta のままかを npm で確認する

### 手順（`CLAUDE.md` の Workflow に従う）

```
1. ユーザーに「Phase 1 に入る」と報告し、ブランチ作成の許可を得る
2. main から feat/user-auth を作成
3. 上記の調査を行う
4. .kiro/specs/user-auth/ に requirements.md / design.md / tasks.md を作成
5. 段階に分けて実装 → 各段階で検証 → 報告 → 許可を得てコミット
6. 全段階完了 → バグ検証 → 報告 → 許可を得て push
```

---

## 5. ハルシネーションを起こしやすい箇所（実際に3回間違えた）

**このプロジェクトで最も再発しやすい失敗は「記憶していたバージョンの流儀で書く」こと。** Phase 0 だけで3回起きた。

| 想定していたもの           | 実際に入ったもの                  | 何が違ったか                                       |
| -------------------------- | --------------------------------- | -------------------------------------------------- |
| Next.js 15                 | **16.3.0**                        | `middleware`→`proxy`、リクエストAPIが全て非同期    |
| Prisma 6                   | **7.9.1**                         | `url` をスキーマに書けない。ドライバアダプタが必須 |
| `vite-tsconfig-paths` 必要 | **不要**（Vite がネイティブ対応） | 公式ガイドが古かった。外したら 64秒 → 4.8秒        |

**対策**: `package.json` と `node_modules` の実物、または公式ドキュメントを見てから書く。Next.js に同梱されているガイドですら古いことがあった。

### 記憶で答えてはいけない項目（`CLAUDE.md` にも記載）

- Claude API のモデルID・制約値 → `claude-api` skill か公式ドキュメント
- 各サービスの料金・上限値 → 公式ドキュメントを確認し、出典を示す
- ライブラリのAPI・設定の書き方 → インストール済みの実物を確認する

### 確定済みで、蒸し返してはいけない前提

ユーザーが別途調査して決定済み。**技術的な明確な理由がない限り、代替案を提案しない。**

- ホスティングは **Vercel Hobby**（4.5MB body上限 / Fluid compute 300秒 / I/O待ちは Active CPU 課金対象外 / 非商用限定）
- **画像解析は同期処理。ジョブキューによる非同期化はしない**
- DB は **Neon 一本**（他のDBを混ぜない）
- 認証は **Auth.js + Google provider**、session strategy は **`jwt`**

---

## 6. 作業する上での約束（`CLAUDE.md` の要点）

**新セッションが破りやすい順に挙げる。**

1. **ブランチ作成・コミット・push は、明示的な許可なしに実行しない**
2. 段階ごとに、着手前に「全体のどこか」「次に何をするか」を報告する
3. コミット前に検証コマンドを全部通す（`format` / `lint` / `tsc --noEmit` / `test` / `build`、すべて終了コード0）
4. `.kiro/specs/<feature>/tasks.md` の更新は**実装と同じコミットに含める**
5. 段階は「1文で具体的に何をしたか言えるか」で分ける（❌「〜の基盤を作成した」）
6. **lint / format の設定ファイルを推測で変更しない。** 実際に走らせて問題を確認してから
7. コミットメッセージは1文。署名や帰属は付けない
8. **`DESIGN.md` は編集しない**（別セッションが作成中。2026-08-13 時点で未着手）
9. 秘密情報を `SETUP.md` などの git 管理下のファイルに書かない。`.env` にだけ入れる

---

## 7. 環境まわりの実務メモ

- **シェルの作業ディレクトリが `C:\my_app` に戻ることがある。** npm コマンドが ENOENT / exit 127 になったらこれが原因。`cd /c/recipe-app && ...` を毎回前置する
- **`git push` が権限エラーになる場合は `env -u GITHUB_TOKEN` を前置する。** 環境変数の `GITHUB_TOKEN` に push 権限がないため、keyring 側の認証情報を使わせる

```bash
env -u GITHUB_TOKEN git push -u origin feat/user-auth
```

- Node v24.16.0 / npm 11.13.0
- リモート: `yukiyamaguchi-isct/recipe-app`（private）

---

## 8. 新しいチャットに最初に貼る文（コピー用）

```
C:\recipe-app のレシピアプリの続きをやります。

まず HANDOVER.md を読んでください。そのあと、そこで指示されている
REQUIREMENTS.md / UI_DESIGN.md / .kiro/steering/ を読んでから、
「今どこまで終わっていて、次に何をするか」を報告してください。

未決事項が2件あるので、着手前に私に確認してください。
実装はまだ始めないでください。
```
