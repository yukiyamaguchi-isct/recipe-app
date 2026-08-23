# recipe-analysis（Phase 2）の実装タスク

段階ごとにユーザーへ報告し、許可を得てからコミットする。**段階が終わったらこのファイルのチェックを更新する。**

> **このファイルは作業ログ。設計の「正」は design.md。** フェーズ完了時に、以降も参照する内容は design.md 本体へ還元する（`.kiro/README.md` の「design.md の書き方」6）。ここの記録は「どの段階で何が分かったか」の履歴として残す。

---

## このフェーズの分け方

`REQUIREMENTS.md` 4.2〜4.6 を、**下から上へ**積む。`lib/` の部品を先に揃え、それを繋ぐ Service、その上に Route Handler、最後に画面という順序にした。

理由は検証のしやすさ。**画面から作ると、失敗したときに「画像処理が悪いのか、API呼び出しが悪いのか、画面が悪いのか」が切り分けられない。** 部品ごとにテストを付けて上に積めば、落ちた層がそのまま原因になる。

| 層              | 段階  | 何ができるようになるか                |
| --------------- | ----- | ------------------------------------- |
| 準備            | 1     | 依存が入り、実物のAPIが分かっている   |
| エラー変換      | 2     | 型付きエラーが HTTP ステータスになる  |
| 部品（lib）     | 3〜6  | 正規化 / 解析 / S3 / 保存が個別に動く |
| 繋ぎ（Service） | 7     | 1本の流れとして動く                   |
| 入口（Route）   | 8     | HTTP から叩ける。未ログインで401      |
| 画面（S-03）    | 9〜11 | ブラウザから使える                    |
| 実測            | 12    | 実際の料理本で精度が確認できている    |

---

## 事前準備（ユーザー作業）

- [x] `.env` に `ANTHROPIC_API_KEY` を設定する（`SETUP.md` の Phase 2 / 2026-08-15 完了）
- [x] `.env` に `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` / `S3_BUCKET_NAME` を設定する（2026-08-15 完了）
- [x] S3 バケットの CORS とアクセス権限を確認する（`npm run check:s3` で確認できるようにした）

> **⚠️ 並行ブランチ `feat/recipe-analysis` は使わない**（2026-08-16 決着）。このブランチを正とし、向こうにしかなかった発見は design.md 1.5 に取り込み済み。**あちらの9段階の tasks.md を参照しないこと。**

> **⚠️ このフェーズは「リモートで実装、ローカルで実測」に分かれる。** `.env` の実値はユーザーのローカルにしかない（`HANDOVER.md` 3章）。
>
> | リモート実行環境でできる                            | ローカルでしかできない                          |
> | --------------------------------------------------- | ----------------------------------------------- |
> | 実装 / `format` / `lint` / `tsc` / `test` / `build` | 実際の Claude API 呼び出し、S3 へのアップロード |
> | モックを使ったテスト                                | 読み取り精度と3分類の妥当性、30秒の体感         |
>
> **リモート側には `.env` が存在しない。** ダミー値の `.env` を作らないと `prisma generate` が落ち、`tsc` と `test` が連鎖して落ちる。詳細は design.md 9.1。

---

## 段階1: Phase 2 の依存を追加して実物のAPIを design.md に反映する

**着手前の最優先事項**（`HANDOVER.md` 4章）。design.md の `⚠️ 未検証` のうち、コードを書く前に潰せるものを潰す。

- [x] `@anthropic-ai/sdk` / `sharp` / `@aws-sdk/client-s3` / `zod` を追加する
- [x] `sharp` を実際に動かし、リサイズ・拡大しない・`.rotate()` の3点を確認する
- [x] `@aws-sdk/client-s3` の `S3Client` / `PutObjectCommand` と、環境変数からの認証情報解決を確認する
- [x] `@anthropic-ai/sdk` の型定義で `messages.parse` / `output_config` / `parsed_output` / `StopReason` / `timeout` を確認する
- [x] 確認結果を design.md 1.5 / 1.6 / 1.7 に反映する（`⚠️ 未検証` → `✅ 実測`）
- [x] 落とし穴の一覧に #12 / #13 と 9.1（環境側）を追加する

**受け入れ基準**: `format` / `lint` / `tsc` / `test` / `build` がすべて終了コード0

### 実施時の記録

- 入ったのは `@anthropic-ai/sdk@0.117.1` / `sharp@0.35.3`（libvips 8.18.3）/ `@aws-sdk/client-s3@3.1111.0` / `zod@4.4.3`
- **design.md 1.2〜1.4 の記述は、型定義と突き合わせて誤りが1件も無かった。** `claude-api` skill を出典として書いた節だったため。Phase 1 の「出典付きの節からは誤りが出ない」という傾向と一致する
- **`.rotate()` の失敗モードは design.md の記述より悪かった。** 省いた場合、寸法が横倒しのままなだけでなく **EXIF の `orientation` タグ自体が消える**（sharp は既定でメタデータを引き継がない）。元画像を保持しない方針なので後から救えない。9章 #4 を書き換えた
- **「`npm run build` が通った」は sharp の Vercel 対応の根拠にならない。** この段階ではまだ import するコードが無く、バンドルに含まれていない。段階3 で再確認する（落とし穴 #13 として記録）
- **リモート環境に `.env` が無く、検証コマンドが3段階に連鎖して落ちた。** `prisma generate` 失敗 → `generated/prisma` 欠落で `tsc` 失敗、さらに `.next` 未生成で `LayoutProps` が解決できず `tsc` 失敗。ダミー `.env` を作り `prisma generate` → `npm run build` の順で解消した。design.md 9.1 に記録
- リモートの Node は v22.22.2。ユーザーのローカルは v24.16.0（`HANDOVER.md` 7章）。**sharp はネイティブバイナリなので、この差が効く可能性がある**

---

## 段階2: 型付きエラーを `{ success, data, error }` と HTTPステータスに変換する `lib/api-response.ts` を追加する

