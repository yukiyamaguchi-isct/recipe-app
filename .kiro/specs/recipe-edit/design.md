# recipe-edit（Phase 5）の設計書

保存済みレシピの材料・分量・カテゴリ・作り方を直す画面（S-05）を作る。あわせて S-04 の `編集` と確認バーの「編集する」を戻し、Phase 3 から持ち越した「直す導線が無い」欠落を閉じる。

## この文書の読み方

**主張ごとに検証状態のラベルを付けてある**（`.kiro/README.md` の「design.md の書き方」）。

| ラベル    | 意味                                           | 実装時の扱い             |
| --------- | ---------------------------------------------- | ------------------------ |
| ✅ 実測   | 実際に動かして確認した                         | そのまま信じてよい       |
| 📄 出典   | 公式ドキュメントかライブラリのソースで確認した | そのまま信じてよい       |
| ⚠️ 未検証 | 妥当だと考えているが確かめていない             | **実装時に必ず確かめる** |

**ラベルの無い記述は「方針・判断」であって事実の主張ではない。**

### 着手時に残っている ⚠️（どの段階で潰すか）

| ⚠️                                                                       | 潰す段階           |
| ------------------------------------------------------------------------ | ------------------ |
| Neon のプール接続＋ドライバアダプタで対話的トランザクションが通る        | 段階10（実保存）   |
| 入れ子のルート（`/edit`）の `notFound()` が親の `not-found.tsx` に落ちる | 段階5（ブラウザ）  |
| 保存後の `replace` で S-04 が新しい内容で出る（ルーターキャッシュ）      | 段階10（ブラウザ） |
| iOS Safari で `beforeunload` がどこまで効くか                            | 段階14（実機）     |
| 入力欄にフォーカスを移したとき、固定ヘッダーの下に潜らない               | 段階10（ブラウザ） |

## 確定事項（蒸し返さない）

- **視覚仕様は `Design_引き継ぎ資料/design_handoff_recipe_design_system/README.md` が正。** 正本の HTML は `Recipe Design System v2.dc.html`（緑基調の無印版は履歴。使わない）
- **デザインHTMLはリファレンスであって本番コードではない。** Tailwind CSS v4 + React 19 の規約で組み直す
- **「移動 / 操作 / 絞り込み」を面の有無で描き分ける**（recipe-view design.md 6.2）
- **詳細画面と編集画面は別画面**（`REQUIREMENTS.md` 4.7 / `UI_DESIGN.md` 4章 決定3）
- **タイトルは S-05 で直さない**（`REQUIREMENTS.md` 4.7 の表。S-04 の `✎ 改題` だけ）
- **材料行は「材料名が左・分量が右」**（recipe-view design.md 6.5 / 落とし穴 #8）
- **着手前の3点（決定①〜③）と段階1 の4点**は requirements.md の「前提」に表でまとめてある。出典は下の 0章

---

# 0. このフェーズの決定と出典

## 0.1 着手前の3点（2026-09-26 ユーザー決定）

**📄 出典: `HANDOVER.md` 4.2 / `REQUIREMENTS.md` 4.7 末尾・9章「Phase 5 の着手前に決めたこと」/ `UI_DESIGN.md` S-04・S-05。** 調べた事実と比較した案の全文は `HANDOVER.md` 4.2 にある。ここには実装に効く部分だけを取り込む。

### 決定①: 作り方（手順）も S-05 で編集する

| 出典（なぜ決める必要があったか）              | 内容                                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| `REQUIREMENTS.md` 4.7                         | 「材料・分量・カテゴリ・**作り方テキスト**をユーザーが編集できる」           |
| 引き継ぎ資料 README「Screens 6」（L236〜243） | ヘッダー中央が「**材料を編集**」。行カードは材料名・分量・カテゴリ・削除だけ |
| `v2.dc.html`「06 レシピ編集」（L538〜）       | 「材料を編集」「行を追加」のみ。**手順の入力欄が1つも無い**                  |

- **材料の節の下に「作り方」の節を足す。手順1つ＝カード1枚**
- 手順カードは**既存の部品だけで組む**: 手順番号の丸（README「手順リスト」）＋本文の入力欄（README「フォーム入力」。**複数行**）＋削除ボタン（危険スタイル）。節の末尾に「＋ 手順を追加」（「＋ 行を追加」と同じ破線ボタン）
- **並べ替えは入れない。** 本文の修正・削除・末尾への追加だけ
- **ヘッダー中央は「レシピを編集」**（→ 6.3 食い違い9。**資料の値からの意図的な逸脱**）
- 「作り方」と「手順」は同じもの。見出しが「作り方」、中身が DB の `Step`（`order` / `text`）

### 決定②: 確認モードは上段を出さない。削除は一覧からだけ

**⚠️ 資料の字面とは違う判断。** README「Screens 5」は「4と同一表示に以下が加わるだけ」で、`v2.dc.html` の確認モードのモック（L511〜）は上段に `← 一覧` と `編集` を**両方**描いている。`← 一覧` を出さないのは `UI_DESIGN.md` S-04c（差3）の決定。

| 項目                   | 決定                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------ |
| 通常モードの上段       | 左 `← 一覧`／**右 `編集`（「操作」＝枠線ボタン）を戻す**。上段を両端揃えに           |
| 確認モードの上段       | **出さない（今のまま）**                                                             |
| 確認モードの最下部バー | **「この内容で決定」（主要）→「編集する」（副次）を戻す**（README「Screens 5」の順） |
| S-04 からの削除        | **置かない。削除は一覧からだけ**                                                     |

- 通常モードで上段に `編集` を足しても**ヘッダーの高さは変わらない**（上段はすでに 48px の `← 一覧` がある段）
- **確認モードの中段の上余白 12px（recipe-list 落とし穴 #17）はそのまま**。上段が無い形を変えないので、Phase 4 段階12 の実装と実測がそのまま使える

### 決定③: `← 中止` は自前の破棄確認ダイアログ＋`beforeunload`。「戻る」は止めない

`UI_DESIGN.md` S-05「未保存のまま離れようとしたら引き止める」／README Interactions「← 一覧 / ← 中止: 戻る遷移。編集中の場合は破棄確認ダイアログ」。

- **`← 中止` は `<button>`。** 変更があれば自前の破棄確認ダイアログ（5.8）。無ければそのまま戻る
- **再読み込み・タブを閉じる・URL 直打ちは `beforeunload`**（変更があるときだけ登録）
- **ブラウザの「戻る」は止めない。既知の制約**（1.3）。失うのは直している途中の内容だけで、解析結果そのものは保存済み

## 0.2 段階1 で決めた4点（2026-09-26 ユーザー決定。4点とも提案どおり）

| #   | 論点        | 決定                                                                               | 理由の節 |
| --- | ----------- | ---------------------------------------------------------------------------------- | -------- |
| 1   | 保存の API  | **`PUT /api/recipes/[id]`。材料と手順をまとめて置き換える**                        | 4.1      |
| 2   | 戻り先      | **保存も中止も S-04 通常モードへ `replace`**                                       | 4.2      |
| 3   | ルート      | **`/recipes/[id]/edit`**                                                           | 4.3      |
| 4   | 空の行と0件 | **全欄空は捨てる／材料名だけ空は「未入力」で止める／分量の空は `null`／0件は許す** | 4.4      |

---

# 1. 調査結果

## 1.1 Prisma 7.9.1 のトランザクションと一括作成（📄 出典）

`node_modules/@prisma/client/package.json` の `version` は **7.9.1**。

### 対話的トランザクション（関数を渡す形）がある

```ts
// 📄 generated/prisma/internal/class.ts L183（配列を渡す形）と L185（関数を渡す形）
$transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): ...
$transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => runtime.Types.Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): ...
```

- **関数を渡す形を使う。** 「所有者のレシピが1件あったときだけ消して入れ直す」という**途中の分岐**が要るため。配列を渡す形は分岐できない
- 既定値は **`maxWait` 2000ms / `timeout` 5000ms**（📄 `node_modules/@prisma/client/runtime/client.d.ts` L2017-2021 の JSDoc）。クエリは5本なので収まる見込み（⚠️ 本番で測る。11章）
- **⚠️ 未検証: Neon のプール接続（`DATABASE_URL`。`lib/prisma.ts` が `PrismaPg` に渡している）で対話的トランザクションが通るか。** 段階10 で実際に保存して確かめる

