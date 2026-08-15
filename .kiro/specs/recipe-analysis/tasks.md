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
- [ ] S3 バケットの CORS とアクセス権限を確認する（段階5 で実際にアップロードするまで真偽が分からない）

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

- [ ] `.rotate()` → `resize({ fit: "inside", withoutEnlargement: true })` → `jpeg({ quality: 85 })` の順で実装する
- [ ] JPEG / PNG 以外を弾く（`UnsupportedFormatError`）
- [ ] 10MB 超を弾く（`ImageTooLargeError`）
- [ ] テスト: 長辺2576pxに収まる / 2576px未満を拡大しない / **`.rotate()` で EXIF 回転が適用される**
- [ ] **`npm run build` を実行し、sharp を import した状態でビルドが通ることを確認する**（design.md 1.5 の ⚠️ / 落とし穴 #13）

**受け入れ基準**: `format` / `lint` / `tsc` / `test` / `build` がすべて終了コード0

> **⚠️ ここが sharp の Vercel 対応を判定する段階。** ビルドが落ちた場合、design.md 1.5 の代替（WASM 版 / クライアント側のみ）へ切り替える判断が要る。**判断はユーザーに確認してから行う。**

---

## 段階4: Claude API にレシピ画像を送り構造化データを受け取る `lib/clients/claude.ts` を追加する

- [ ] Zod スキーマ（`title` / `ingredients[]` / `steps[]` / `isRecipe`）を定義する
- [ ] `messages.parse()` で `output_config: { effort: "low", format: zodOutputFormat(...) }` を送る
- [ ] クライアントを `timeout: 50_000`（**ミリ秒**）/ `maxRetries: 0` で作る
- [ ] **画像ブロックをテキストブロックより前に置く**（落とし穴 #11）
- [ ] `temperature` / `top_p` / `top_k` を送らない（落とし穴 #1）
- [ ] `stop_reason === "refusal"` で `AnalysisRefusedError` を投げる
- [ ] `parsed_output` が `null` なら `AnalysisFailedError` を投げる
- [ ] `isRecipe: false` なら `AnalysisFailedError` を投げる
- [ ] プロンプトを書く（design.md 5.2。**形式の指示は書かない**）
- [ ] テスト: 拒否時に投げる / `parsed_output` が null で投げる / **Zod の `Category` 3値が Prisma の enum と一致する**
- [ ] **API を実際に叩くテストは書かない**（design.md 8章）

**受け入れ基準**: `format` / `lint` / `tsc` / `test` が終了コード0

---

## 段階5: 変換後の画像を S3 にアップロードする `lib/clients/s3.ts` を追加する

- [ ] `new S3Client({})` を使う。**認証情報をコードに書かない**（design.md 1.6）
- [ ] `PutObjectCommand` で `Bucket` / `Key` / `Body` / `ContentType: "image/jpeg"` を送る
- [ ] キーの命名規則を決める（ユーザーごとに分ける。**他人の推測でアクセスできない値にする**）
- [ ] 失敗時に `StorageFailedError` を投げる。**バケット名をメッセージに含めない**
- [ ] テスト: S3 をモックし、投げられるエラーの型を固定する

**受け入れ基準**: `format` / `lint` / `tsc` / `test` が終了コード0

---

## 段階6: 解析結果を Recipe / Ingredient / Step として保存する `lib/repositories/recipe.ts` を追加する

- [ ] Recipe / Ingredient / Step を**1トランザクション**で作る
- [ ] `order` に配列の添字をそのまま入れる（design.md 2章）
- [ ] `userId` は引数で受け取る。**Repository はセッションを知らない**
- [ ] `schema.prisma` の変更が不要であることを確認する（design.md 2章の見立ての検証）
- [ ] テスト: 保存される形を固定する

**受け入れ基準**: `format` / `lint` / `tsc` / `test` が終了コード0

---

## 段階7: 正規化→解析→S3→保存を1本に繋ぐ `lib/services/recipe-analysis.ts` を追加する

- [ ] design.md 4章の順序で呼ぶ。**S3 は解析の後**（落とし穴 #9）
- [ ] **Service は HTTP を知らない**（`.kiro/steering/architecture.md`）
- [ ] テスト: **解析に失敗したとき S3 を呼ばない**（4.1 の順序を固定する）
- [ ] テスト: 保存まで完了してから戻る（Req4）

**受け入れ基準**: `format` / `lint` / `tsc` / `test` が終了コード0

---

## 段階8: 未ログインで401を返す `POST /api/recipes/analyze` を追加する