**Phase 1 からの持ち越し**（requirements.md Req7 / `HANDOVER.md` 1章）。`UnauthorizedError` → 401 の変換をここで実装する。

- [x] `lib/errors.ts` に Phase 2 のエラーを追加する（`InvalidImageError` / `ImageTooLargeError` / `UnsupportedFormatError` / `AnalysisFailedError` / `AnalysisTimeoutError` / `AnalysisRefusedError` / `StorageFailedError`）
- [x] `lib/api-response.ts` に成功・失敗のレスポンス組み立てを追加する（`.kiro/steering/architecture.md` の形）
- [x] design.md 5.4 の `STATUS` 表のとおりにコードとステータスを対応させる
- [x] **内部エラーの詳細（スタックトレース / APIキー / バケット名）が `error.message` に載らないこと**をテストで固定する
- [x] 各エラーが期待する HTTP ステータスに変換されることをテストする
- [x] design.md 5.4 の抜け（`ANALYSIS_REFUSED`）と 7章の抜け（`INVALID_IMAGE` / `INTERNAL_ERROR`）を補い、5.5 を追加する

**受け入れ基準**: `format` / `lint` / `tsc` / `test` が終了コード0

### 実施時の記録

- **design.md 5.4 の `STATUS` 表から `ANALYSIS_REFUSED` が抜けていた。** 7章のエラー表には載っているのに対応表に無く、そのまま実装すると拒否だけ 500 になっていた。**対応表に無いコードは 500 にフォールバックするため、型でもテストでも捕まらない**種類の抜け。422 を割り当てた（「リクエストは正しいが内容を処理できない」で `ANALYSIS_FAILED` と同じ性質）
- 同じ抜けの再発を防ぐため、**`lib/errors.ts` の全エラーが対応表に載っていることをテストで固定した。** `Object.values(errors)` から `AppError` のサブクラスだけを取り出して `statusFor()` が 500 でないことを確認する。Phase 1 のスキーマテストと同じ「型で捕まらないぶんの担保」
- **このテストが実際に欠落を捕まえることを確認した。** `STORAGE_FAILED: 502` を対応表から一時的に削ると `STORAGE_FAILED が対応表に無い: expected 500 not to be 500` で落ちる。確認後に戻した
- **`AppError` に `cause` を足した**（design.md 5.5）。`message` はユーザーに出る日本語、`cause` は外部APIの生メッセージでログにだけ出す、と役割を分けた。**Phase 2 のサブクラスは `message` を引数で受け取らない**設計にしてある。`new StorageFailedError(s3Error.message)` という自然に見える書き方を、そもそも書けなくするため
- `it.each` の書式で詰まった。配列の配列（`[[error, status]]`）に `$code` と `%i` を混ぜるとテスト名が `'STORAGE_FAILED' は NaN を返す` になる。**オブジェクトの配列にして `$error.code` / `$status` で統一した**
- 既存の `UnauthorizedError` は `message` を引数で受け取る形のまま残した。Phase 1 のコードが呼んでいるため。**Phase 2 のエラーとは書き方が違う**が、意図的

---

## 段階3: sharp で画像を長辺2576px / JPEG品質85に正規化する `lib/images/normalize.ts` を追加する

- [x] `.rotate()` → `resize({ fit: "inside", withoutEnlargement: true })` → `jpeg({ quality: 85 })` の順で実装する
- [x] JPEG / PNG 以外を弾く（`UnsupportedFormatError`）
- [x] 10MB 超を弾く（`ImageTooLargeError`）
- [x] テスト: 長辺2576pxに収まる / 2576px未満を拡大しない / **`.rotate()` で EXIF 回転が適用される**
- [x] **`npm run build` を実行し、sharp を import した状態でビルドが通ることを確認する**（design.md 1.5 の ⚠️ / 落とし穴 #13）
- [x] 定数を `lib/images/constants.ts` に切り出す（クライアント側と共有するため）

**受け入れ基準**: `format` / `lint` / `tsc` / `test` / `build` がすべて終了コード0

> **⚠️ ここが sharp の Vercel 対応を判定する段階。** ビルドが落ちた場合、design.md 1.5 の代替（WASM 版 / クライアント側のみ）へ切り替える判断が要る。**判断はユーザーに確認してから行う。**

### 実施時の記録

- **落とし穴 #13 がこの段階でも再現した。** `normalize.ts` を追加して `npm run build` は通ったが、`.next` を検索しても `sharp` が出てこなかった。**Next.js はルートから到達できるモジュールしかバンドルしない**ため、テストからしか import していない状態ではビルドが通って当然だった
- そこで**使い捨ての Route Handler を一時的に置いて** `normalizeImage` を import させ、ビルド出力を検査した。**確認後に削除済み**（`git status` で残っていないことを確認）
- 結果、`route.js.nft.json` に **`sharp-linux-x64-0.35.3.node` と `libvips-cpp.so.8.18.3` が含まれていた。** nft のトレースが Vercel の同梱ファイルを決めるので、**「本番で `Cannot find module sharp`」という最悪の失敗は起きない。** glibc 版と musl 版の両方が追跡されている。design.md 1.5 に再現手順ごと記録
- **`app/api/__sharp-probe/` は Next.js のルートとして認識されなかった。** `_` 始まりのフォルダは App Router の private folder として routing から除外される。`sharp-probe` に改名して解決
- **`failOn` の既定は `"warning"`。** sharp の型定義（`lib/index.d.ts` L992-996）に「信頼できない入力には既定の warning を使え」と明記されていたので緩めなかった。**副作用として軽微な破損のある実写真も弾く可能性があるため、段階12 で実測する**
- **形式判定は宣言された MIME ではなく先頭バイトで行う**ようにした。`Content-Type: image/jpeg` と書いて HEIC を送るのは開発者ツールから簡単にできるため。HEIF は ISO-BMFF の `ftyp` ブランドで見分ける
- **定数を `lib/images/constants.ts` に切り出した。** `normalize.ts` に置いたままクライアント側から import すると、**sharp がブラウザ向けバンドルに混入する**
- **テストが `.rotate()` の欠落を捕まえることを確認した。** 一時的に外すと「Orientation=6 の横長画像が縦長になる」（`expected 1000 to be 500`）と「回転してから長辺を測る」（`expected 1932 to be 2576`）の2件が落ちる。確認後に戻した