### `createMany` と `updateMany` の入力（📄 出典）

```ts
// 📄 generated/prisma/models/Ingredient.ts L315-322
export type IngredientCreateManyInput = {
  id?: string
  recipeId: string
  name: string
  amount?: string | null
  category: $Enums.Category
  order: number
}

// 📄 generated/prisma/models/Recipe.ts L355-362（updateMany の data。updatedAt を明示で入れられる）
export type RecipeUpdateManyMutationInput = { ...; updatedAt?: ... | Date | string }
```

- `prisma.ingredient.createMany` は `BatchPayload` を返す（📄 `Ingredient.ts` L698-710）。`Step` も同じ形（📄 `Step.ts`）
- **⚠️ `createMany({ data: [] })` の挙動は確かめていない。** 0件のときは**呼ばない**（5.2）。確かめる手間より避けるほうが安い

## 1.2 入れ子のルートの `notFound()`（📄 出典＋⚠️）

📄 `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/not-found.md` L167-169: `notFound()` は**最も近い `not-found` 境界**まで伝わり、ルートに `not-found.tsx` が無ければ**親の境界**が描かれる。

→ **`app/recipes/[id]/edit/` に `not-found.tsx` を置かない。** 親の `app/recipes/[id]/not-found.tsx`（「レシピが見つかりません」＋一覧へ）がそのまま使えるはず。**⚠️ 段階5 でブラウザで存在しないIDを開いて確かめる。**

## 1.3 離脱を止める手段（📄 出典。`HANDOVER.md` 4.2 決定③の調査を取り込む）

**2026-09-26、Next.js 16.3.0 の実物で調べた。**

- 📄 `<Link onNavigate={(e) => e.preventDefault()}>` でアプリ内遷移を止められる（v15.3.0 で追加。`node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md` L453〜・L1094〜「Blocking navigation」）。**ただし Link 経由のクライアント遷移だけ**（同 L499-503）。**`router.push` や「戻る」は対象外**
- 📄 ブラウザの戻る/進むは app-router が `popstate` で処理している（`node_modules/next/dist/client/components/app-router.js` L281-305）。**ドキュメントに「戻る」を止める API は無い**
- 📄 `cacheComponents` は無効（`next.config.ts` が空）。**Activity による画面状態の保持は起きない**
- **S-05 から出る経路は `← 中止`・「保存」・ブラウザの「戻る」・再読み込み/閉じる/URL直打ち だけ**（S-05 のヘッダーに他のリンクは無い）

→ **S-05 には `Link` を置かないので `onNavigate` は使わない。** `← 中止` は `<button>` で、ダイアログを挟んでから `router.replace()` する。

### `beforeunload` は既存の流儀に揃える（📄 出典）

**前例がある。** 解析中の離脱防止（`app/upload/use-analysis.ts` L142-145）:

```ts
const warn = (event: BeforeUnloadEvent) => event.preventDefault();
window.addEventListener("beforeunload", warn);
return () => window.removeEventListener("beforeunload", warn);
```

- **`returnValue` に文字列を入れない。** TypeScript 5.9.3 の `lib.dom.d.ts` L4322〜 で `returnValue` は `@deprecated`。**ブラウザは独自の文言を出し、こちらの文言は表示されない**
- **登録は「変更があるとき」だけ。** 常に登録すると、何も変えていないのに再読み込みで確認が出る
- **⚠️ 未検証: iOS Safari でどこまで効くか。** 段階14 の実機確認で見る。効かなくても失うのは直している途中の内容だけ（決定③）

## 1.4 保存後の S-04 は取り直される（📄 出典＋⚠️）

📄 `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/staleTimes.md` L42: **v15.0.0 で `dynamic` の既定値が 30s → 0s に変わった。** `next.config.ts` は空（上書きなし）。

→ 保存後に `router.replace("/recipes/<id>")` すると、**S-04（動的なページ）は取り直される**はず。`router.refresh()` を足さない。**⚠️ 段階10 でブラウザで、保存直後の S-04 に変更が出ることを確かめる。** 出なければ `refresh()` を足す（ここに記録する）。

## 1.5 S-04 は材料0件・手順0件を描ける（📄 出典）

- 📄 `app/recipes/[id]/ingredient-list.tsx` L131-132: 0件なら「材料が登録されていません。」
- 📄 `app/recipes/[id]/step-list.tsx` L29-30: 0件なら「手順が登録されていません。」

→ **0件の保存を許しても表示側の変更は要らない**（4.4）。

## 1.6 解析結果に空の材料名が入りうる（📄 出典）

📄 `lib/clients/claude.ts` L46-55 のスキーマは `name: z.string()` / `amount: z.string().nullable()` / `steps: z.array(z.string())` で、**最小文字数も最小件数も無い。** つまり**空の材料名・空の手順は、今の保存経路でも理屈の上では DB に入る。**

→ S-05 は**空の値を含むレシピを開けること**。保存時に「全欄空は捨てる／材料名だけ空は止める」が効くので、**開いて保存するだけで掃除される**（材料名が空で分量が `null` の行＝全欄空）。

## 1.7 材料・手順の `id` はどこからも参照されていない（✅ 実測 2026-09-26）

```bash
grep -rn "\.id\b" app lib | grep -i "ingredient\|step"
grep -rn "ingredientId\|stepId" app lib prisma/schema.prisma
```

→ 使われているのは **React の `key` だけ**（`ingredient-list.tsx` L198・L210、`step-list.tsx` L36）。外部キーも無い。**保存のたびに `id` が振り直されても壊れるものは無い**（4.1 の「まとめて置き換え」の前提）。

---

# 2. データモデル

**このフェーズでのスキーマ変更は無い。マイグレーションも発生しない。**

```prisma
model Recipe     { id, userId, title, imageKey, servings, createdAt, updatedAt, ingredients[], steps[] }
model Ingredient { id, recipeId, name, amount?, category, order }
model Step       { id, recipeId, order, text }
enum Category    { SEASONING, VEGETABLE, OTHER }
```

- **`order` は保存時の配列の添字（0から）。** 解析時と同じ規則（`lib/repositories/recipe.ts` の `saveRecipe`）。**削除で飛んだ番号を詰め直す**ので、常に 0..n-1 の連番
- **保存のたびに `Ingredient` / `Step` の `id` が変わる**（1.7 で害が無いことを確認済み）
- **`Recipe.updatedAt` を保存時に明示で更新する。** 材料と手順だけを入れ替えると `Recipe` の行は変わらず、`@updatedAt` が動かないため（5.2）

---

# 3. ファイル構成

```
app/
├── confirm-dialog.tsx              # 【新】確認ダイアログの外枠。delete-dialog.tsx から切り出す（3.1）
├── delete-dialog.tsx               # 外枠を confirm-dialog.tsx に差し替える（挙動は変えない）
├── recipes/[id]/
│   ├── mode.ts                     # editPath() を追加
│   ├── recipe-header.tsx           # 通常モードの上段右に `編集`
│   ├── confirm-bar.tsx             # 「編集する」を追加
│   ├── ingredient-list.tsx         # カテゴリの並びとラベルを lib/recipes/category.ts から取る
│   └── edit/
│       ├── page.tsx                # 【新】S-05 の入口。Server Component。認可と取得
│       ├── recipe-editor.tsx       # 【新】Client。下書きの state・保存・離脱ガード
│       ├── edit-header.tsx         # 【新】`← 中止` /「レシピを編集」/「保存」
│       ├── ingredient-fields.tsx   # 【新】材料の行カード
│       └── step-fields.tsx         # 【新】手順カード
└── api/recipes/[id]/
    └── route.ts                    # PUT を追加。**4つ目の保護付きエンドポイント**
lib/
├── recipes/
│   ├── category.ts                 # 【新】カテゴリの表示順とラベル（S-04 と S-05 で共有）
│   └── contents.ts                 # 【新】材料・手順の下書き→保存形の変換と検証（サーバーとクライアントで共有）
└── repositories/recipe.ts          # replaceRecipeContents() を追加
```

`.kiro/steering/architecture.md` の3層に従う。**Repository は Prisma だけを知る。**

- **表示は Route Handler を経由しない**（Phase 3・4 と同じ）。`edit/page.tsx` から `findRecipeForUser` を直接呼ぶ
- **保存だけ Route Handler が要る。** ブラウザからの操作なので `PUT` を足す。**同じリソースへの別メソッドなので `app/api/recipes/[id]/route.ts` に足す**（Phase 4 の `DELETE` と同じ判断）
- **Service 層は置かない。** 検証と保存以外のビジネスロジックが無い（Phase 3 の `PATCH` と同じ判断）

