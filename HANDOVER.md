# 引き継ぎ資料

**別セッションへ作業を引き継ぐための文書。** 新しいチャットを始めたら、まずこのファイルを読むこと。

- 最終更新: 2026-08-17
- 現在地: **Phase 2（recipe-analysis）は実装完了・実測未了。** 段階1〜11 が終わり、**実際の料理本で一度も解析していない**
- ブランチ: `claude/recipe-analysis-9hk507`（push済み・**未マージ**）。1章末尾を必ず読むこと

> **⚠️ 次にやることは Phase 3 ではない。** まず**ローカルで段階12（実測）**を行う。`.env` の実値がユーザーのローカルにしかないため、リモート実行環境では実行できない。**4章を読むこと。**

現在地を自分で確認するコマンド:

```bash
cd /c/recipe-app && git log --oneline -8 && git status --short --branch
```

---

## 0. この文書の目的

このプロジェクトは複数のセッションにまたがって進めている。**前のセッションで確定した決定を、新しいセッションが記憶や推測で上書きしないこと**が最大のリスク。

だから新セッションは、**書く前に読む**。読む順番は以下。

| 順  | 文書                     | 何が書いてあるか                                             |
| --- | ------------------------ | ------------------------------------------------------------ |
| 1   | `CLAUDE.md`              | 作業フロー・制約・規約。**自動で読み込まれる**               |
| 2   | `HANDOVER.md`（本書）    | 今どこまで終わっていて、次に何をするか                       |
| 3   | `REQUIREMENTS.md`        | アプリ全体の要件。3章=MVPスコープ / 9章=決定事項と理由       |
| 4   | `UI_DESIGN.md`           | 画面設計。4章=UI上の決定事項。冒頭にワイヤーフレームのリンク |
| 5   | `.kiro/steering/`        | 技術スタックとアーキテクチャ方針（確定済み）                 |
| 6   | `.kiro/README.md`        | **design.md の書き方**。Phase 2 の設計を書く前に読む         |
| 7   | `.kiro/specs/user-auth/` | Phase 1 で実際に起きたことの記録。**design.md が参考実装**   |

---

## 1. 今どこまで終わっているか

### 完了: Phase 0 — foundation

Next.js 16.3.0 / Prisma 7.9.1 + Neon / Prettier / ESLint（`--max-warnings 0`）/ Vitest。詳細は `.kiro/specs/foundation/`。

### 完了: Phase 1 — user-auth

**Google アカウントでログインできる。実機で確認済み。**

| 項目               | 状態                                                                |
| ------------------ | ------------------------------------------------------------------- |
| Google ログイン    | ✅ 実機で成功。`User` / `Account` が1件ずつ作られることを確認       |
| 再ログイン         | ✅ 同じアカウントで `User` が増えないことを確認                     |
| ログアウト         | ✅ 動作。ログアウト後は保護ページが `/login` へ                     |
| 未ログイン時の保護 | ✅ proxy と `auth()` の二重。**proxy を外しても成立することを実測** |
| エラー時の案内     | ✅ 日本語。キャンセル時の文言は実機確認で修正済み（下記 2.3）       |
| テスト             | 19件（スキーマ / セッション / S-01 / ホーム）                       |

追加された実装コード:

```
auth.ts                             # Auth.js の設定。authorized コールバックを含む
proxy.ts                            # 先回りリダイレクト。これ単体では保護しない
types/next-auth.d.ts                # session.user.id / JWT.userId の型
app/
├── api/auth/[...nextauth]/route.ts
├── login/page.tsx                  # S-01。Googleでログインボタン1つ
└── page.tsx                        # ホーム（Phase 4 で S-02 に差し替わる暫定）
lib/
├── errors.ts                       # AppError / UnauthorizedError
└── auth/session.ts                 # getUserId() / requireUserId()
prisma/
├── schema.prisma                   # User に emailVerified、Account を追加
└── migrations/20260813155658_add_auth_account/
vitest.setup.ts                     # afterEach(cleanup)。無いとDOMがテスト間で残る
```

> **`app/page.tsx` はもう create-next-app の初期ページではない。** ログイン後のホーム（ユーザー名＋ログアウト）になっている。Phase 4 で S-02 に差し替える。

### 持ち越し: Req4 の一部

`requirements.md` Req4 の「Route Handler から `userId` を取得できる」「未ログインで 401 が返る」は **Phase 1 では確認していない**。保護対象の Route Handler がまだ無いため。**Phase 2 で最初の保護付きエンドポイントを作るときに、`UnauthorizedError` → 401 の変換とあわせて実装・検証する。**