---

## 段階4: Claude API にレシピ画像を送り構造化データを受け取る `lib/clients/claude.ts` を追加する

- [x] Zod スキーマ（`title` / `ingredients[]` / `steps[]` / `isRecipe`）を定義する
- [x] `messages.parse()` で `output_config: { effort: "low", format: zodOutputFormat(...) }` を送る
- [x] クライアントを `timeout: 50_000`（**ミリ秒**）/ `maxRetries: 0` で作る
- [x] **画像ブロックをテキストブロックより前に置く**（落とし穴 #11）
- [x] `temperature` / `top_p` / `top_k` を送らない（落とし穴 #1）
- [x] `stop_reason === "refusal"` で `AnalysisRefusedError` を投げる
- [x] `parsed_output` が `null` なら `AnalysisFailedError` を投げる
- [x] `isRecipe: false` なら `AnalysisFailedError` を投げる
- [x] プロンプトを書く（design.md 5.2。**形式の指示は書かない**）
- [x] テスト: 拒否時に投げる / `parsed_output` が null で投げる / **Zod の `Category` 3値が Prisma の enum と一致する**
- [x] **API を実際に叩くテストは書かない**（design.md 8章）
- [x] `max_tokens` を 16000 に訂正し、`thinking` を切らない方針を design.md に反映する

**受け入れ基準**: `format` / `lint` / `tsc` / `test` が終了コード0

### 実施時の記録

- **`claude-api` skill から design.md への訂正が1件出た。`max_tokens: 8000` では足りない。** `max_tokens` は thinking と本文の**合計**への上限で、Opus 5 は thinking が既定でON。skill の推奨は非ストリーミングで ~16000。**下げすぎると `stop_reason: "max_tokens"` で本文が切れ、structured outputs のパースに失敗して `parsed_output` が null になる**（原因が「画像が読めない」に見えてしまう）。16000 に直し、両者を別の `cause` で投げ分けた
- **`thinking` を切ってはいけないことが分かった。** Opus 5 で `thinking: {type:"disabled"}` にすると、(1) tool 呼び出しが本文テキストとして出て**エラーも出ずに実行されない**、(2) `<thinking>` タグが画面向けの本文に漏れる、の2つが起きる。コストを下げたいときは **`thinking` ではなく `effort` を下げる**。落とし穴 #15 として記録。**このフェーズでは `thinking` を一切指定しない**
- **`stop_details` で分岐してはいけない。** 拒否であっても `null` になりうる。分岐は `stop_reason` で行い、`stop_details` は `cause`（調査用）にだけ使う。落とし穴 #16
- **Zod の enum を Prisma の生成物から作った。** `import { Category } from "@/generated/prisma/client"` して `z.enum(Category)`。zod 4 の `z.enum()` が const オブジェクトを受けることを実物で確認済み。**文字列で並べ直すとズレても保存の段階まで気づけない**ため、構造的に不可能にした（落とし穴 #17）
- **ズレ検出テストが効くことを確認した。** `z.enum(Category)` を `z.enum(["SEASONING", "VEGETABLE"])` にすると `expected [ 'SEASONING', 'VEGETABLE' ] to deeply equal [ 'OTHER', 'SEASONING', 'VEGETABLE' ]` で落ちる。確認後に戻した
- **SDK のエラークラスは `Anthropic.APIConnectionTimeoutError`**（実測で確認。名前付き export と static の両方から取れる）。テストでは SDK 本体をモックしつつ**エラークラスだけ実物を残した**。偽物にすると `instanceof` が素通りして、変換されていないことに気づけない
- **クライアントは遅延生成にした。** モジュール読み込み時に `new Anthropic()` すると、`ANTHROPIC_API_KEY` が無い環境で import しただけで落ちる可能性がある
- **⚠️ 未対応: 拒否時の fallback。** skill は Opus 5 で `fallbacks` パラメータ（beta）を既定で入れることを推奨している。今回は入れていない。理由は (1) 料理写真で分類器が発火する見込みが低い、(2) beta ヘッダと別モデルへの課金が増える、(3) `ANALYSIS_REFUSED` の文言で撮り直しは案内できる。**段階12 で実際に拒否が出るようなら、ユーザーに確認してから導入する**

---

## 段階5: 変換後の画像を S3 にアップロードする `lib/clients/s3.ts` を追加する

- [x] `new S3Client({})` を使う。**認証情報をコードに書かない**（design.md 1.6）
- [x] `PutObjectCommand` で `Bucket` / `Key` / `Body` / `ContentType: "image/jpeg"` を送る
- [x] キーの命名規則を決める（ユーザーごとに分ける。**他人の推測でアクセスできない値にする**）
- [x] 失敗時に `StorageFailedError` を投げる。**バケット名をメッセージに含めない**
- [x] テスト: S3 をモックし、投げられるエラーの型を固定する
- [x] キーの決定を design.md 5.6 に記録する

**受け入れ基準**: `format` / `lint` / `tsc` / `test` が終了コード0

### 実施時の記録