## 3.1 `components/` は今回も新設しない。ただしダイアログの外枠だけ切り出す

**Phase 3・4 の決着（recipe-view design.md 3.1）を踏襲する。** 「2つ目の利用者が現れてから動かす」。

このフェーズで**2つ目・3つ目の利用者が現れる**のは2つ:

| 部品                       | 利用者                                           | 扱い                                                                              |
| -------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------- |
| **確認ダイアログの外枠**   | 一覧の削除（既存）・行の削除・破棄確認（新）     | **`app/confirm-dialog.tsx` に切り出す**（段階6）                                  |
| **カテゴリの並びとラベル** | S-04 の絞り込み（既存）・S-05 のプルダウン（新） | **`lib/recipes/category.ts` に切り出す**（段階7）。**色のクラスは S-04 側に残す** |

- **置き場所は `app/` 直下**（`delete-dialog.tsx` と並べる）。一覧と編集の両方から使うので、どちらかのルートの下には置かない
- **切り出しは `refactor:` の段階として単独で行う。** 既存の `__tests__/delete-dialog.test.tsx` が**変更なしで全部通る**ことが、挙動を変えていない証拠になる
- **カテゴリのラベルを二重に書かない。** S-04 のタブ「野菜」と S-05 の選択肢「野菜」が別々に定義されていると、片方だけ直してずれる（`lib/recipes/title.ts` の「文言を二重に書かない」と同じ考え方）

---

# 4. 段階1 の4点の理由（2026-09-26 ユーザー決定）

## 4.1 保存の API: `PUT` で材料と手順をまとめて置き換える

| 案                                                    | 判断                                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **`PUT /api/recipes/[id]`。まとめて置き換え**（採用） | 1トランザクションで既存の材料・手順を消して入れ直す。**差分の計算が要らない**                           |
| 既存の `PATCH`（タイトル）を広げる                    | タイトル用と一括置き換え用の分岐が同じ関数に混ざる。**部分更新（PATCH）と全置き換えは意味が違う**       |
| 行ごとに差分を送る（追加・更新・削除の3種）           | 行の `id` を参照している箇所が無い（1.7）ので**差分にしても得るものが無い**。クライアントの状態が複雑化 |

- **body は `{ ingredients: [{ name, amount, category }], steps: [text] }`。** `order` は送らない（配列の順序がそのまま `order`）。**タイトルは含めない**（`REQUIREMENTS.md` 4.7 の線引き）
- **`PUT` の意味**: 「このレシピの材料と手順を、送った内容で丸ごと置き換える」。**送らなかった行は消える**
- **同時に2つのタブで保存すると、後から保存したほうが勝つ。** 調停はしない（requirements.md スコープ外）

## 4.2 戻り先: 保存も中止も S-04 通常モードへ `replace`

| 案                                                 | 判断                                                                                                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **どちらも S-04 通常モードへ `replace`**（採用）   | `UI_DESIGN.md` 2章「保存 → S-04 通常モード」と一致。状態が増えない                                                                                            |
| 来た画面に戻し分ける（`?from=confirm` を持ち回す） | 確認モードの「この内容で決定」は**クエリを外すだけで何も保存しない**（recipe-view design.md 6.8）。確認モードに戻しても、できることは通常モードへ移ることだけ |
| `router.back()`                                    | **URL を直打ちで開いたときに履歴が無く、アプリの外へ出てしまう**                                                                                              |

- **`replace` にする理由**: 保存後に「戻る」で**古い内容の編集画面**に戻ってこないため。中止後も同じ
- **既知の挙動**: S-04 → `編集`（履歴に積む）→ 保存（置き換え）なので、履歴は「S-04, S-04」になる。**保存後の1回目の「戻る」は、同じ S-04 の古いエントリに戻る**（S-04 は取り直されるので中身は新しい。1.4）。確認モードから来た場合は確認モードに戻る。**害は無いので受け入れる**

## 4.3 ルート: `/recipes/[id]/edit`

| 案                               | 判断                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **`/recipes/[id]/edit`**（採用） | `REQUIREMENTS.md` 4.7「編集画面と表示画面は別画面」に沿う                                                                      |
| `/recipes/[id]?edit=1`（クエリ） | 確認モードをクエリにしたのは「**同じ表示の状態違い**」だったから（recipe-view design.md 6.8）。**S-05 はヘッダーも本文も別物** |

- **`app/recipes/[id]/edit/page.tsx` を作ったら、`npx tsc --noEmit` の前に `npx next typegen`**（recipe-view 落とし穴 #25）。`PageProps<"/recipes/[id]/edit">` は生成前には解決しない
- パスの組み立ては `mode.ts` に `editPath()` を足して一元化する（`confirmPath()` と同じ流儀。**URL を各所に直書きしない**）

## 4.4 空の行と0件

| 状態                                   | 扱い                                 | 理由                                                                               |
| -------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------- |
| **全欄が空の材料行**（名前も分量も空） | **保存時に黙って捨てる**             | 「＋ 行を追加」を押して使わなかった行。**止める理由が無い**                        |
| **空の手順**                           | **保存時に黙って捨てる**             | 入力欄が1つなので、空＝全欄空                                                      |
| **材料名だけ空**（分量はある）         | **保存させない。その欄に「未入力」** | 材料名の無い分量は表示できない。**消したつもりか書き忘れか、こちらで決められない** |
| **分量だけ空**                         | **`null` で保存**                    | DB の定義（`amount String?`）どおり。「適量」の書かれていない材料はある            |
| **材料0件・手順0件**                   | **許す**                             | 全部消して書き直したい場面を止めない。S-04 は0件を描ける（1.5）                    |
| **追加した行のカテゴリ**               | **「その他」**                       | 迷ったときの置き場所。野菜・調味料を既定にすると、分類を誤ったまま保存されやすい   |

- **「空」は前後の空白を落としてから判定する。** 空白だけの行は空の行
- **「全欄が空」の判定にカテゴリは含めない。** プルダウンは常に何かが選ばれているので、含めると空の行が存在しなくなる
- 「未入力」の見た目と文言は資料どおり（📄 README「フォーム入力」: 枠 `#B3261E`、補助文「未入力」）

---

# 5. 実装

## 5.1 下書きと保存形の変換・検証（`lib/recipes/contents.ts`。サーバーとクライアントで共有）

**`lib/recipes/title.ts` と同じ位置づけ。** クライアントは保存前の整形と欄ごとの案内に、サーバーは `PUT` の検証に使う。**規則と文言を二重に書かない。**

**⚠️ サーバー専用の依存を持たせない**（recipe-view 落とし穴 #27）。`Category` の**値**は `@/generated/prisma/enums` から取る。`@/generated/prisma/client` から値を取るとビルドが落ちる。

```ts
// lib/recipes/contents.ts
import { Category } from "@/generated/prisma/enums";

/** 画面が持つ材料の下書き。**入力欄の文字列そのまま**（空白も空文字も残っている） */
export type IngredientDraft = {
  /** React の key。保存済みの行は DB の id、追加した行はクライアントで振る */
  key: string;
  name: string;
  /** 入力欄の文字列。**null ではなく空文字**で持つ（input の value に null を渡せない） */
  amount: string;
  category: Category;
};

export type StepDraft = { key: string; text: string };

/** API に送り、DB に書く形。**`order` は持たない**（配列の添字が order になる） */
export type IngredientInput = { name: string; amount: string | null; category: Category };
export type RecipeContentsInput = { ingredients: IngredientInput[]; steps: string[] };

/** 追加した行のカテゴリ（design.md 4.4） */
export const NEW_INGREDIENT_CATEGORY = Category.OTHER;

export const EMPTY_FIELD_MESSAGE = "未入力"; // 📄 README「フォーム入力」のエラー時の補助文

/** 全欄が空か。**カテゴリは見ない**（design.md 4.4） */
export function isBlankIngredient(draft: IngredientDraft): boolean {
  return draft.name.trim() === "" && draft.amount.trim() === "";
}

/**
 * 下書きを保存形に変える。**全欄が空の行・空の手順を捨て、前後の空白を落とす。**
 * 分量の空文字は null にする。**検証はしない**（材料名だけ空の行も残る。検証は下の関数）
 */
export function toContentsInput(
  ingredients: readonly IngredientDraft[],
  steps: readonly StepDraft[],
): RecipeContentsInput {
  return {
    ingredients: ingredients
      .filter((draft) => !isBlankIngredient(draft))
      .map((draft) => {
        const amount = draft.amount.trim();
        return {
          name: draft.name.trim(),
          amount: amount === "" ? null : amount,
          category: draft.category,
        };
      }),
    steps: steps.map((step) => step.text.trim()).filter((text) => text !== ""),
  };
}
```