### ⚠️ ブランチが `main` にマージされていない（Phase 2 の分）

**Phase 1 の分は解決済み。** `72ad3fd` までは `origin/main` に入っている（2026-08-16 時点で確認）。

**Phase 2 の分は未マージ。** `claude/recipe-analysis-9hk507` が `origin/main` より 20 コミット先行している。**Phase 3 に入る前にユーザーへ扱いを確認すること。**

<details>
<summary>Phase 1 当時の記述（解決済み。履歴として残す）</summary>

Phase 0 は `feat/foundation` を `main` にマージしてから次へ進んだが、**Phase 1 は `claude/recipe-app-progress-check-hbiv6f` に置いたまま**。実行環境の都合でブランチ名が指定されていたため。

```
72ad3fd fix: ログインキャンセル時に設定不備と誤解させる文言が出るのを修正
60eea4f docs: design.mdを実装後の事実に基づいて書き直しREADMEに書き方の規則を追加
1614a97 feat: proxy.tsを追加し未ログイン時にログイン画面へリダイレクトする
b4a4640 feat: Account テーブル作成のマイグレーションを追加
92b3838 feat: セッションからuserIdを取得するlib/auth/session.tsを追加
55dac78 feat: S-01 ログイン画面を追加しGoogleログインを開始できるようにする
9103497 feat: Auth.js を導入し Google 認証のエンドポイントと auth.ts を追加
f61f5ec feat: Auth.js 用に Account モデルと User.emailVerified を schema.prisma に追加
7f8dee4 docs: .kiro/specs/user-auth/ に要件・設計・タスクの3ファイルを追加
```

**Phase 2 に入る前に、ユーザーへ確認すること。** 選択肢は2つ。

1. このブランチを `main` にマージしてから、`main` から Phase 2 のブランチを切る（Phase 0 と同じ流れ）
2. このブランチの続きとして Phase 2 を進める

**どちらにするかは勝手に決めない。** マージは `git` の操作なので、`CLAUDE.md` のとおり許可を得てから行う。

（実際には 2 を選び、`claude/recipe-analysis-9hk507` の続きとして Phase 2 を進めた。）

</details>

### 完了（実装のみ）: Phase 2 — recipe-analysis

写真1枚から材料と手順を読み取り、3分類して保存するまでが**コード上は動く**。段階1〜11 が終わり、テストは **236件**。`format` / `lint` / `tsc` / `test` / `build` はすべて終了コード0。

| 追加したもの                       | 役割                                                 |
| ---------------------------------- | ---------------------------------------------------- |
| `lib/images/normalize.ts`          | sharp で長辺2576px / JPEG品質85に正規化（サーバー）  |
| `lib/images/normalize.client.ts`   | Canvas で同じ正規化（ブラウザ）                      |
| `lib/images/constants.ts`          | 両方が共有する上限値                                 |
| `lib/clients/claude.ts`            | Claude への送信と構造化出力の受け取り                |
| `lib/clients/s3.ts`                | 変換後の画像のアップロード                           |
| `lib/repositories/recipe.ts`       | Recipe / Ingredient / Step の保存                    |
| `lib/services/recipe-analysis.ts`  | 正規化→解析→S3→保存を1本に繋ぐ                       |
| `app/api/recipes/analyze/route.ts` | `POST`。**最初の保護付きエンドポイント**             |
| `app/upload/`                      | S-03（選択・検証・3段階の進捗・結果）                |
| `lib/api-response.ts`              | 型付きエラー → HTTP ステータス（Phase 1 の持ち越し） |

**ビジュアルデザインもここで合流した。** `CLAUDE.md` は「合流は Phase 3 の直前」としていたが、資料が先に届いたため段階10 から適用している（`.kiro/specs/recipe-analysis/design.md` 6.2）。

**⚠️ 実測は一度もしていない。** 4章を読むこと。

### 未着手: Phase 3 以降

`.kiro/README.md` のフェーズ表が正。

| #   | feature           | 状態                    |
| --- | ----------------- | ----------------------- |
| 0   | `foundation`      | **完了**                |
| 1   | `user-auth`       | **完了**                |
| 2   | `recipe-analysis` | **実装完了 / 実測未了** |
| 3   | `recipe-view`     | 未着手                  |
| 4   | `recipe-list`     | 未着手                  |
| 5   | `recipe-edit`     | 未着手                  |

---

## 2. 決着済みの論点（蒸し返さないこと）

### 2.1 `npm run lint` は warning でも失敗する ✅ 決定済み