- **キーは `<userId>/<randomUUID()>.jpg` にした**（ユーザー承認済み）。`schema.prisma` は `cuid()` を使っているが、**キー生成に使える cuid 関数は Prisma の生成物から取り出せず**、専用ライブラリを足しても推測困難性は変わらないため、Node 組み込みの `crypto.randomUUID()`（122bit）にした。依存は増やしていない
- **`userId` を正規表現で検証してから連結している。** セッション由来なので通常は安全だが、崩れると `../` でバケット内の別プレフィックスに書ける。**起きたらバグなので素の例外**にし、`INTERNAL_ERROR` として 500 になるようにした
- **ガードが効くことを確認した。** 検証を外すと「パストラバーサルで他ユーザーのプレフィックスに書けない」ほか計6件が `expected [Function] to throw an error` で落ちる。確認後に戻した
- **`ACL` は指定していない。** バケット側の非公開設定に従う。`public-read` を付けると URL を知る誰でも他人のレシピ写真を見られる
- **テストでは `S3Client` だけ差し替え、`PutObjectCommand` は実物を使った。** 実際に組み立てられる `command.input` を検証できるため、フィールド名の取り違えを捕まえられる
- **モジュールキャッシュでテストが2件落ちた。** クライアントは初回呼び出し時に1度だけ作られるので、先行テストで既に生成済みだと `constructorMock` が呼ばれない。生成そのものを見るテストは `vi.resetModules()` + 動的 import に変えた（段階4 と同じ形）
- **⚠️ 未決事項が1つ出た（design.md 5.6）。** `uploadRecipeImage()` が返すのは**キーであってURLではない**。バケットが非公開なので表示用URLは参照時に署名付きで発行することになり、`Recipe.imageUrl` にはキーが入る。**カラム名と中身が食い違う。** 段階6 ではそのまま進め、**Phase 3 で表示を作る直前にユーザーへ確認する**

---

## 段階6: 解析結果を Recipe / Ingredient / Step として保存する `lib/repositories/recipe.ts` を追加する

- [x] **`schema.prisma` に `Recipe.servings Int?` を追加する**（design.md 6.2.4）
- [x] Claude のスキーマとプロンプトに `servings` を追加する
- [x] `Prisma.RecipeScalarFieldEnum` の列一覧をテストで固定する
- [ ] **⚠️ ローカルで `npx prisma migrate dev --name add_recipe_servings` を実行し、生成物をコミットに含める**
- [x] Recipe / Ingredient / Step を**1トランザクション**で作る
- [x] `order` に配列の添字をそのまま入れる（design.md 2章）
- [x] `userId` は引数で受け取る。**Repository はセッションを知らない**
- [x] ~~`schema.prisma` の変更が不要であることを確認する~~ → **見立ては外れた。`servings` の追加が要った**
- [x] テスト: 保存される形を固定する

**受け入れ基準**: `format` / `lint` / `tsc` / `test` が終了コード0

### 実施時の記録

- **design.md 2章の「このフェーズでの変更は不要」という見立ては外れた。** デザイン引き継ぎ資料に「材料（4人分）」があり、`servings` の追加が必要になった。**着手前に書いた見立ては、資料が揃うまで確定しない**という例
- **`$transaction` を書かなかった。** Prisma のネスト書き込み（`recipe.create` の中に `ingredients.create` / `steps.create`）は**自動で1トランザクションになる**。明示的に書くより素直で、材料の途中で失敗してレシピだけ残る状態にもならない
- `RecipeCreateInput` は `user` のリレーション接続を要求するが、**`RecipeUncheckedCreateInput` なら `userId` を直接渡せる**。`create` は両者の XOR を受けるので、後者を使って素直に書いた
- **テストは Prisma をモックし、「どんなクエリを組み立てたか」だけを見ている。** `lib/prisma.ts` は `DATABASE_URL` が無いとモジュール評価時に落ちるため、実体を読ませない（Phase 1 の `session.test.ts` と同じ形）
- **order のテストが効くことを確認した。** `order: index` を `index + 1` にすると `expected [ 1, 2, 3 ] to deeply equal [ +0, 1, 2 ]` で2件落ちる。確認後に戻した
- **並べ替えをしないことをテストで固定した。** カテゴリ順に並べたくなるが、それは表示側（Phase 3）の仕事。ここでは Claude が返した順序＝原文の順序をそのまま保つ

---

## 段階7: 正規化→解析→S3→保存を1本に繋ぐ `lib/services/recipe-analysis.ts` を追加する

- [x] design.md 4章の順序で呼ぶ。**S3 は解析の後**（落とし穴 #9）
- [x] **Service は HTTP を知らない**（`.kiro/steering/architecture.md`）
- [x] テスト: **解析に失敗したとき S3 を呼ばない**（4.1 の順序を固定する）
- [x] テスト: 保存まで完了してから戻る（Req4）

**受け入れ基準**: `format` / `lint` / `tsc` / `test` が終了コード0

### 実施時の記録

- **順序のテストが効くことを確認した。** S3 を解析より先に呼ぶ実装に入れ替えると3件落ちる。
  - `expected [ 'normalize', 'upload', …(2) ] to deeply equal [ 'normalize', 'analyze', …(2) ]`
  - 「解析に失敗したら S3 を呼ばない」「タイムアウトでも S3 を呼ばない」が `expected "vi.fn()" to not be called at all, but actually been called 1 times`
  - 確認後に戻した。**落とし穴 #9 は、順序を入れ替えた瞬間に落ちる形で固定できている**
- **Service には分岐もエラー変換も無い。** 4つを順に呼ぶだけで、`try/catch` すら書いていない。型付きエラーはそのまま上（Route Handler）へ抜ける。**この層でHTTPステータスに変換したくなるが、それは `lib/api-response.ts` の仕事**（段階2）
- **正規化後の画像を Claude と S3 の両方に渡している。** 同じ Buffer を使い回すので、S3 に置いた画像と Claude が見た画像が必ず一致する。別々に正規化すると品質やEXIFの扱いがズレうる
- テストでは「Claude に生の画像を渡していない」ことを明示的に確認している（`not.toHaveBeenCalledWith(RAW)`）。正規化を挟み忘れても型では捕まらないため

---

## 段階8: 未ログインで401を返す `POST /api/recipes/analyze` を追加する

- [x] `export const maxDuration = 60` を置く（design.md 5.4）
- [x] `requireUserId()` で `userId` を取る。**リクエストボディの `userId` を見ない**（落とし穴 #10）
- [x] `multipart/form-data` を受ける
- [x] サーバー側で形式・サイズを再検証する（クライアントを信用しない）
- [x] `{ success: true, data: { recipeId } }` を返す
- [x] テスト: **未ログインで401** / ボディの `userId` を無視する（Req7）
- [x] テスト: 成功・失敗とも `{ success, data, error }` の形になる
- [x] user-auth の requirements.md Req4 の2項目にチェックを入れる