**検証の関数は2種類に分ける。**

| 関数                           | 使う側       | 返すもの                                                                     |
| ------------------------------ | ------------ | ---------------------------------------------------------------------------- |
| `ingredientNameProblem(draft)` | クライアント | その行の材料名の欄に出す文言（「未入力」/ 長すぎる）か `null`                |
| `amountProblem(draft)`         | クライアント | 分量の欄に出す文言（長すぎる）か `null`。**空は問題にしない**                |
| `stepTextProblem(step)`        | クライアント | 手順の本文の欄に出す文言（長すぎる）か `null`。**空は問題にしない**          |
| `contentsProblem(input)`       | サーバー     | `RecipeContentsInput` 全体の問題を1つ（`ValidationError` に載せる）か `null` |
| `isCategory(value)`            | サーバー     | `unknown` が enum の値のどれかか（`PUT` の body の型付けに使う）             |

- **どちらも例外を投げない**（`titleProblem()` と同じ。入力のたびに例外を作らない）
- `contentsProblem` が見るもの: 件数の上限／材料名が空でない／各文字数の上限／**`category` が enum の値のどれか**／手順が空でない
- **文字数はコードポイントで数える**（`[...text].length`。`title.ts` と同じ理由）

### 上限値（⚠️ 根拠のある数値ではない。`MAX_TITLE_LENGTH` と同じ扱い）

| 定数                         | 値   | 置いた理由                                                                |
| ---------------------------- | ---- | ------------------------------------------------------------------------- |
| `MAX_INGREDIENTS`            | 100  | 1つのレシピの材料として十分に多い。**無制限の配列を受け取らないための柵** |
| `MAX_STEPS`                  | 50   | 同上                                                                      |
| `MAX_INGREDIENT_NAME_LENGTH` | 100  | タイトルと同じ                                                            |
| `MAX_AMOUNT_LENGTH`          | 50   | 分量欄は 96px 幅。「大さじ1と1/2（約22g）」程度で足りる                   |
| `MAX_STEP_LENGTH`            | 1000 | 料理本の1手順は長くても数百字                                             |

- **実データを見て決め直してよい**（段階14）。Vercel の body 上限 4.5MB（`.kiro/steering/tech-stack.md`）より先にこちらが効く
- **クライアントは件数の上限に達したら「＋ 行を追加」を無効にする**のではなく、**保存時にサーバーの文言を出すだけ**にする。100行に届く場面は想定しにくく、UI を増やさない

## 5.2 Repository（`replaceRecipeContents`）

```ts
// lib/repositories/recipe.ts に追加する
import type { RecipeContentsInput } from "@/lib/recipes/contents";
import { prisma } from "@/lib/prisma";

/**
 * 材料と手順を丸ごと置き換える。**他人のレシピは1行も変わらない。**
 *
 * 置き換えられた件数（0 か 1）を返す。**0 なら「存在しない」か「他人のもの」**
 * （呼び出し側は区別しない。updateRecipeTitle と同じ契約）。
 *
 * **1つのトランザクションで行う。** 消したあとで入れ直しに失敗すると、
 * 材料が全部消えたレシピが残る。対話的トランザクションなら途中の失敗で全部戻る。
 */
export async function replaceRecipeContents(
  userId: string,
  recipeId: string,
  contents: RecipeContentsInput,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    // ⚠️ **所有チェックはここ。** userId を where に入れた updateMany の件数で見る
    // （落とし穴 #19 / recipe-list #9 と同じ形）。updatedAt も同時に進める
    // （材料と手順だけを入れ替えると Recipe の行が変わらず @updatedAt が動かない）
    const owned = await tx.recipe.updateMany({
      where: { id: recipeId, userId },
      data: { updatedAt: new Date() },
    });

    if (owned.count === 0) {
      // 何も消さずに抜ける。**ここより下は所有が確認できたときだけ走る**
      return 0;
    }

    await tx.ingredient.deleteMany({ where: { recipeId } });
    await tx.step.deleteMany({ where: { recipeId } });

    // 0件のときは呼ばない（design.md 1.1 の ⚠️）
    if (contents.ingredients.length > 0) {
      await tx.ingredient.createMany({
        // 列は1つずつ書く（スプレッドにすると実行時に混ざった余計なキーまで通る）
        data: contents.ingredients.map(({ name, amount, category }, order) => ({
          recipeId,
          name,
          amount,
          category,
          order,
        })),
      });
    }

    if (contents.steps.length > 0) {
      await tx.step.createMany({
        data: contents.steps.map((text, order) => ({ recipeId, text, order })),
      });
    }

    return 1;
  });
}
```

- **所有チェックを `deleteMany` の条件に頼らない。** `ingredient.deleteMany({ where: { recipeId, recipe: { userId } } })` で消す側は守れても、**`createMany` は他人の `recipeId` にも行を足せてしまう。** 先に所有を確かめ、確かめられなかったら**何もしない**
- **無いとどうなるか**: `updateMany` の `where` から `userId` を落とすと、**レシピIDを知っていれば他人の材料を書き換えられる。** 自分のレシピしか作らないテストでは通る（Phase 3 の反省）→ **Repository のテストで他人のレシピを混ぜる**（8章）
- **見分け方**: 他人の `userId` で呼んで戻り値が `0`、かつ**他人の材料・手順が1行も変わっていない**こと

## 5.3 Route Handler（`PUT`）

```ts
// app/api/recipes/[id]/route.ts に追加する（PATCH・DELETE と同じファイル）
import { errorResponse, successResponse } from "@/lib/api-response";
import { requireUserId } from "@/lib/auth/session";
import { RecipeNotFoundError, ValidationError } from "@/lib/errors";
import { contentsProblem, type RecipeContentsInput } from "@/lib/recipes/contents";
import { replaceRecipeContents } from "@/lib/repositories/recipe";

export async function PUT(request: Request, context: RouteContext<"/api/recipes/[id]">) {
  try {
    // ⚠️ Route Handler の params も Promise（recipe-view 落とし穴 #22）
    const { id } = await context.params;

    // クライアントが送ってきた userId は見ない。**セッションだけが根拠**
    const userId = await requireUserId();

    const contents = await readContents(request);

    const replaced = await replaceRecipeContents(userId, id, contents);

    // 0 は「存在しない」か「他人のもの」。**区別せず 404**
    if (replaced === 0) {
      throw new RecipeNotFoundError();
    }

    return successResponse({ id });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- `readContents(request)` は `PATCH` の `readTitle` と同じ形で書く: JSON のパース失敗は `cause` に隔離して固定文言／**`unknown` から型を1つずつ確かめる**（配列か・各要素がオブジェクトか・`name` が文字列か・`amount` が文字列か `null` か・`category` が文字列か・`steps` の各要素が文字列か）→ `contentsProblem()` で規則を見る
- **サーバーでも空行の除去はしない。** クライアントが `toContentsInput()` で整えてから送る。**空の材料名・空の手順が届いたら 400**（整えずに送るクライアントのバグを隠さない）。前後の空白は落とさず、そのまま `contentsProblem` に渡す（整えるのはクライアントの責務、と1箇所に決める）
  - ⚠️ ただし `"  "` のような空白だけの材料名は `contentsProblem` で**空として弾く**（`trim()` して判定）。保存される値に空白だけの名前が入らないことはサーバーで保証する
- **新しいエラーコードは足さない。** `VALIDATION_ERROR`（400）・`RECIPE_NOT_FOUND`（404）・`UNAUTHORIZED`（401）が既存（`lib/errors.ts` / `lib/api-response.ts` の `STATUS` 表）。`ValidationError` に渡す文言は **`lib/recipes/contents.ts` の定数だけ**（recipe-view design.md 5.6「`ValidationError` だけ `message` を引数で受け取る」の制約）

## 5.4 画面の入口（`app/recipes/[id]/edit/page.tsx`）

S-04 の `page.tsx` と同じ流儀。

```tsx
import { notFound, redirect } from "next/navigation";