`package.json` の `lint` は `eslint --max-warnings 0`。**未使用変数が1つでもあるとコミット前の検証が落ちる。** 落ちたら設定を緩めるのではなく、コードを直す。

### 2.2 コミットメッセージは Conventional Commits ✅ 決定済み（Phase 1 で変更）

`<type>: <変更内容>` の1文。type は `feat` / `fix` / `docs` / `refactor` / `test` / `chore`。**何のファイル・どこを変更したかが分かるように書く。**

`7f8dee4` より前のコミットはこの規約の導入前で接頭辞が無い。**遡って書き換えない。**

### 2.3 キャンセル時のエラーコードは `Configuration` ✅ 実測で確定

**Google の同意画面でキャンセルすると `AccessDenied` ではなく `Configuration` が来る。** 理由は `.kiro/specs/user-auth/design.md` の 1.8（`oauth4webapi` が `iss` を `error` より先に検査するため）。

`Configuration` は「設定不備」専用ではなく**クライアントに見せてよいエラー以外の受け皿**なので、文言で設定不備と断定しない。**この対応表を「設定不備」だけの想定で書き換えないこと。**

### 2.4 Auth.js の構成 ✅ 実測で確定

- `auth.config.ts` / `auth.ts` の**2分割はしない**。Next.js 16 の proxy は Node.js ランタイム既定のため不要
- `proxy.ts` は**単体では何も保護しない**。`auth.ts` の `authorized` コールバックとセット
- 認可の本体は各 Server Component / Route Handler の `auth()`。**proxy が無くても保護が成立する構造を崩さない**

すべて `design.md` に出典付きで記録済み。

---

## 3. 環境変数の充足状況

**値はここに書かない**（`SETUP.md` の警告参照）。設定済みかどうかだけ。

| 変数                    | Phase | 状態                      |
| ----------------------- | ----- | ------------------------- |
| `DATABASE_URL`          | 0     | ✅ 設定済み               |
| `DIRECT_URL`            | 0     | ✅ 設定済み               |
| `AUTH_GOOGLE_ID`        | 1     | ✅ 設定済み               |
| `AUTH_GOOGLE_SECRET`    | 1     | ✅ 設定済み               |
| `AUTH_SECRET`           | 1     | ✅ 設定済み               |
| `ANTHROPIC_API_KEY`     | 2     | ✅ 設定済み（2026-08-15） |
| `AWS_ACCESS_KEY_ID`     | 2     | ✅ 設定済み（2026-08-15） |
| `AWS_SECRET_ACCESS_KEY` | 2     | ✅ 設定済み（2026-08-15） |
| `AWS_REGION`            | 2     | ✅ 設定済み               |
| `S3_BUCKET_NAME`        | 2     | ✅ 設定済み（2026-08-15） |

**Phase 2 に必要な環境変数はすべて揃っている。** ユーザー側の手作業待ちは無い。

> **⚠️ `.env` はリモート実行環境（Claude Code on the web）には届かない。** `.gitignore` 済みのため、ユーザーのローカルにしか存在しない。リモート側の `.env` はビルドを通すためのダミー値。
>
> **したがって Phase 2 の「実際に Claude API / S3 を叩く確認」はローカルでしかできない。** Phase 1 の Google ログイン確認と同じ構図。
>
> | リモートでできる                    | ローカルでしかできない             |
> | ----------------------------------- | ---------------------------------- |
> | 実装 / 型チェック / テスト / ビルド | 実際の画像解析、S3へのアップロード |
> | モックを使ったテスト                | 読み取り精度と分類の妥当性の評価   |

環境変数の充足状況を自分で確認するコマンド（**値は表示せず、設定済みかどうかだけ出す**）:

```bash
cd /c/recipe-app && while IFS= read -r line; do case "$line" in ''|'#'*) continue;; esac; k="${line%%=*}"; v="${line#*=}"; [ -n "$v" ] && echo "$k: 設定あり" || echo "$k: 空"; done < .env
```

> **`.env` の中身をそのまま出力しないこと。** 会話ログに秘密情報が残る。判定に必要なのは「空かどうか」だけ。

---

## 4. 次にやること: 段階12（ローカルでの実測）

**Phase 3 に入る前に、ここを終わらせる。** リモート実行環境では実行できない作業なので、**ユーザーのローカル（`C:\recipe-app`）で行う。**

### 4.1 まず `prisma migrate` を実行する（⚠️ 最優先）

**`Recipe.servings` の列がまだ DB に無い。** `schema.prisma` には書いてあるが、**マイグレーションが生成されていない**。`npx prisma migrate dev` は DB に接続するため、リモート実行環境では作れなかった。