**受け入れ基準**: `format` / `lint` / `tsc` / `test` / `build` がすべて終了コード0

> **ここで `HANDOVER.md` 1章「持ち越し: Req4 の一部」が解消した。** user-auth の requirements.md Req4 の「Route Handler から `userId` を取得できる」「未ログインで 401」にチェック済み。

### 実施時の記録

- **ボディの `userId` を信用する実装に変えると、テストが `expected 'victim_user_id' to be 'clx1a2b3c4d5e6f7g8h9'` で落ちることを確認した。** 落とし穴 #10 が実際に守られている
- **`multipart/form-data` のテストで12件がまとめて落ちた。原因は実装ではなく実行環境。** jsdom の `File` と undici の `FormData` が噛み合わず、(1) `instanceof File` が `false`、(2) 画像の中身が `"undefined"` の文字列に化ける、の2つが同時に起きた。**実装が悪いように見えるので、原因を実装側に探すと時間を溶かす**。design.md 9.3 に記録
  - 対処1: テストファイルに `// @vitest-environment node`。**Route Handler に DOM は要らない**
  - 対処2: 実装側で `instanceof File` を使わない。仕様上 `FormData.get()` は `string | File` を返すので、**文字列でなければファイル**と判定する
- **サイズ超過は `InvalidImageError`（400）ではなく `ImageTooLargeError`（413）にした。** requirements.md Req2 が「413 相当」と定めているため。書き始めは 400 にしていて、受け入れ基準と突き合わせて気づいた
- **形式の検証は Route Handler でやらない。** `normalizeImage()` が先頭バイトで判定するので、ここで宣言された MIME を見ると二重管理になる。Route が弾くのは「そもそも画像が入っていない」場合だけ
- **`maxDuration` をテストで固定した。** 消しても型でもテストでも捕まらず、Vercel Hobby の既定（10秒）に戻って解析の途中で切れる
- **sharp が「使い捨てではない実コード」からトレースされることを確認した。** `POST /api/recipes/analyze` の `route.js.nft.json` に `sharp-linux-x64-0.35.3.node` が載っている。段階3 は probe ルートでの確認だったが、**本番の構成そのままで同じ結果**になった
- **`proxy.ts` の matcher が `api` を除外していることに、この 401 は依存している。** 元は Auth.js の `/api/auth/*` を通すための除外だが、結果としてこのエンドポイントが「307リダイレクトではなく401」を返す理由になっている。**matcher に `api` を含めると、ユニットテストは通るのに実機では 307 が返る**（テストは Route Handler を直接呼ぶため proxy を経由しない）。落とし穴 #24 として記録

---

## 段階9: Canvas で画像を正規化する `lib/images/normalize.client.ts` を追加する

- [x] サーバー側と**同じ値**（長辺2576px / JPEG品質85 / 拡大しない）にする
- [x] **HEIC を選択された時点で弾く**（`UnsupportedFormatError` 相当。Req2）
- [x] JPEG / PNG 以外を弾く
- [x] テスト: 縮小される / 拡大されない / HEIC が弾かれる
- [x] **`fitWithin` の出力が sharp の実出力と一致することを実測で確認する**

**受け入れ基準**: `format` / `lint` / `tsc` / `test` が終了コード0

### 実施時の記録

- **`fitWithin()` と sharp の出力が7ケースすべてで一致することを実測で確認した。** 4000×3000→2576×1932 / 3000×4000→1932×2576 / 4000×4000→2576×2576 / 800×600（据え置き）/ 2576×1000（据え置き）/ 4000×1000→2576×644 / 6000×1234→2576×530。**「クライアントとサーバーで同じ値」は定数の共有だけでは足りず、丸め方まで揃っている必要がある**（`Math.round` で一致した）
- **`file.type` だけでは HEIC を弾けない。** iPhone から選んだ HEIC は**ブラウザによって type が空文字になる**。空文字だと「JPEG でない」ことしか分からず、「HEIC だから対応できない」と案内できない。**拡張子（`.heic` / `.heif`）も見る**
  - 拡張子判定を外すと「JPEG を名乗る HEIC も拡張子で弾く」が落ちることを確認した
- **文言をサーバー側から取るようにした。** 最初は `messageFor()` に文字列を直接書いていたが、`lib/errors.ts` と同じ文言の二重管理になる。**`lib/errors.ts` は外部依存が無いのでブラウザからも読める**ので、`new UnsupportedFormatError().message` を返す形にした。一致をテストで固定している
- **形式違いとサイズ超過が重なったら形式違いを先に返す。** 「対応していない形式」のほうが次の行動（別の写真を選ぶ）に直結するため
- **`ImageBitmap` は `close()` する。** `finally` で閉じないと、大きな写真を何枚も選んだときにメモリが残る
- **EXIF回転は `imageOrientation: "from-image"` を明示した。** ただし**ここが効かなくてもサーバー側の `.rotate()` で正立する**ので、致命的にはならない（design.md 1.5）

---

## 段階10: S-03 アップロード画面（`app/upload/page.tsx`）を追加する

- [x] **ビジュアル仕様を design.md 6.2 に従って適用する**（2026-08-16 受領。`@theme` トークンは README のCSSをそのまま使える）
- [x] PC: ドラッグ＆ドロップ + クリック選択の両方（Req1）
- [x] スマホ: 「カメラで撮る」を第一候補、次に「写真を選ぶ」
- [x] 「JPEG / PNG・10MBまで」を画面に出す
- [x] 検証エラーをその場に日本語で出す（Req2 / Req6）
- [x] 保護ページとして `auth()` を通す
- [x] テスト: 検証エラーの表示
- [x] ~~**見た目のクラスは最小限にする。** ビジュアルデザインの合流は Phase 3 の直前（`CLAUDE.md`）~~
      → **この前提は消えた。** デザイン資料が 2026-08-16 に先に届いたため、この段階から確定仕様で組んだ（design.md 6.2）