import { getUserId } from "@/lib/auth/session";
import { findRecipeForUser } from "@/lib/repositories/recipe";

import { RecipeEditor } from "./recipe-editor";

export default async function RecipeEditPage(props: PageProps<"/recipes/[id]/edit">) {
  const { id } = await props.params; // ⚠️ await が要る（recipe-view 落とし穴 #1）

  // ⚠️ requireUserId() を使わない（画面ではリダイレクトではなくエラー画面になる。落とし穴 #5）
  const userId = await getUserId();
  if (!userId) {
    redirect("/login");
  }

  const recipe = await findRecipeForUser(userId, id);
  if (!recipe) {
    notFound(); // 親の app/recipes/[id]/not-found.tsx が描かれる（1.2）
  }

  // **プレーンな値だけ渡す。** Date は渡さない（recipe-view 落とし穴 #15）
  return (
    <RecipeEditor
      recipeId={recipe.id}
      ingredients={recipe.ingredients.map(({ id, name, amount, category }) => ({
        id,
        name,
        amount,
        category,
      }))}
      steps={recipe.steps.map(({ id, text }) => ({ id, text }))}
    />
  );
}
```

## 5.5 下書きの state（`recipe-editor.tsx`）

- **材料と手順の下書きを `useState` で持つ。** 状態管理ライブラリは入れない（`.kiro/steering/tech-stack.md`）
- **初期値は props から一度だけ作る。** 分量の `null` は空文字に、`id` は `key` に
- **追加した行の `key` はクライアントで振る。** `useRef` のカウンタで `new-1`, `new-2`…。**配列の添字を `key` にしない**（途中の行を消すと、後ろの行の入力欄に前の行の値が残って見える）
- **「変更があるか」は保存形で比べる:**

```ts
const initial = useMemo(
  () => JSON.stringify(toContentsInput(initialIngredients, initialSteps)),
  [],
);
const dirty = JSON.stringify(toContentsInput(ingredients, steps)) !== initial;
```

- **下書き同士ではなく保存形で比べる理由**: 空の行を足しただけ・前後に空白を足しただけは、**保存しても DB が変わらない**ので「変更」に数えない（requirements.md Req6）。比べ方を「保存したら何が書かれるか」に揃えると、定義が1つで済む
- **欄ごとのエラー表示は「保存を押したあと」から出す。** 入力中に「未入力」を出すと、行を追加した直後から赤くなる。一度保存を押したら、以降は入力のたびに出し直す

## 5.6 保存

```
「保存」を押す
  1. 二重送信を止める（保存中なら何もしない。ボタンも disabled）   ← 2層（recipe-list 落とし穴 #31）
  2. 欄ごとの検証（ingredientNameProblem）。問題があれば最初の欄にフォーカスして止める
  3. toContentsInput() で整えて PUT
  4. 成功 → router.replace(recipePath(id))                           ← 4.2
     失敗 → 画面に留まり、文言を出す。**下書きは消さない**
```

- **失敗時の文言**: サーバーの文言をそのまま出す。JSON でない応答は `INTERNAL_ERROR` に倒す。`fetch` 自体が投げたら通信の文言（`delete-dialog.tsx` の `messageFromResponse` / `NETWORK_MESSAGE` と同じ流儀。**クライアントで独自の文言を作らない**）
- **出す場所**: ヘッダーの直下、本文の先頭。資料「エラー表示（軽微）」の見た目、`role="alert"`（Phase 4 のダイアログ内の失敗表示と同じ）
- **成功した直後の遷移で離脱確認を出さない。** `router.replace` はクライアント遷移で `beforeunload` は発火しない（1.3）ので、特別な処理は要らない見込み。**requirements.md Req6 の受け入れ基準で確かめる**
- **⚠️ フォーカスした入力欄が固定ヘッダーの下に潜らないか**は段階10 でブラウザで見る。潜るなら入力欄に `scroll-margin-top` を入れる（S-04 の `--recipe-header-h` と同じ考え方。S-05 のヘッダーは1段で高さがほぼ一定）

## 5.7 離脱ガード

| 経路                           | 変更なし             | 変更あり                                 |
| ------------------------------ | -------------------- | ---------------------------------------- |
| `← 中止`                       | そのまま `replace`   | **破棄確認ダイアログ**（5.8）            |
| 「保存」                       | そのまま保存して戻る | そのまま保存して戻る                     |
| 再読み込み・閉じる・URL 直打ち | 何も出ない           | **`beforeunload`**（ブラウザ標準の確認） |
| ブラウザの「戻る」             | 戻る                 | **戻る（止めない。決定③）**              |

- **`beforeunload` の登録は `useEffect` で `dirty` に追従させる**（`use-analysis.ts` の前例と同じ形。1.3）。`dirty` が `false` に戻ったら外す
- **「変更なしで保存」も通す。** 保存ボタンを変更の有無で無効にしない（押して何も起きないように見えるより、保存して S-04 に戻るほうが分かりやすい）

## 5.8 確認ダイアログ（行の削除・破棄確認）

**`app/confirm-dialog.tsx` の外枠を使う**（3.1）。外枠が持つもの: 背景・`role="dialog"` / `aria-modal`・見出しとの `aria-labelledby`（`useId()`。📄 `@types/react` の `index.d.ts` L1907）・`Escape` と背景クリックで閉じる・開いた直後に**上のボタン（非破壊側）**へフォーカス・縦並びのボタン2つ。

**⚠️ ネイティブ `<dialog>` を使わない**（jsdom 30 が `showModal` 未実装。recipe-list 落とし穴 #29）。

| 用途     | 見出し         | 本文                               | 上（非破壊） | 下（破壊） |
| -------- | -------------- | ---------------------------------- | ------------ | ---------- |
| 材料の行 | この行を削除   | 「しょうゆ 大さじ2」を削除します。 | やめる       | 削除する   |
| 手順     | この手順を削除 | 手順3を削除します。                | やめる       | 削除する   |
| 破棄確認 | 編集を破棄     | 保存していない変更は失われます。   | 編集を続ける | 破棄する   |

- **見出し「この行を削除」は資料の見本どおり**（📄 `v2.dc.html` L411）
- **本文に「元に戻せません」を書かない。** 資料の見本は書いているが、**行の削除は保存するまで確定せず、`← 中止` で全部戻せる**。事実と違う文言を出さない
- **材料の行の本文は「材料名 ＋ 空白 ＋ 分量」。** 分量が空なら材料名だけ。**材料名が空（分量だけの行）なら分量だけ**
- **全欄が空の行・空の手順は、ダイアログを出さずに消す**（requirements.md Req4）
- **ラベルは体言止め・最大8文字**（📄 README「ボタン」）。「編集を続ける」は6文字
- **破壊側のボタンの見た目は README「ボタン」表の「危険」**（面は白・文字 `#B3261E`・枠 `#E3AEAA`）。→ 6.3 食い違い10

## 5.9 S-04 側の変更

| ファイル            | 変更                                                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `mode.ts`           | `editPath(recipeId)` を足す（`/recipes/<id>/edit`）                                                                                     |
| `recipe-header.tsx` | **通常モードの上段を両端揃えにし、右に `編集`**（`Link`。見た目は「操作」＝枠線ボタン、48px）。確認モードは上段ごと出さない（今のまま） |
| `confirm-bar.tsx`   | 「この内容で決定」の下に**「編集する」（副次ボタン、56px）**。`Link` で `editPath()` へ                                                 |

- **`編集` / 「編集する」は `Link`（`<a>`）にする。** 押すと別の画面へ移るだけで、その場の状態は変えない。`router.push` のボタンにするより、中クリック・長押しでの新しいタブも効く
- **見た目は「操作」のまま**（README の中核ルールの表が `編集` を「操作」の例に挙げている）。要素が `<a>` でも見た目の分類は変えない
- **Phase 3・4 のテストが「`編集` が出ない」ことを固定している**（`recipe-header.test.tsx` / `confirm-bar.test.tsx`）。**逆向きに書き換える**（出ること・確認モードでは上段ごと出ないこと）

---

# 6. 画面

**`UI_DESIGN.md` が構造（何をどこに置くか）、この章が実装上の決定**（`.kiro/README.md` 5）。