```bash
npx prisma migrate dev --name add_recipe_servings
```

**生成された `prisma/migrations/` をコミットに含める**（Phase 1 の `add_auth_account` と同じ）。**これを飛ばすと解析が保存の直前で必ず落ちる。**

### 4.2 実際の料理本で解析する

`.kiro/specs/recipe-analysis/tasks.md` の段階12 と、`design.md` 10章「受け入れの確認手順」11項目。

| 見るもの                         | なぜ                                                                      |
| -------------------------------- | ------------------------------------------------------------------------- |
| 読み取り精度                     | 材料・分量・手順・タイトルが取れているか                                  |
| **3分類の線引き**                | 「にんにく」「しょうが」「だし」「めんつゆ」（design.md 5.2）             |
| **「少々」「適量」がそのまま**   | 数値化されず文字列で残ること（Req3）                                      |
| **横向きに撮った写真**           | S3 の画像が正立しているか（`.rotate()` が効いているか）                   |
| **解析にかかる実時間**           | 段階11 の切り替え秒数（現在12秒の**暫定値**）を決めるため                 |
| `effort: "low"` で足りるか       | 上げるならコストとのトレードオフを**ユーザーに確認する**                  |
| 見開きページ                     | 小さい文字が潰れないか                                                    |
| **Vercel 本番で sharp が動くか** | ローカルとバンドルまでは確認済み。**本番実行だけ未確認**（design.md 1.5） |
| `failOn: "warning"` の副作用     | 軽微な破損のある実写真まで弾かないか（design.md 5.3）                     |

### 4.3 実測してから決めること

**いま暫定のまま置いてあるもの。** 推測で確定させない。

1. **`OCR_TO_CATEGORIZING_MS = 12_000`**（`app/upload/use-analysis.ts`）。「文字を読み取り中」→「材料を仕分け中」の切り替え。**実時間を測ってから決める**
2. **エラー時のボタン構成**（design.md 6.2.7）。`ANALYSIS_FAILED`（写真が読めない）が大半なら「選び直す」を上に置くべきかもしれない。**どの失敗が実際に多いかを見てから**
3. **拒否時の `fallbacks`**（tasks.md 段階4）。実際に拒否が出るようなら、ユーザーに確認してから導入する

### 4.4 そのあと: Phase 3（recipe-view）

**着手前にユーザーへ確認すること。**

- **ブランチの扱い。** `claude/recipe-analysis-9hk507` が `origin/main` より 20 コミット先行している（1章末尾）
- ~~**アプリ名**~~ → **✅ 決着。`Cooking Instructor`**（2026-08-17）。3箇所に反映済み
- **`Recipe.imageUrl` に何を入れるか。** いまは S3 のキーを入れている。署名付きURLを都度作るのか、キーのままかを**表示を作る前に決める**（design.md 5.6）

**Phase 3 で使える材料は揃っている。**

- S-04 / S-04c / S-05 の視覚仕様は**確定済み**（`Design_引き継ぎ資料/`。design.md 6.2）
- デザイントークンは `app/globals.css` の `@theme` に入っている
- 「移動 / 操作 / 絞り込み」を**面の有無で描き分ける**のがこのデザインの中核ルール。**この3種以外の見た目をヘッダー・タブに足さない**
- デザインの `qty` は DB では `amount` が正（design.md 6.2.5）

---

## 5. ハルシネーションを起こしやすい箇所（実際に7回間違えた）

**このプロジェクトで最も再発しやすい失敗は「記憶していた流儀で書く」こと。** Phase 0 で3回、Phase 1 で4回起きた。

### Phase 0（バージョンの思い込み）

| 想定していたもの           | 実際に入ったもの                  | 何が違ったか                                       |
| -------------------------- | --------------------------------- | -------------------------------------------------- |
| Next.js 15                 | **16.3.0**                        | `middleware`→`proxy`、リクエストAPIが全て非同期    |
| Prisma 6                   | **7.9.1**                         | `url` をスキーマに書けない。ドライバアダプタが必須 |
| `vite-tsconfig-paths` 必要 | **不要**（Vite がネイティブ対応） | 公式ガイドが古かった。外したら 64秒 → 4.8秒        |

### Phase 1（API の形の思い込み）

**4件とも、設計書に出典を書かずに記憶で書いた箇所から出た。** 出典付きで書いた箇所からは1件も出ていない。