**受け入れ基準**: `format` / `lint` / `tsc` / `test` / `build` がすべて終了コード0

### 実施時の記録

**2段に分けて進めた。** 10a がデザイントークンと書体、10b が画面本体。

#### 10a: `@theme` と Noto Sans JP

- **`--font-sans` は `var(--font-noto-sans-jp)` を参照するので、`layout.tsx` が書体を読み込むまで解決しない。** `globals.css` だけ入れても効かず、しかも**エラーにならずフォールバックで表示される**（気づきにくい）。ビルド後のCSSに `--font-noto-sans-jp:"Noto Sans JP", "Noto Sans JP Fallback"` が出ることで確認した
- **`next/font/google` の `subsets` は preload の対象を決めるだけで、取得する字形の範囲ではない**（`next/dist/compiled/@next/font/dist/google/find-font-files-in-css.js` の `findFontFilesInCss`）。URL に `&subset=` は付かない（`get-google-fonts-url.js`）ため、`subsets: ["latin"]` でも日本語の字形は落ちない。**実測で 125 ファイル / 5.3MB が self-host された**
- **`weight` を指定しなかった。** Noto Sans JP は Google Fonts 側で日本語を100本以上の unicode-range サブセットに割っているため、400/500/700 を個別に取ると単純にファイル数が3倍になる。可変フォント1本で3ウェイトとも出せる
- **`lang="en"` を `ja` に直した。** create-next-app の既定のまま日本語UIを載せていた。読み上げとハイフネーションが英語として扱われる
- `metadata` も "Create Next App" のままだったので置き換えた
- **Geist / Geist_Mono は削除した。** `--font-geist-*` を参照するクラスが1つも無いことを確認済み
- **Tailwind v4 に `--size-*` の名前空間は無い。** `--size-tap` / `--size-tap-lg` から `h-tap` のようなユーティリティは生えないので `h-[var(--size-tap-lg)]` と書いている
- **トークン名を間違えてもビルドは通り、CSSが静かに空になる。** 使ったユーティリティが実際にCSSを吐いているかをビルド成果物で1つずつ確認した（`bg-header` / `text-lead` / `bg-danger-soft` / `hover:bg-primary-dark` ほか19種）

#### 10b: `app/upload/`

- **`page.tsx`（Server Component、`auth()`）と `photo-picker.tsx`（`"use client"`）に分けた。** 保護をサーバー側に残したまま、選択と検証をクライアントで完結させるため
- **解析の開始はこの段階では持たない。** 押しても何も起きないボタンを置かないよう、`読み取る` は段階11 で進捗表示と一緒に足す
- **弾いた写真はプレビューしない。** 「使えないものが大きく映っている」状態を作らないため、検証に落ちたら `selected` を `null` に戻す
- **`URL.createObjectURL` は自動で解放されない。** `useEffect` のクリーンアップで、選び直しと離脱の両方で `revokeObjectURL` する。テストで固定した
- **`next/image` は使わない。** `blob:` URL は最適化の経路と噛み合わない。`@next/next/no-img-element` は理由を書いて1箇所だけ抑制した（`--max-warnings 0` なので放置できない）
- **`onDragOver` で `preventDefault()` を呼ばないと、ブラウザが写真を別ページとして開いてしまう。** ドロップ以前に既定動作を止める必要がある
- ~~**「カメラで撮る」は `md:hidden`。**~~ → **⚠️ この判断は間違いだった（2026-08-17 に修正）。iPad は縦向きで 820〜1024px あるため PC 扱いになり、カメラを持つ端末なのにボタンが消えていた。** `pointer: coarse` で判定するよう変更（design.md 6.2.9）
- **隠した `input` は `<label>` ではなく `button` から `click()` で開く。** `<label>` だと role が button にならず、テストからも支援技術からも「操作」として扱われない
- テストは jsdom に Object URL が無いため `URL.createObjectURL` / `revokeObjectURL` だけ差し替えている

#### 10c: 実画面を見て直した2件

**テストが222件通っていても見えなかった。** 本番ビルドを起動して Chromium で撮って初めて分かった。

- **ファイルサイズが「0.0MB」と出ていた。** MB固定で `toFixed(1)` していたため、小さい画像が壊れて見える。0.1MB未満は KB で出すようにした
- **説明文が「撮っ / てください。」で割れていた。** 中央揃えで幅いっぱいに流れていたため。デザイン資料の空状態は説明を **26ch 幅**と定めているので `max-w-[26ch]` を入れた

**撮影のやり方も記録しておく。** `/upload` は `auth()` で保護されているので直接は撮れない。`PhotoPicker` だけを描く使い捨てルートを一時的に置き、`proxy.ts` を退避して `next start` を起動し、Playwright（グローバルの `playwright@1.56.1` と `/opt/pw-browsers/chromium-1194`）で撮った。**撮影後にルートを削除し `proxy.ts` を戻してから、検証コマンドを流し直している。**

- ⚠️ **使い捨てルートを消した直後の `tsc` は落ちる。** `.next/types/validator.ts` が消えたページを参照したまま残るため。`npm run build` を1回通すと消える（9.1 と同じ性質）
- ⚠️ **`curl` が localhost に届かない。** リモート実行環境の `HTTPS_PROXY` を経由してしまうので `--noproxy '*'` が要る
- ⚠️ **`pkill -f "next start"` は自分のシェルごと殺す。** コマンド文字列自身がパターンに一致する。`ps` で `next-server` の PID を取って `kill` する
- **実機では未確認。** `capture="environment"` が実際にカメラを開くか、`pointer-coarse:` の出し分けが手元の端末で意図どおりかは段階12 で確認する

---

## 段階11: 解析中の段階表示を S-03 に追加する