## 6.1 視覚仕様の対応表（📄 出典: 引き継ぎ資料 README「Screens 6」「フォーム入力」「ボタン」「手順リスト」「確認ダイアログ」／`v2.dc.html` L538〜）

**hifi なので確定値。推測で変えない。** トークン名は `app/globals.css` の `@theme` にある。

| 部位                 | 仕様                                                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ヘッダー**         | 面 `--color-header` / padding 6px 12px / 下境界 1px `--color-border`（モック）/ 両端揃え・中央寄せ                                                        |
| 　左 `← 中止`        | 「移動」の見た目（面なし・枠なし・`--color-link`・17px・48px）                                                                                            |
| 　中央               | **「レシピを編集」**（食い違い9）19px / 700                                                                                                               |
| 　右「保存」         | 面 `--color-primary`・白文字・**角丸8px**・48px・17px・padding 10px 16px（README / モック L544）                                                          |
| **本文**             | padding 16px / gap 14px / **max-width 640px 中央寄せ**                                                                                                    |
| **行カード（材料）** | 面 `--color-surface` / 枠 1px `--color-border` / 角丸12px / padding 14px / 縦 gap 10px                                                                    |
| 　1段目              | 材料名入力（伸びる・最小幅0）＋ 分量入力（**幅96px・伸縮しない**）、gap 10px、各 min-height 52px                                                          |
| 　2段目              | カテゴリ select（伸びる）＋ 削除ボタン（**幅96px・危険スタイル**）、gap 10px、各 min-height 52px                                                          |
| 　入力欄             | 19px（select は 17px）/ padding 12px 14px / 枠 1.5px `--color-border-strong` / **角丸8px** / 面白（モック L549-554）                                      |
| 　focus              | 枠 `--color-link` ＋ outline 3px `--color-accent-light`（README「フォーム入力」）                                                                         |
| 　エラー時           | 枠 `--color-danger`、補助文「未入力」15px `--color-danger`（README「フォーム入力」）                                                                      |
| **＋ 行を追加**      | 枠 1.5px **dashed** `--color-link` / 文字 `--color-link` 19px 500 / 56px / 幅100% / 角丸12px                                                              |
| **手順カード**       | 行カードと同じ外枠。中は 番号（40px の丸、面 `--color-primary-soft`、文字 `--color-link` 19px 700）＋ 本文の入力欄（複数行）＋ 削除                       |
| **確認ダイアログ**   | 面白 / 角丸12px / 影 e2 / padding 24px / max-width 340px / gap 12px。見出し 22px 700、本文 17px lh1.8 `--color-ink-control`、ボタン縦並び gap 10px 各56px |
| **保存中の「保存」** | README「ボタン」の「無効」（面 `#DFF1F3` / 文字 `#8AA3AB` / 17px / 48px）。ラベル「保存中…」                                                              |

**トークン名は実装時に `app/globals.css` で確かめる**（「無効」の2色のトークン名は未確認。**無ければ近い色で代用せず、recipe-view design.md 5.7 と同じ手順で足す**。落とし穴 #28）。

## 6.2 資料に無いので決めたこと（判断。資料の値ではない）

| 項目                     | 決定                                                                                                                                                                   | 理由                                                                                                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ヘッダーを固定するか** | **`position: sticky` で上に固定**                                                                                                                                      | モックは「ヘッダー固定・本文だけスクロール」の形（L540 `flex: none`）。S-04 と同じく実アプリでは `window` スクロール＋ sticky で再現する（recipe-view design.md 6.4）。**「保存」がいつでも押せる** |
| **節の見出し**           | 「**材料**」「**作り方**」を 22px 700 で置く（S-04 の節見出しと同じ）                                                                                                  | 資料の編集画面は材料だけなので見出しが無い。2節になると境目が要る                                                                                                                                   |
| **手順カードの中の並び** | 1段目: 番号の丸 ＋ 本文の入力欄（gap 16px、上揃え）／2段目: 右端に削除ボタン（幅96px）                                                                                 | 行カードの「2段目の右端に削除」と揃える。番号と本文の関係は「手順リスト」と同じ                                                                                                                     |
| **手順の入力欄**         | `<textarea>`、**3行ぶんの高さ**から。19px / lh は README「フォーム入力」に行間の指定が無いので S-04 の手順本文（1.9）に揃える                                          | 「複数行」（決定①）。手順は1〜3行が多い                                                                                                                                                             |
| **入力欄のラベル**       | 見えるラベルは置かない（モックどおり）。**`aria-label`** で「材料名」「分量」「カテゴリ」「手順3の本文」を付ける。空の欄には placeholder（「材料名」「分量」「手順」） | モックは行カードにラベルを描いていない。読み上げと空欄の意味だけ補う                                                                                                                                |
| **追加したとき**         | 追加した行の**材料名の欄（手順なら本文）にフォーカス**                                                                                                                 | 追加して何も起きないように見えないように                                                                                                                                                            |
| **消したとき**           | その節の「＋ 行を追加」（「＋ 手順を追加」）に**フォーカスを移す**                                                                                                     | 消したボタンと一緒にフォーカスが消えると、キーボード操作で迷子になる                                                                                                                                |
| **ボタンの種類**         | 画面内のボタンは全部 `type="button"`。`<form>` で包まない                                                                                                              | **Enter（スマホの「実行」）で意図せず保存が走らない**ように（落とし穴 #N3）                                                                                                                         |

## 6.3 資料との食い違い

### 食い違い9: ヘッダー中央の文言（決定①。資料からの意図的な逸脱）

| 出典                                   | 文言                 |
| -------------------------------------- | -------------------- |
| README「Screens 6」/ `v2.dc.html` L543 | 「材料を編集」       |
| **採用（2026-09-26 ユーザー決定）**    | **「レシピを編集」** |

**中身が材料だけでなくなる**ため（作り方の節を足した）。**⚠️ 資料の記述だけを見て「材料を編集」に戻さないこと。** テストで文言を固定する。

### 食い違い10: 確認ダイアログの見本とボタン仕様（Phase 4 の決着を踏襲）

`v2.dc.html` L414-415 の見本は **「削除する」が上で、面が赤く塗られている**。

| 項目           | 見本（`v2.dc.html`）   | 採用                                                       | 根拠                                                                                                   |
| -------------- | ---------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 並び           | 削除する → やめる      | **やめる → 削除する**                                      | 同じ README「確認ダイアログ」の「**破壊的動作を上に置かない**」。Phase 4 と同じ（`UI_DESIGN.md` S-02） |
| 破壊側の見た目 | 面 `#B3261E` ＋ 白文字 | **面は白・文字 `#B3261E`・枠 `#E3AEAA`**（README「危険」） | README「ボタン」表。Phase 4 の `delete-dialog.tsx` と同じ                                              |
| 本文の末尾     | 「元に戻せません。」   | **書かない**                                               | 保存前は戻せる（5.8）                                                                                  |

**「HTML はリファレンスであって正本ではない」**（確定事項。recipe-list 食い違い8 と同じ性質）。

### 食い違い11: 行カードの入力欄の寸法

README「フォーム入力」は **min-height 56px / padding 14px 16px / 角丸12px**、「Screens 6」とモックの行カードは **min-height 52px / padding 12px 14px / 角丸8px**。

**行カードの中は「Screens 6」を採る。** 画面の節のほうが個別の指定で、1行に2つ並べる前提の寸法になっている。52px はタップ領域の下限 48px を満たす。

## 6.4 「移動 / 操作 / 絞り込み」との関係

- **「保存」の面付きボタンは資料が Screens 6 で指定している値**で、こちらが足した4種類目ではない。**中核ルールの表はヘッダーの移動・操作・絞り込みの描き分け**で、「保存」はそのどれでもない**主要ボタン**（README「ボタン」）の小型版
- **`← 中止` は「移動」の見た目**（押すと S-04 に戻るだけ）。ダイアログを挟んでも見た目は変えない

---

# 7. エラー設計

## 7.1 画面側（S-05）

| 起きること                       | 出すもの                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| 未ログイン                       | `/login` へリダイレクト                                                                    |
| 存在しないID・他人のレシピID     | 親の `not-found.tsx`（「レシピが見つかりません」）。**区別しない**                         |
| 材料名だけ空の行がある状態で保存 | **送らない。** その欄に「未入力」、最初の欄にフォーカス                                    |
| 保存に失敗（400 / 404 / 500）    | サーバーの文言を本文の先頭に出す。**画面に留まり、下書きを消さない**                       |
| 通信そのものの失敗               | 「通信に失敗しました。通信環境を確認して、もう一度お試しください。」（Phase 4 と同じ文言） |