- [ ] `export const maxDuration = 60` を置く（design.md 5.4）
- [ ] `requireUserId()` で `userId` を取る。**リクエストボディの `userId` を見ない**（落とし穴 #10）
- [ ] `multipart/form-data` を受ける
- [ ] サーバー側で形式・サイズを再検証する（クライアントを信用しない）
- [ ] `{ success: true, data: { recipeId } }` を返す
- [ ] テスト: **未ログインで401** / ボディの `userId` を無視する（Req7）
- [ ] テスト: 成功・失敗とも `{ success, data, error }` の形になる

**受け入れ基準**: `format` / `lint` / `tsc` / `test` / `build` がすべて終了コード0

> **ここで `HANDOVER.md` 1章「持ち越し: Req4 の一部」が解消する。** user-auth の requirements.md Req4 の未確認2項目にもチェックを入れる。

---

## 段階9: Canvas で画像を正規化する `lib/images/normalize.client.ts` を追加する

- [ ] サーバー側と**同じ値**（長辺2576px / JPEG品質85 / 拡大しない）にする
- [ ] **HEIC を選択された時点で弾く**（`UnsupportedFormatError` 相当。Req2）
- [ ] JPEG / PNG 以外を弾く
- [ ] テスト: 縮小される / 拡大されない / HEIC が弾かれる

**受け入れ基準**: `format` / `lint` / `tsc` / `test` が終了コード0

---

## 段階10: S-03 アップロード画面（`app/upload/page.tsx`）を追加する

- [ ] PC: ドラッグ＆ドロップ + クリック選択の両方（Req1）
- [ ] スマホ: 「カメラで撮る」を第一候補、次に「写真を選ぶ」
- [ ] 「JPEG / PNG・10MBまで」を画面に出す
- [ ] 検証エラーをその場に日本語で出す（Req2 / Req6）
- [ ] 保護ページとして `auth()` を通す
- [ ] テスト: 検証エラーの表示
- [ ] **見た目のクラスは最小限にする。** ビジュアルデザインの合流は Phase 3 の直前（`CLAUDE.md`）

**受け入れ基準**: `format` / `lint` / `tsc` / `test` / `build` がすべて終了コード0

---

## 段階11: 解析中の段階表示を S-03 に追加する

- [ ] `XMLHttpRequest` の upload progress で「アップロード中」を出す（**実データ**）
- [ ] アップロード完了イベントで「文字を読み取り中」に変える（**実データ**）
- [ ] 一定秒数の経過で「材料を仕分け中」に変える（**推定**。design.md 6.1）
- [ ] 解析中は別画面へ遷移させない（Req5）
- [ ] 失敗時に「原因」と「次にすること」の両方を出す（Req6）
- [ ] テスト: 表示が2回以上変わる

**受け入れ基準**: `format` / `lint` / `tsc` / `test` / `build` がすべて終了コード0

> **⚠️ 3つ目だけが時間ベースの推定。** これを「実際の進捗」と偽らない（design.md 6.1）。切り替え秒数は段階12 の実測から決める。

---

## 段階12: 実際の料理本で解析し、プロンプトと `effort` を調整する（**ローカル限定**）

**リモート実行環境では実行できない。** `.env` の実値がユーザーのローカルにしかないため。

- [ ] design.md 10章「受け入れの確認手順」11項目をすべて実行する
- [ ] 読み取り精度を確認する（材料・分量・手順・タイトル）
- [ ] **3分類の線引きを詰める**（「にんにく」「しょうが」「だし」「めんつゆ」。design.md 5.2）
- [ ] **「少々」「適量」がそのままの文字列で保持される**ことを確認する（Req3）
- [ ] 横向きに撮った写真で、S3 の画像が正立していることを確認する（落とし穴 #4）
- [ ] 解析にかかる実時間を測り、段階11 の切り替え秒数を決める
- [ ] `effort: "low"` で精度が足りるか判断する。**上げる場合はコストとのトレードオフをユーザーに確認する**
- [ ] 見開きページで小さい文字が潰れないか確認する（`REQUIREMENTS.md` 5章）
- [ ] **Vercel 本番で sharp が動くことを確認する**（design.md 1.5 の最後の ⚠️）

**受け入れ基準**: design.md 10章の11項目が期待どおりに観測できる

---

## フェーズ完了時

- [ ] design.md の残った `⚠️` を実測で置き換える（`.kiro/README.md` の6）
- [ ] このファイルの「実施時の記録」のうち、以降も参照する内容を design.md へ還元する
- [ ] `HANDOVER.md` を Phase 3（recipe-view）向けに更新する
- [ ] `.kiro/README.md` のフェーズ表で `recipe-analysis` を **完了**にする
- [ ] バグ検証を行い、**報告してから** push する