- [x] `XMLHttpRequest` の upload progress で「アップロード中」を出す（**実データ**）
- [x] アップロード完了イベントで「文字を読み取り中」に変える（**実データ**）
- [x] 一定秒数の経過で「材料を仕分け中」に変える（**推定**。design.md 6.1）
- [x] 解析中は別画面へ遷移させない（Req5）
- [x] 失敗時に「原因」と「次にすること」の両方を出す（Req6）
- [x] テスト: 表示が2回以上変わる

**受け入れ基準**: `format` / `lint` / `tsc` / `test` / `build` がすべて終了コード0

### 実施時の記録

- **`fetch` ではなく `XMLHttpRequest`。** fetch は**リクエストボディ**の進捗を取れない。3段階のうち2つを実データにするには XHR が要る
- **クライアントのタイムアウトは70秒**（サーバーの `maxDuration = 60` の外側）。**先に切れると、サーバーが返そうとしている 504 などの「原因の分かるエラー」を捨てて、こちらの一般的な文言で上書きしてしまう**
- **サーバーが返した `error.message` をそのまま画面に出す。** あれは `lib/errors.ts` のユーザー向け日本語で「原因」と「次にすること」の両方を含む。段階9 と同じ「二重管理しない」判断。JSON ですらない応答（プロキシのエラーページ等）に備えて `INTERNAL_ERROR` を `lib/api-response.ts` から export し、クライアントからも同じ文言を使うようにした
- **離脱のブロックは2つ要る。** 画面内の遷移は「中止」をリンクでなくして止め、リロードとタブを閉じる操作は `beforeunload` で止める。**前者だけではブラウザの操作を防げない**
- **`prefers-reduced-motion` で明滅を止めるようにした。** 進行中の丸が唯一「止まっていない」ことを示す手がかりなので、止めると分かりにくくはなるが、段階の区別は塗り・枠と文字の太さでも付く
- **引き継ぎ資料の `@theme` に無い色が2つあった**（`#8AA3AB` 未着手ラベル / `#DFF1F3` バーのトラック）。**推測ではなく、同資料のコンポーネント仕様のほうには書かれている。** トークン表が追いついていないだけなので `--color-muted` / `--color-track` として足した
- **テストが実際に効くことを確認した。** 「材料を仕分け中」への遷移と「中止」の無効化をそれぞれ壊すと4件が落ちる（`表示が段階を追って2回以上変わる` / `バーが伸びる` / `中止がリンクでなくなる` / `読み取るを出さない`）。確認後に戻した

#### ⚠️ エラー時のボタンをデザインから1つ減らした（design.md 6.2.7）

実画面を撮って気づいた。デザインはエラー枠の中に危険ボタン「撮り直す」を置いているが、**この実装では失敗しても写真が選ばれたまま残る**ので、下に「もう一度読み取る」と「選び直す」が既に出ている。3つ目を足すと**「撮り直す」と「選び直す」が同じ操作**になる。

**枠の中のボタンを外し、`読み取る` の label を失敗直後だけ「もう一度読み取る」に変えた。** 通信の失敗やタイムアウトなら写真自体は問題ないので、**写真を捨てさせないほうが正しい。**

#### ⚠️ Playwright の `page.route` では進捗の段階を再現できない

最初のスクリーンショットが「アップロード中」で止まっていた。**`page.route` で応答を差し替えると実際の送信が起きないため、`xhr.upload.onprogress` / `onload` が発火しない。**

**アプリ側のバグではなかった。** 実サーバー（20秒スリープするスタブ）に対して XHR を投げて確認したところ、正常に発火していた。

```
upload.onprogress 600199/600199 @543ms
upload.onload @543ms
onload status=200 @20473ms
```

**段階表示を撮るときは、応答を差し替えず、遅いエンドポイントを実際に立てる。** `app/api/recipes/analyze/route.ts` を一時的にスタブへ差し替え、`x-stub-mode` ヘッダで成功／失敗を切り替えて撮った。**撮影後に元へ戻してある。**

- **`waitFor()` で段階を待ってはいけない。** 3段階のラベルは最初から全部 DOM に居る（未着手も描かれる）ので、存在では判定できない。**太字（進行中）かどうかで待つ**

> **⚠️ 3つ目だけが時間ベースの推定。** これを「実際の進捗」と偽らない（design.md 6.1）。切り替え秒数は段階12 の実測から決める。
>
> **⚠️ この段階の前に決めておくこと**: デザインは画面に「最大30秒」と表示し30秒で打ち切る仕様だが、実装は SDK timeout 50秒。**どちらに合わせるかユーザーに確認する**（design.md 6.2.3）。

---

## 段階12: 実際の料理本で解析し、プロンプトと `effort` を調整する（**ローカル限定**）

**リモート実行環境では実行できない。** `.env` の実値がユーザーのローカルにしかないため。

- [x] design.md 10章「受け入れの確認手順」11項目をすべて実行する
- [x] 読み取り精度を確認する（材料・分量・手順・タイトル）
- [x] **3分類の線引きを詰める**（「にんにく」「しょうが」「だし」「めんつゆ」。design.md 5.2）
- [x] **「少々」「適量」がそのままの文字列で保持される**ことを確認する（Req3）
- [x] 横向きに撮った写真で、S3 の画像が正立していることを確認する（落とし穴 #4）
- [x] 解析にかかる実時間を測り、段階11 の切り替え秒数を決める
- [x] `effort: "low"` で精度が足りるか判断する。**上げる場合はコストとのトレードオフをユーザーに確認する**
- [x] 見開きページで小さい文字が潰れないか確認する（`REQUIREMENTS.md` 5章）
- [x] **Vercel 本番で sharp が動くことを確認する**（design.md 1.5 の最後の ⚠️）

### 実施時の記録（2026-08-23、ローカル実測）

**初めて端から端まで通った。** 料理本1ページ（パスタのレシピ）で、材料8件・手順・タイトル・人数がすべて取れた。