- **保存で 404 が返ったとき**（別のタブでレシピを消した等）も同じ扱い。文言は既存の `RecipeNotFoundError` のもの。戻り先の案内は文言に含まれていないが、`← 中止` がある（**行き止まりにならない**）

## 7.2 API 側（`PUT`）

| 状況                             | コード             | HTTP | 文言                                                       |
| -------------------------------- | ------------------ | ---- | ---------------------------------------------------------- |
| 未ログイン                       | `UNAUTHORIZED`     | 401  | 既存                                                       |
| JSON でない / 形が違う           | `VALIDATION_ERROR` | 400  | 「リクエストの形式が正しくありません。」（`PATCH` と同じ） |
| 材料名が空 / 上限超え / 手順が空 | `VALIDATION_ERROR` | 400  | `lib/recipes/contents.ts` の定数。**原因と直し方**         |
| 存在しない / 他人のもの          | `RECIPE_NOT_FOUND` | 404  | 既存。**区別しない**                                       |
| DB の失敗                        | `INTERNAL_ERROR`   | 500  | 既存の固定文言。**トランザクションで何も変わっていない**   |

**新しいエラーコードは足さない。** 足す場合は `lib/errors.ts` と `lib/api-response.ts` の `STATUS` 表の**両方**に（recipe-view 落とし穴 #20）。

---

# 8. テスト方針

Phase 4 の 503件に足す。**Vitest + React Testing Library。クリックは `fireEvent`**（`user-event` は入っていない。依存を増やさない）。

| 対象                    | 何を固定するか                                                                                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toContentsInput`       | 全欄空の行・空の手順を捨てる／前後の空白を落とす／分量の空が `null`／**カテゴリだけ変えた空の行も捨てる**／順序を保つ                                                                               |
| `ingredientNameProblem` | 材料名だけ空で「未入力」／全欄空は問題なし（捨てられる）／上限超え                                                                                                                                  |
| `contentsProblem`       | 空の材料名・空白だけの材料名・空の手順・件数と文字数の上限・**enum に無いカテゴリ**・コードポイントで数える                                                                                         |
| `replaceRecipeContents` | **他人の userId で 0 を返し、他人の材料・手順が1行も変わらない**／自分のなら置き換わる／`order` が 0 からの連番／`updatedAt` を更新／0件なら `createMany` を呼ばない                                |
| `PUT` ルート            | 401 / 400（形・規則）/ 404 / 200。**body の `userId` を見ない**                                                                                                                                     |
| `edit/page.tsx`         | 未ログインで `/login`／存在しないIDで `notFound()`／`Date` を渡していない                                                                                                                           |
| 編集画面                | 初期値が入る／行と手順の追加・削除（ダイアログ・空なら無し）／番号の詰め直し／保存で PUT の body が整えた形／「未入力」で送らない／二重送信しない／失敗で下書きが残る／**見出しが「レシピを編集」** |
| 離脱ガード              | 変更なしの `← 中止` はダイアログ無し／変更ありでダイアログ／空行の追加だけでは変更扱いしない／`beforeunload` の登録と解除                                                                           |
| `ConfirmDialog`         | `Escape`・背景クリックで閉じる／開いた直後の焦点が上のボタン／**既存の `delete-dialog.test.tsx` が変更なしで通る**                                                                                  |
| S-04                    | 通常モードに `編集`（リンク先が `/recipes/<id>/edit`）／確認モードに上段が無い／確認バーに「この内容で決定」→「編集する」の順                                                                       |

## テストを書くときの前提

- **Route Handler のテストは node 環境で走らせる**（ファイル先頭に `// @vitest-environment node`。recipe-view 落とし穴 #21）。既存の `__tests__/recipe-patch-route.test.ts` に揃える
- **Repository をモックしたルートのテストは所有チェックを担保しない**（Phase 3 の反省）。**スコープは Repository 層のテストで担保する**
- **`replaceRecipeContents` のテストは、`$transaction` に「`where` を実際に適用する偽の `tx`」を渡す。** 他人のレシピと材料を混ぜておき、**結果として**他人の行が残っていることを見る（`__tests__/recipe-list-query.test.ts` の `fakeFindMany` と同じ手）。クエリの形だけを見ると、`userId` を落としても通る
  - **ロールバックそのものはテストしない。** DB（Postgres）と Prisma の責務。段階10 の実保存で「保存が通る」ことだけ確かめる
- **編集画面のテストは `next/navigation` のモックに `useRouter`（`replace`）が要る**（recipe-list 落とし穴 #32）
- **テストは「通ること」ではなく「間違えたときに落ちること」を、実際に壊して確かめる。** 最低限壊すもの: `updateMany` の `where` の `userId`／空行の除去／カテゴリを空判定に含める／二重送信の防止／`dirty` の比べ方／ダイアログのボタン順

## 自動テストで担保しないもの

- **見た目**（寸法・色・破線）。jsdom は Tailwind を解釈しない
- **ヘッダーの固定と、フォーカスした欄が潜らないか**。ブラウザでしか分からない
- **`beforeunload` の確認がブラウザに実際に出るか**（jsdom ではイベントの登録しか見られない）
- **トランザクションが Neon で通るか**（1.1 の ⚠️）

---

# 9. 落とし穴の一覧

**着手前に書いているので、実装中に増える。** 過去フェーズの番号と区別するため、このフェーズの新規分は **#N1〜** とする。

## 9.1 このフェーズで新しく踏みそうなもの

| #   | 落とし穴                                                             | 症状                                                                                | 対処      |
| --- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------- |
| N1  | 所有チェックを `deleteMany` の条件（`recipe: { userId }`）に頼る     | 消す側は守れても **`createMany` が他人の `recipeId` に行を足せる**                  | 5.2       |
| N2  | 材料を消してから入れ直すのをトランザクションの外でやる               | 入れ直しに失敗すると**材料が全部消えたレシピ**が残る                                | 5.2       |
| N3  | 画面を `<form>` で包む / ボタンの `type` を省く                      | `<form>` 内の `<button>` の既定は submit。**Enter や「＋ 行を追加」で保存が走る**   | 6.2       |
| N4  | 配列の添字を `key` にする                                            | 途中の行を消すと、**後ろの行の入力欄に前の行の値が残って見える**                    | 5.5       |
| N5  | 「変更があるか」を下書き同士で比べる                                 | 空の行を足しただけで引き止めが出る                                                  | 5.5       |
| N6  | 「全欄が空」の判定にカテゴリを含める                                 | プルダウンは常に値があるので、**空の行が存在しなくなり**、未使用の行で保存が止まる  | 4.4       |
| N7  | `beforeunload` を常に登録する                                        | 何も変えていないのに再読み込みで確認が出る                                          | 1.3 / 5.7 |
| N8  | `returnValue` に独自の文言を入れて表示されると思う                   | **ブラウザは独自の文言を出す**（`returnValue` は非推奨）                            | 1.3       |
| N9  | `router.back()` で戻す                                               | URL 直打ちで開くと履歴が無く、**アプリの外へ出る**                                  | 4.2       |
| N10 | 保存後に `router.push` で戻す                                        | 「戻る」で古い内容の編集画面に戻ってくる                                            | 4.2       |
| N11 | `createMany({ data: [] })` を呼ぶ                                    | 挙動を確かめていない（1.1 の ⚠️）。**0件なら呼ばない**                              | 5.2       |
| N12 | カテゴリのラベルを S-05 に書き直す                                   | S-04 のタブと S-05 の選択肢がずれる                                                 | 3.1       |
| N13 | 資料どおりヘッダー中央を「材料を編集」にする                         | **決定①で「レシピを編集」。** 資料のほうが古い扱い                                  | 6.3       |
| N14 | 資料の見本どおりダイアログの「削除する」を上に・赤塗りにする         | README の「破壊的動作を上に置かない」「危険」ボタン仕様と矛盾。**Phase 4 と揃える** | 6.3       |
| N15 | 行削除のダイアログに「元に戻せません」と書く                         | 保存前は `← 中止` で戻せる。**事実と違う**                                          | 5.8       |
| N16 | 分量の `null` をそのまま `<input value>` に渡す                      | React が制御/非制御の切り替えを警告する。**空文字で持つ**                           | 5.1       |
| N17 | Phase 3・4 の「`編集` が出ない」テストを消すだけで済ませる           | 確認モードで上段が出ないことの担保まで消える。**逆向きに書き換える**                | 5.9       |
| N18 | `ConfirmDialog` への切り出しで `delete-dialog.test.tsx` を書き換える | 挙動を変えていない証拠が無くなる。**テストは変えずに通す**                          | 3.1       |