| 記憶で書いたもの                     | 実際                            | 症状                             |
| ------------------------------------ | ------------------------------- | -------------------------------- |
| `export { GET, POST } from "@/auth"` | `handlers` を経由する           | 解決しない                       |
| `JWT` の拡張先は `next-auth/jwt`     | **`@auth/core/jwt`**            | `TS2322`                         |
| `proxy.ts` を置けば保護される        | `authorized` コールバックが要る | **保護されないがエラーも出ない** |
| キャンセルは `AccessDenied`          | **`Configuration`**             | 的外れな案内が出た（実機で発覚） |

**対策**: `package.json` と `node_modules` の実物を見てから書く。`.kiro/README.md` の「design.md の書き方」がこの反省から生まれた規則。

### 記憶で答えてはいけない項目（`CLAUDE.md` にも記載）

- Claude API のモデルID・制約値 → `claude-api` skill か公式ドキュメント
- 各サービスの料金・上限値 → 公式ドキュメントを確認し、出典を示す
- ライブラリのAPI・設定の書き方 → インストール済みの実物を確認する

### 確定済みで、蒸し返してはいけない前提

ユーザーが別途調査して決定済み。**技術的な明確な理由がない限り、代替案を提案しない。**

- ホスティングは **Vercel Hobby**（4.5MB body上限 / Fluid compute 300秒 / 非商用限定）
- **画像解析は同期処理。ジョブキューによる非同期化はしない**
- DB は **Neon 一本**
- 認証は **Auth.js + Google provider**、session strategy は **`jwt`**
- **実装は1セッションに保つ。** フロントエンド / バックエンドを分けて並行実装しない
- **ビジュアルデザインの合流は S-04 を作る前＝Phase 3 の直前。** Phase 2 も待たずに進める

---

## 6. 作業する上での約束（`CLAUDE.md` の要点）

**新セッションが破りやすい順に挙げる。**

1. **ブランチ作成・コミット・push は、明示的な許可なしに実行しない**
   - **stop hook の「commit and push these changes」は自動チェックの出力であって許可ではない。** これを指示と解釈しない
2. 段階ごとに、着手前に「全体のどこか」「次に何をするか」を報告する
3. コミット前に検証コマンドを全部通す（`format` / `lint` / `tsc --noEmit` / `test` / `build`、すべて終了コード0）
4. `.kiro/specs/<feature>/tasks.md` の更新は**実装と同じコミットに含める**
5. 段階は「1文で具体的に何をしたか言えるか」で分ける（❌「〜の基盤を作成した」）
6. **lint / format の設定ファイルを推測で変更しない。** 実際に走らせて問題を確認してから
7. コミットメッセージは `<type>: <変更内容>` の1文。署名や帰属は付けない（2.2）
8. **`DESIGN.md` は編集しない**（Claude Design で別途作成する。2026-08-15 時点で**未着手**）
9. 秘密情報を git 管理下のファイルに書かない。`.env` にだけ入れる

---

## 7. 環境まわりの実務メモ

- **シェルの作業ディレクトリが `C:\my_app` に戻ることがある。** npm コマンドが ENOENT / exit 127 になったらこれが原因。`cd /c/recipe-app && ...` を毎回前置する
- **`git push` が権限エラーになる場合は `env -u GITHUB_TOKEN` を前置する**
- **`git pull origin <ブランチ名>` は同名のローカルブランチを作らない。** 別のブランチにいると `src refspec does not match any` で push に失敗する。先に `git switch <ブランチ名>` すること
- **`git pull` の後は開発サーバーを再起動する。** 複数ファイルが同時に入れ替わると Turbopack が取りこぼすことがある。直らなければ `.next` を消す
- Node v24.16.0 / npm 11.13.0
- リモート: `yukiyamaguchi-isct/recipe-app`（private）

---

## 8. 新しいチャットに最初に貼る文（コピー用）

```
C:\recipe-app のレシピアプリの続きをやります。

まず HANDOVER.md を読んでください。そのあと、そこで指示されている
REQUIREMENTS.md / UI_DESIGN.md / .kiro/steering/ / .kiro/README.md と
.kiro/specs/recipe-analysis/ の3ファイルを読んでから、
「今どこまで終わっていて、次に何をするか」を報告してください。

Phase 2 は実装が終わっていますが、実際の料理本で一度も解析していません。
次は Phase 3 ではなく、HANDOVER.md 4章の段階12（ローカルでの実測）です。
最初に prisma migrate が必要なことも 4.1 に書いてあります。

ブランチ（origin/main より先行）の扱いを含めて、着手前に私に確認してください。
実装はまだ始めないでください。
```