| 材料                  | 結果      | 判定                                            |
| --------------------- | --------- | ----------------------------------------------- |
| パスタ / 明太子       | OTHER     | 麺・魚介 ✅                                     |
| しいたけ              | VEGETABLE | きのこ ✅                                       |
| にんにくオイル漬け    | SEASONING | **加工された調味油**。素材のにんにくではない ✅ |
| EVオリーブオイル      | SEASONING | 油 ✅                                           |
| 無塩バター            | OTHER     | 乳製品。**プロンプトの指示どおり**（下記）      |
| 塩 / 粗挽き黒こしょう | SEASONING | ✅                                              |

- **`effort: "low"` で精度は足りていた。** 上げる必要は無い（コストを抑えられる）
- **「適量」が数値化されずそのまま残った**（Req3 達成）
- **`servings` が取れた**（1人分）
- **`にんにくオイル漬け（p.156）` とページ参照ごと保持された。** 料理本の相互参照はそのまま残るほうが、買い物にも調理にも役立つ
- **⚠️ バターの分類はユーザーから「議論の余地あり」の指摘。** プロンプトが「乳製品は OTHER」と明示しているので**指示どおりの結果**であり、モデルのブレではない。**買い物の場面（冷蔵ケースで買う）を優先して現状維持**とした。変えるならプロンプトに1行足すだけ
- **解析時間の実測: 12.4 / 14.6 / 17.2 / 19.3 秒**（見込みの30秒より速い）。これを受けて `OCR_TO_CATEGORIZING_MS` を **12秒 → 7秒**にした。12秒では3段階目が数秒しか出ていなかった
  - **⚠️ 成功時の計測は1件のみ**（17.2秒）。他の3件はS3で失敗した回の合計時間。**数をこなしたら見直す**
- **見開きページでも文字は潰れなかった。** 長辺2576px（高解像度ティア）で足りている
- **EXIF の回転は効いていた。** 2通りを撮り分けて確認した。**この2つは別物なので、混同すると誤診する**
  - **スマホ本体を横に倒して撮る** → 画像データは横倒し + EXIF に「回して表示」の指示 → **正立して保存された ✅**
  - **本を横向きに置いて撮る** → 被写体が横向きなだけ、指示は付かない → **横向きのまま保存された（これが正しい）**
  - ⚠️ **ただしブラウザ側（Canvas の `imageOrientation: "from-image"`）が先に正立させている**ので、**sharp の `.rotate()` 単体が効いたかは、この確認では区別できない。** 確かめたのは「最終的にユーザーの目に触れる画像が正立すること」

**受け入れ基準**: design.md 10章の11項目が期待どおりに観測できる

---

### 本番（Vercel）での確認（2026-08-23）

**Phase 2 で最後まで残っていたリスクが解消した。**

- 本番URL: `https://recipe-app-nu-liart.vercel.app`
- **スマホから写真を撮って、解析→S3→保存まで完走した**
- つまり **`sharp` は Vercel の Linux 上でも動く。** 段階3 で「バンドルには含まれる」と確認していたが、**実行できるかは置いてみるまで分からなかった**
- **関数サイズも問題なかった**（上限超過ならビルドが落ちる）
- **`pointer-coarse:` の出し分けも実機で効いていた**（スマホでカメラから撮影できた）

**デプロイ時に追加で必要だった手作業は2つ。** どちらも `SETUP.md` に書いてある。

1. Vercel に環境変数10個を入れる
2. **Google の「承認済みのリダイレクト URI」に本番URLを追加する**（`https://.../api/auth/callback/google`）。**これを忘れるとログインできない**

> **⚠️ マイグレーションは Vercel では自動実行されない。** いまはローカルと本番が**同じ Neon の DB** を見ているので問題になっていないだけ。Phase 3 以降でスキーマを変えるときは、**ローカルで `prisma migrate dev` を実行してからコミット・push する**（`SETUP.md`）。

---

## フェーズ完了時

- [ ] design.md の残った `⚠️` を実測で置き換える（`.kiro/README.md` の6）
      → **段階12 が終わるまで消せないものが残っている。** Vercel 本番での sharp、`failOn` の副作用、`effort: "low"` の精度
- [x] このファイルの「実施時の記録」のうち、以降も参照する内容を design.md へ還元する
      → 6.2.6（書体）/ 6.2.7（エラー時のボタン）/ 6.2.8（進捗の実装）/ 9.4（実画面の撮り方）/ 落とし穴 #28〜#39
- [x] **`REQUIREMENTS.md` と `UI_DESIGN.md` に人数（`servings`）を追記する**（design.md 6.2.4）
      → `REQUIREMENTS.md` 8章のデータモデルと9章の決定事項、`UI_DESIGN.md` の S-04
- [x] `HANDOVER.md` を Phase 3（recipe-view）向けに更新する
      → **4章は「Phase 3」ではなく「段階12（ローカルでの実測）」にした。** 実測が残っているため
- [x] `.kiro/README.md` のフェーズ表で `recipe-analysis` を ~~**完了**~~ **実装完了 / 実測未了** にする
      → **「完了」にはしていない。** 実際の料理本で一度も解析していないため。理由も表の下に書いた
- [x] バグ検証を行い、**報告してから** push する

### バグ検証で直したもの（2026-08-17）

- **読み上げに段階の変化が伝わっていなかった。** `role="status"` / `aria-live="polite"` を置いていたが、**3段階のラベルは未着手のぶんも含めて最初から DOM に居るので、段階が進んでも領域の文字列が変わらない**（変わるのは class だけ）。live region は文字列の変化で発火するため、**何も読み上げられない状態だった。** `sr-only` で「現在: 文字を読み取り中」を置いて解決。テストで固定した
- **見出しの階層が飛んでいた。** 選択前の画面に `h1` が無く `h2` から始まっていた

### 検証しても問題が出なかったところ（記録として）

- **二重送信**: 「読み取る」は解析中に描画されないので押せない
- **`reset()` の `abort()`**: `onabort` は拾っていないので、中断で誤ってエラー表示にはならない
- **アンマウント時**: `useEffect` のクリーンアップで `abort()` と `clearTimeout()` の両方を行っている
- **タイマーの取り残し**: 応答が来た時点の `cleanup()` で必ず消える