## 9.2 過去フェーズから引き継ぐもの（このフェーズで踏みうるもの）

| #                   | 落とし穴                                                   | このフェーズでの該当箇所                 |
| ------------------- | ---------------------------------------------------------- | ---------------------------------------- |
| recipe-view #1・#22 | `params` を `await` しない                                 | `edit/page.tsx`・`PUT`                   |
| recipe-view #5      | `requireUserId()` を画面で使う                             | `edit/page.tsx`                          |
| recipe-view #15     | `Date` を Client Component に渡す                          | `edit/page.tsx` → `RecipeEditor`         |
| recipe-view #19     | `update({ where: { id } })` で所有チェックを外に出す       | `replaceRecipeContents`                  |
| recipe-view #20     | 新しいエラーを `lib/errors.ts` にだけ足す                  | 足さない方針（7.2）                      |
| recipe-view #21     | Route Handler のテストを jsdom で走らせる                  | `PUT` のテスト                           |
| recipe-view #25     | ページを作った直後に `tsc`（typegen 前）                   | `/recipes/[id]/edit`                     |
| recipe-view #27     | クライアントで `@/generated/prisma/client` から値を import | `lib/recipes/contents.ts`・`category.ts` |
| recipe-view #28     | 資料の色を近い既存トークンで代用する                       | 「無効」ボタンの2色（6.1）               |
| recipe-view #29     | 設計書にクラスに見える文字列を書く                         | この文書（`@source not` で塞いである）   |
| recipe-list #17     | 中段の上余白12px をいじる                                  | `recipe-header.tsx` に `編集` を足すとき |
| recipe-list #29     | ネイティブ `<dialog>`                                      | `ConfirmDialog`                          |
| recipe-list #31     | 二重送信を防がない                                         | 「保存」                                 |
| recipe-list #32     | `next/navigation` のモックに `useRouter` が無い            | 編集画面・S-04 のテスト                  |
| recipe-list #33     | 先回りの `eslint-disable`                                  | 全般                                     |

**`npm run build` が通っても `npm run dev` が起動するとは限らない**（recipe-view design.md 9.2）。**CSS に関わる段階はブラウザで1回開くまで完了にしない。**

---

# 10. 受け入れの確認手順

**コードを見ずに真偽が決まる形で書く**（`.kiro/README.md` 4）。

| #   | 手順                                                   | 期待                                                                                   |
| --- | ------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| 1   | 通常モードの S-04 を開く                               | 上段の左に `← 一覧`、右に `編集`                                                       |
| 2   | 確認モード（`?confirm=1`）を開く                       | 上段が無い。最下部に「この内容で決定」→「編集する」                                    |
| 3   | `編集` を押す / 確認モードで「編集する」を押す         | `/recipes/<id>/edit` が開き、ヘッダー中央が「レシピを編集」                            |
| 4   | 編集画面の材料・手順を S-04 と見比べる                 | 同じ順・同じ値                                                                         |
| 5   | 材料名・分量・カテゴリを1つずつ変えて保存              | S-04 に戻り、変更が出ている。再読み込みしても残っている                                |
| 6   | 「＋ 行を追加」を押す                                  | 末尾に空の行。カテゴリが「その他」、材料名の欄にカーソル                               |
| 7   | 追加した行を空のまま保存                               | 保存が通り、S-04 に空の材料が無い                                                      |
| 8   | 材料名を消して分量だけ残し、保存                       | 保存されず、その欄が赤枠で「未入力」                                                   |
| 9   | 分量を消して保存                                       | S-04 でその材料が分量なしで出る                                                        |
| 10  | 値の入った行の「削除」を押す                           | ダイアログに材料名と分量。「やめる」が上                                               |
| 11  | 「やめる」/ `Escape` / 背景を押す                      | 閉じて行が残る                                                                         |
| 12  | 「削除する」→ 保存                                     | S-04 からその材料が消えている                                                          |
| 13  | 「＋ 手順を追加」→ 本文を2行書いて保存                 | S-04 の最後の手順に出て、改行が保たれている                                            |
| 14  | 途中の手順を消す                                       | 以降の番号が詰まる                                                                     |
| 15  | 材料・手順を全部消して保存                             | S-04 に「材料が登録されていません。」「手順が登録されていません。」                    |
| 16  | 何も変えずに `← 中止`                                  | ダイアログ無しで S-04 へ                                                               |
| 17  | 1文字変えて `← 中止`                                   | 破棄確認。「編集を続ける」で入力が残る。「破棄する」で S-04 へ、変更は保存されていない |
| 18  | 1文字変えて再読み込み                                  | ブラウザの離脱確認が出る                                                               |
| 19  | 何も変えずに再読み込み / 空の行を足しただけで `← 中止` | 離脱確認もダイアログも出ない                                                           |
| 20  | 保存した直後に「戻る」                                 | 編集画面に戻らない（S-04 か、確認モードから来た場合は確認モード）                      |
| 21  | 保存を連打                                             | 1回だけ送られる（開発者ツールのネットワークで PUT が1本）                              |
| 22  | 開発者ツールでオフラインにして保存                     | 画面に留まり、入力が残り、通信の文言が出る                                             |
| 23  | 未ログインで `/recipes/<id>/edit`                      | `/login` へ                                                                            |
| 24  | 存在しないIDの `/recipes/<id>/edit`                    | 「レシピが見つかりません」（1.2 の ⚠️）                                                |
| 25  | 未ログインで `PUT`                                     | 401                                                                                    |
| 26  | 他ユーザーのレシピIDに `PUT`                           | 404。そのレシピの材料・手順が変わっていない                                            |
| 27  | スマホ幅で開く                                         | 分量欄が 96px で潰れない。ヘッダーが上に残り「保存」が押せる                           |
| 28  | 下の方の欄を空にして保存（未入力）                     | その欄にスクロールし、**ヘッダーの下に潜らない**                                       |
| 29  | **`npm run dev` を起動してブラウザで開く**             | 起動する（`build` だけでは捕まらない）                                                 |
| 30  | **iOS Safari の実機で**1文字変えて再読み込み           | 離脱確認が出るか記録する（1.3 の ⚠️。出なくても不具合扱いにはしない）                  |
| 31  | **本番へデプロイし、主要な手順（1〜22）を通す**        | ローカルと同じ結果。保存が本番の DB で通る（1.1 の ⚠️）                                |

---

# 11. リスクと対策

| リスク                                                  | 影響                                               | 対策                                                                                                                                                                  |
| ------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Neon のプール接続で対話的トランザクションが通らない** | 保存が全部 500 になる                              | 段階10 で最初の実保存を確かめる。通らなければ `update` のネスト書き込み（`deleteMany` ＋ `create`。1クエリで1トランザクション）に切り替える案を検討してユーザーに相談 |
| トランザクションの既定 timeout（5秒）を超える           | 保存が失敗する                                     | 本番で保存時間を測る（段階14）。クエリは5本                                                                                                                           |
| 保存で他人のレシピを書き換えられる                      | **データの破壊**                                   | `updateMany` の `where` に `userId`。**偽の tx で他人の行が残ることをテストで固定**                                                                                   |
| 保存の失敗で入力が消える                                | 直した内容をやり直し                               | 失敗時は画面に留まり下書きを消さない。テストで固定                                                                                                                    |
| ブラウザの「戻る」で入力が消える                        | 直している途中の内容を失う                         | **既知の制約として受け入れ**（決定③）。解析結果は保存済み                                                                                                             |
| iOS Safari で `beforeunload` が効かない                 | 再読み込みで入力を失う                             | 実機で記録する。`← 中止` のダイアログは効く                                                                                                                           |
| CSS の変更で開発サーバーが起動しない                    | ブラウザで踏むまで気づかない                       | CSS に関わる段階はブラウザで開くまで完了にしない                                                                                                                      |
| 実データに材料の多いレシピが少ない                      | 長い画面での固定ヘッダー・フォーカスを確認できない | 段階14 で材料の多いレシピで確かめる                                                                                                                                   |
