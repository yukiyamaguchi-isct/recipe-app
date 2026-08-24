# recipe-view（Phase 3）の設計書

保存済みのレシピを1件、読める形で画面に出す。S-04（通常モード）と S-04c（確認モード）を同一コンポーネントの状態切り替えで作る。

## この文書の読み方

**主張ごとに検証状態のラベルを付けてある**（`.kiro/README.md` の「design.md の書き方」）。

| ラベル    | 意味                                           | 実装時の扱い             |
| --------- | ---------------------------------------------- | ------------------------ |
| ✅ 実測   | 実際に動かして確認した                         | そのまま信じてよい       |
| 📄 出典   | 公式ドキュメントかライブラリのソースで確認した | そのまま信じてよい       |
| ⚠️ 未検証 | 妥当だと考えているが確かめていない             | **実装時に必ず確かめる** |

**ラベルの無い記述は「方針・判断」であって事実の主張ではない。**

> **この文書は着手前に書いたもので、まだ `⚠️ 未検証` が残る。フェーズ完了時に実物から書き直し、`⚠️` を潰すこと。**
>
> | 残っている ⚠️                                | 潰すタイミング |
> | -------------------------------------------- | -------------- |
> | `not-found.tsx` が実際にどこへ差し込まれるか | 段階13         |
> | 最下部固定バーとスマホのアドレスバーの重なり | 段階11         |

## 確定事項（蒸し返さない）

- **視覚仕様は `Design_引き継ぎ資料/design_handoff_recipe_design_system/README.md` が正。** 正本の HTML は `Recipe Design System v2.dc.html`（緑基調の無印版は履歴。使わない）
- **デザインHTMLはリファレンスであって本番コードではない。** Tailwind CSS v4 + React 19 の規約で組み直す
- **「移動 / 操作 / 絞り込み」を面の有無で描き分ける。この3種以外の見た目をヘッダー・タブに足さない**
- **S-04 / S-04c に写真は出さない**（2026-08-23 ユーザー決定。根拠は 1.1）
- デザイントークンは `app/globals.css` の `@theme` に投入済み。**値を推測で変えない**
- デザインの `qty` は DB では `amount` が正
- 詳細画面と編集画面は別画面（`UI_DESIGN.md` 4章 決定3）

---

# 1. 調査結果

## 1.1 デザイン原本の S-04 / S-04c に画像は無い（📄 出典＋✅ 実測 2026-08-23）

**`HANDOVER.md` 4.1 は「写真をどう表示するかが Phase 3 最大の論点」としていたが、デザインは S-04 に写真を置いていない。** 根拠は3つで、すべて受領した資料の実物から取っている。

| 根拠                                | 中身                                                                                                                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`「Screens / Views」画面4 | 固定ヘッダー →「材料（4人分）」→ 絞り込みタブ → カテゴリ見出し → 材料行 →「作り方」→ 手順リスト。**画像の記述が無い**                                                                   |
| 同 State Management                 | `recipe` は `{ id, title, servings, ingredients[{ id, name, qty, category }], steps[] }`。**画像フィールドが無い**                                                                      |
| `Recipe Design System v2.dc.html`   | 画像プレースホルダ（`repeating-linear-gradient`）は5箇所。298行=レシピカード部品 / 448・452行=一覧モック / 464行=アップロード画面の4:3プレビュー / 582行=PC一覧。**S-04 / S-04c には0** |

`thumbnailUrl` を持つのは一覧用の `recipes[]` だけ。**つまり署名付きURLが要るのは S-02（Phase 4）で、このフェーズでは不要。**

**この決定によりフェーズから丸ごと消えたもの**: `@aws-sdk/s3-request-presigner` の追加、`lib/services/recipe-analysis.ts` の変更、`thumbnailKey` 列とマイグレーション。

## 1.2 動的ルートの `params` は Promise（📄 出典）

出典は `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`。**Next.js 16 では `page.js` の `params` / `searchParams` が Promise のみで、15 にあった同期アクセスの互換は削除されている**（同 L288-292。`.kiro/steering/architecture.md` にも記載）。

同 L296-312 が型ヘルパーの使い方を示している。

```tsx
// 📄 出典: version-16.md L308-312 の例
export default async function Page(props: PageProps<"/blog/[slug]">) {
  const { slug } = await props.params;
}
```

- **`PageProps` / `LayoutProps` / `RouteContext` は `npx next typegen` が生成するグローバル型**（同 L298-301）。手書きの型定義より優先して使う（`.kiro/steering/architecture.md`）
- **無いとどうなるか**: `params` を `await` せずに `params.id` と書くと、**型では通っても実行時に `undefined` になる。「レシピが見つかりません」が出るだけでエラーにならない**ので、原因を DB 側に探して時間を溶かす
- **✅ テストが欠落を捕まえることを確認した**（2026-08-24、段階3）。`await props.params` を外すと「URL の id でレシピを引く」が落ちる

### ⚠️ `PageProps` は「ページを作る前」には解決できない（✅ 実測 2026-08-24、段階3）

**`.next/types/routes.d.ts` は実在するルートから生成される。** ページを作る前の `AppRoutes` は

```ts
type AppRoutes = "/" | "/login" | "/upload";
```

で、`PageProps<"/recipes/[id]">` は**型引数が制約を満たさず落ちる**。`npx next typegen` を回すと

```ts
type AppRoutes = "/" | "/login" | "/recipes/[id]" | "/upload";
interface ParamMap {
  "/recipes/[id]": { id: string }; // ← ここから params の型が来る
}
```

に変わり、初めて解決する。**順序が効く。**

1. `app/recipes/[id]/page.tsx` を作る
2. `npx next typegen`（または `npm run build`）
3. `npx tsc --noEmit`

**2 を飛ばして 3 をやると、コードが正しくても落ちる。** `.kiro/specs/recipe-analysis/design.md` 9.1 の `LayoutProps` と同じ構図で、**新しいルートを足すたびに再発する。**

## 1.3 `notFound()` の実体（📄 出典）

```ts
// node_modules/next/dist/client/components/not-found.d.ts L1
export declare function notFound(): never;
```

`node_modules/next/navigation.d.ts` が `./dist/client/components/navigation` を re-export しており、そこから辿れる。**戻り値が `never`** なので、呼んだ後のコードは型の上でも到達しない。

- 対になるファイル規約は `not-found.tsx`（`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md`）
- **✅ ビルドに含まれることは確認した**（2026-08-24、段階3）。`app/recipes/[id]/not-found.tsx` の文言は SSR チャンク（`.next/server/chunks/ssr/`）に入る。**ルート表には出ない**（`○ /_not-found` はルート直下のもの）ので、ルート表だけ見て「認識されていない」と誤解しない
- **⚠️ 未検証**: 実際に開いたときレイアウトのどこに差し込まれるか。**認可が先に効くのでログイン状態でないと到達できず、自動テストでは踏めない。段階13（実測）で確認する**

## 1.4 Prisma の関連取得と並び順（📄 出典＋✅ 実測 2026-08-24、段階2）

材料と手順は `order` の昇順で出す必要がある（requirements.md Req1）。**`order` に入っているのは Claude が返した配列の添字**で、原文の順序そのもの（`.kiro/specs/recipe-analysis/design.md` 2章）。

**`include` の中で `orderBy` を指定できる。** 生成された型に定義がある。

```ts
// 📄 出典: generated/prisma/models/Recipe.ts L1669-1685
export type Recipe$ingredientsArgs<...> = {
  select?: ...
  where?: Prisma.IngredientWhereInput
  orderBy?: Prisma.IngredientOrderByWithRelationInput | Prisma.IngredientOrderByWithRelationInput[]
  ...
}
```

`RecipeInclude`（同 L805-810）の `ingredients` / `steps` が `boolean | Recipe$ingredientsArgs` を受けるため、`ingredients: true` の代わりに `ingredients: { orderBy: { order: "asc" } }` と書ける。

- **無いとどうなるか**: 並び順を指定しないと DB が返す順序に依存する。**手元では偶然正しく見えて、行が増えたときに崩れる**種類の失敗
- **✅ テストが欠落を捕まえることを確認した**（2026-08-24）。`ingredients: { orderBy: ... }` を `ingredients: true` に変えると2件が落ちる（「材料を order の昇順で取る」「並び順を DB 任せにしない」）。確認後に戻した

## 1.5 【Phase 4 向け】署名付きURLの決定事項（2026-08-23 ユーザー決定）

**このフェーズでは使わないが、決定は済んでいるのでここに残す。** Phase 4（recipe-list）で一覧のサムネイルを出すときに読むこと。

| 項目             | 決定                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| **有効期限**     | **1時間**                                                                                      |
| **発行の方法**   | **ページ表示時にまとめて発行。** Server Component が一覧を取得する際、全件分を一度に作って渡す |
| **サムネイル**   | **当面作らない。** 一覧を実装し、実機で遅いと感じてから判断する                                |
| 必要なライブラリ | `@aws-sdk/s3-request-presigner`（未インストール）。`@aws-sdk/client-s3` は導入済み             |

- **⚠️ 署名付きURLをDBに保存しない。** 有効期限があるので、保存した頃には切れている。**表示のたびに発行する**
- **バケットを公開にする案は採らない**（`.kiro/specs/recipe-analysis/design.md` 5.6 で決定済み）。URLを知られたら誰でも他人のレシピ写真を見られる
- 署名の計算はローカルで完結し AWS への通信は発生しないため、**10件まとめて発行しても実質コストは増えない**

---

# 2. データモデル

**このフェーズでのスキーマ変更は無い。** `prisma/schema.prisma` に必要なものが揃っている。

```prisma
model Recipe     { id, userId, title, imageKey, servings, createdAt, updatedAt, ingredients[], steps[] }
model Ingredient { id, recipeId, name, amount?, category, order }
model Step       { id, recipeId, order, text }
enum Category    { SEASONING, VEGETABLE, OTHER }
```

- `servings` は `Int?`。**`null` なら見出しから人数を省く**（丸めない）
- `amount` は `String?`。「少々」「適量」がそのまま入る
- `imageKey` は S3 のキー。**このフェーズでは読まない**（1.1）
- `Category` の enum 値は Claude のスキーマ・DB・UI で共通

---

# 3. ファイル構成

```
app/
├── recipes/[id]/
│   ├── page.tsx          # S-04 / S-04c の入口。Server Component。認可と取得
│   ├── not-found.tsx     # Req6 の画面
│   ├── recipe-header.tsx # 固定ヘッダー。**Phase 3 は上段が無く2段**（requirements.md 決着2・3）
│   ├── recipe-title.tsx  # タイトル＋ ✎ のインライン改名（Req7）
│   ├── ingredient-list.tsx # 絞り込みタブ＋カテゴリ見出し＋材料行
│   └── step-list.tsx     # 手順リスト
└── api/recipes/[id]/
    └── route.ts          # PATCH。タイトルの変更（Req7）
lib/repositories/
└── recipe.ts             # findRecipeForUser() / updateRecipeTitle() を追加
```

`.kiro/steering/architecture.md` の3層に従う。**Repository は Prisma だけを知る。**

- **表示は Route Handler を経由しない。** 画面（Server Component）から Repository を直接呼ぶ
- **更新（Req7）だけは Route Handler が要る。** ブラウザからの操作で、`app/api/recipes/analyze/route.ts` に続く2つ目の保護付きエンドポイントになる
- **Service 層は置かない。** タイトルの更新に、検証と保存以外のビジネスロジックが無いため

## 3.1 ✅ 決着: `components/` を新設せず、ルートに同居させる（2026-08-24、段階4）

**着手前の案は `components/recipes/` の新設だったが、採らなかった。**

| 案                                     | 判断                                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **`app/recipes/[id]/` に同居**（採用） | Phase 2 の `app/upload/`（`photo-picker.tsx` / `analysis-progress.tsx` / `use-analysis.ts`）と同じ形。**前例がある** |
| `components/recipes/` を新設           | 置き場所が2種類になる。**共有する相手がまだ居ない**                                                                  |

**理由。** 新設案の根拠は「S-04 と S-04c が共有する」「Phase 5 の S-05 からも使う見込み」の2つだったが、

- **S-04 と S-04c は同じルート**（`/recipes/[id]`）の `mode` 違いで、別画面ではない。同居していても共有できる
- **Phase 5 で本当に要るかは、まだ分からない。** `tech-stack.md` の「状態管理ライブラリは必要になるまで入れない」と同じ判断で、**2つ目の利用者が現れてから動かす**

**Phase 5 で S-05 が別ルートになり、材料行を共有したくなったら、そのとき `components/` へ移す。** それまでは置き場所を1種類に保つ。

> **App Router で `app/` 配下に置いても問題ない。** ルートとして解釈されるのは `page` / `layout` / `route` / `not-found` などの予約ファイル名だけで、それ以外はただのモジュール（Phase 2 で実証済み）。

---

# 4. 処理の流れ

```
GET /recipes/<id>
  1. requireUserId()                       ← 未ログインなら /login へ（Req4）
  2. findRecipeForUser(userId, recipeId)   ← userId でスコープした取得
  3. 見つからなければ notFound()           ← 「存在しない」と「他人のもの」を区別しない
  4. RecipeView に渡して描画
```

**Route Handler を経由しない。** Server Component から Repository を直接呼ぶ。HTTP を挟む理由が無く、挟むと往復の分だけ遅くなる（`REQUIREMENTS.md` 6.1 の「1秒以内」）。

> **⚠️ 確認モードの伝え方は未決。** `?confirm=1` のようなクエリか、`/recipes/<id>/confirm` の別ルートか。段階11 で決める。**クエリだと、そのURLをブックマークして再訪したときにまた確認画面が出る**点を考慮すること。

---

# 5. 実装

## 5.1 レシピ1件の取得

```ts
// lib/repositories/recipe.ts に追加する
import type { Category, Ingredient, Recipe, Step } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type RecipeWithDetails = Recipe & {
  ingredients: Ingredient[];
  steps: Step[];
};

/**
 * userId でスコープしたレシピ1件の取得。**他人のレシピは null になる。**
 *
 * `where` に userId を入れるのが要点。`findUnique({ where: { id } })` で取ってから
 * `recipe.userId === userId` を確認する形にすると、**確認を忘れても動いてしまう**。
 */
export async function findRecipeForUser(
  userId: string,
  recipeId: string,
): Promise<RecipeWithDetails | null> {
  return prisma.recipe.findFirst({
    // ⚠️ findUnique ではなく findFirst。userId との複合条件は主キーではないため
    where: { id: recipeId, userId },
    include: {
      ingredients: { orderBy: { order: "asc" } },
      steps: { orderBy: { order: "asc" } },
    },
  });
}
```

**`findUnique` を使わない理由。** `findUnique` は主キーか一意制約でしか引けない。`{ id, userId }` の複合条件は一意制約ではないので `findFirst` になる。

- **無いとどうなるか**: `where` から `userId` を落とすと、**IDさえ知っていれば他人のレシピが読める**。テストでは自分のレシピしか作らないので通ってしまう。**必ず「他人のレシピが null になる」テストを書く**（8章）
- **見分け方**: 別ユーザーの `userId` で `findRecipeForUser` を呼び、`null` が返ること。レコードが返ったらスコープが外れている

## 5.2 「存在しない」と「他人のもの」を区別しない

requirements.md Req4。どちらも `notFound()` に落とす。

```tsx
// app/recipes/[id]/page.tsx
import { notFound } from "next/navigation";

import { requireUserId } from "@/lib/auth/session";
import { findRecipeForUser } from "@/lib/repositories/recipe";

export default async function RecipePage(props: PageProps<"/recipes/[id]">) {
  const { id } = await props.params; // ⚠️ await が要る（1.2）
  const userId = await requireUserId();
  const recipe = await findRecipeForUser(userId, id);

  if (!recipe) {
    notFound();
  }

  // ...
}
```

**なぜ区別しないか。** 「他人のものです」と「存在しません」を出し分けると、**IDを総当たりして他人のレシピの存在を確かめられる。** レシピIDは `cuid()` なので総当たりは現実的でないが、区別しない実装のほうが単純でもある。

> **⚠️ `requireUserId()` は `UnauthorizedError` を投げる。** Route Handler ならこれが 401 になるが、**Server Component で投げるとエラー画面になる。** Req4 は `/login` へのリダイレクトを求めているので、この形のままだと要件を満たさない。段階3 で `getUserId()` ＋ `redirect("/login")` に変えるか検討する。
>
> **参考**: `app/page.tsx` は `auth()` を直接呼び、`session?.user?.id` が無ければ `redirect("/login")` している。**画面はこちらの流儀。** `requireUserId()` は Route Handler 用（`app/api/recipes/analyze/route.ts`）。

## 5.3 Server Component と Client Component の境目

- **取得と認可は Server Component**（`app/recipes/[id]/page.tsx`）
- **絞り込みタブと現在位置の反映は Client Component**。`useState` が要る

境目は `components/recipes/recipe-view.tsx` に置く。**Server Component から渡すのはプレーンなデータだけ**にして、Prisma の `Decimal` や `Date` をそのまま渡さない。

- **無いとどうなるか**: Server Component から Client Component へ渡せない値があると、**ビルド時ではなく実行時に「Only plain objects can be passed」で落ちる**。`createdAt` / `updatedAt` はこのフェーズの画面では使わないので、そもそも渡さない

## 5.4 カテゴリの並びと絞り込み

**タブの並びは「全体 / 野菜 / 調味料 / その他」**（`UI_DESIGN.md` S-04）。DB の enum は `SEASONING` / `VEGETABLE` / `OTHER` の順で、**画面の並びと違う。**

- **enum の順序に依存しない。** 画面の並びは配列で明示的に定義する
- 「全体」のときは**カテゴリ見出し付きで縦に積む**（スマホ）。PC は3カテゴリを横に並べる（`UI_DESIGN.md` S-04）
- カテゴリ見出しの右端に件数を出す（デザイン「カテゴリ見出し」）
- **絞り込みは常にどれか1つが点灯する。** 「選択なし」の状態を作らない

- **無いとどうなるか**: `Object.values(Category)` をそのまま並べると、**スキーマの enum の順序を変えた瞬間に画面のタブ順が変わる。** しかも型では捕まらない

## 5.5 見出しの人数

```
servings が数値  → 「材料（4人分）」
servings が null → 「材料」
```

**`null` を 0 や 1 に丸めない**（`REQUIREMENTS.md` 9章 / `.kiro/specs/recipe-analysis/design.md` 6.2.4）。「2〜3人分」のような幅のある表記や、そもそも人数が書かれていないレシピがあるため `Int?` にしてある。**勝手な数字を出すのは、読み取れなかったことを隠すことになる。**

## 5.6 タイトルの変更（Req7。✅ 2026-08-24 ユーザー決定で Phase 3 に追加）

**このフェーズで唯一の書き込み。** `app/api/recipes/analyze/route.ts` に続く**2つ目の保護付きエンドポイント**になる。

### Repository

```ts
// lib/repositories/recipe.ts に追加する
import { prisma } from "@/lib/prisma";

/**
 * タイトルを変更する。**他人のレシピは更新されない。**
 *
 * 更新できた件数を返す。0 なら「存在しない」か「他人のもの」（呼び出し側は区別しない）。
 */
export async function updateRecipeTitle(
  userId: string,
  recipeId: string,
  title: string,
): Promise<number> {
  const result = await prisma.recipe.updateMany({
    // ⚠️ where に userId を入れる。これが唯一の所有チェック
    where: { id: recipeId, userId },
    data: { title },
  });
  return result.count;
}
```

**`update` ではなく `updateMany` を使う。** `update` の `where` は一意制約でしか引けないため、`{ id }` だけで引いてから所有者を確認する形になり、**確認を忘れても動いてしまう**（5.1 の `findUnique` と同じ構図）。`updateMany` なら `userId` が `where` の一部になるので、**落とすとテストが落ちる。**

- **📄 出典（2026-08-24、段階9 で確認）**: **Prisma 7 の `update` も非一意フィールドを受ける。** `RecipeWhereUniqueInput` は `Prisma.AtLeast<{ id?: string; userId?: ...; ... }, "id">`（`generated/prisma/models/Recipe.ts` L253-265）なので、`update({ where: { id, userId } })` でも所有チェックは効く。**それでも `updateMany` を採った**:
  - `update` は一致しないと例外（`P2025`）を投げる。**「見つからない」の判定が Prisma のエラーコードという実行時の詳細に依存する**
  - `updateMany` は件数を返すだけ。**テストしやすく、Prisma の都合が変わっても壊れにくい**
- **見分け方**: 他人の `userId` で呼んで戻り値が `0` になること。`1` が返ったらスコープが外れている

### Route Handler

```ts
// app/api/recipes/[id]/route.ts
import { requireUserId } from "@/lib/auth/session";
import { errorResponse, successResponse } from "@/lib/api-response";
import { updateRecipeTitle } from "@/lib/repositories/recipe";

export async function PATCH(request: Request, context: RouteContext<"/api/recipes/[id]">) {
  try {
    const { id } = await context.params; // ⚠️ Route Handler の params も Promise（1.2）
    const userId = await requireUserId(); // 未ログインは 401
    // ...検証して updateRecipeTitle を呼ぶ
    return successResponse({ title });
  } catch (error) {
    return errorResponse(error);
  }
}
```

**`requireUserId()` はここでは正しい。** Route Handler なら `UnauthorizedError` が `errorResponse()` で 401 になる（5.2 の ⚠️ は画面側の話）。

### タイトルの検証（`lib/recipes/title.ts`）

**サーバーとクライアントで同じモジュールを使う。** 段階10 のインライン改名も同じものを呼ぶ。**文言を二重に書かない**（`.kiro/specs/recipe-analysis/design.md` 落とし穴 #27 で実際に踏んだ）。

| 規則               | 内容                                                         |
| ------------------ | ------------------------------------------------------------ |
| 前後の空白を落とす | `normalizeTitle()` が `trim()` する。**中の空白は触らない**  |
| 空は拒否           | `trim()` の結果が空文字なら `EMPTY_TITLE_MESSAGE`            |
| 上限               | **100文字**（`MAX_TITLE_LENGTH`）                            |
| 数え方             | **コードポイント**（`[...title].length`）。`length` ではない |

- **`titleProblem()` は例外を投げず、文言か `null` を返す。** クライアントは入力中の案内に使うので、**1文字打つたびに例外を作らせない**
- **上限の100文字は根拠のある数値ではない。** DB は Postgres の `text` で無制限。ヘッダーで2行に収まる目安として置いた。**段階13 で実データを見て決め直してよい**
- **`length` で数えない。** `"🍳".length` は 2（サロゲートペア）なので、`length` で弾くと絵文字入りのタイトルが半分の長さで引っかかる
- **⚠️ 書記素単位ではない（既知の割り切り）。** `"👩‍🍳"` は 👩 + ZWJ + 🍳 の3コードポイントなので、見た目1文字が3と数えられる。`Intl.Segmenter` を使えば正確になるが、**レシピ名に結合絵文字が並ぶ場面は想定しにくい**ので入れていない。テストで挙動を固定してある

### `ValidationError` だけ `message` を引数で受け取る

**Phase 2 のエラーは、外部APIの生メッセージを差し込めないようにわざと引数を持たせていない**（`.kiro/specs/recipe-analysis/design.md` 5.5）。`ValidationError` はその例外にした。

**理由**: 検証の失敗理由は複数あり（空 / 長すぎる）、**それぞれ違う直し方を案内する必要がある**。エラークラスを理由ごとに増やすより、文言を渡すほうが素直。

**代わりに制約を明記した**: **渡してよいのは `lib/recipes/title.ts` の定数だけ。外部入力やライブラリの例外メッセージを渡さない。** JSON パースの失敗も、`cause` に隔離して固定文言を返している（テストで固定）。

### 新しいエラーコード

**`lib/errors.ts` と `lib/api-response.ts` の `STATUS` 表の両方に足す。** 片方だけだと 500 にフォールバックし、**型でもテストでも捕まらない**（Phase 2 段階2 で実際に踏んだ）。

| code               | 場面                            | HTTP |
| ------------------ | ------------------------------- | ---- |
| `VALIDATION_ERROR` | タイトルが空 / 長すぎる         | 400  |
| `RECIPE_NOT_FOUND` | 存在しない **または他人のもの** | 404  |

**404 で「存在しない」と「他人のもの」を区別しない**（5.2 と同じ理由）。`__tests__/api-response.test.ts` が「`lib/errors.ts` の全エラーが対応表に載っている」ことを固定しているので、**足し忘れるとそのテストが落ちる。**

## 5.7 クライアントコンポーネントの境目（✅ 実測 2026-08-24、段階6）

絞り込みの状態を持つため `ingredient-list.tsx` を `"use client"` にした。**このフェーズで最初のクライアントコンポーネント。**

### ⚠️ `@/generated/prisma/client` から**値**を import するとビルドが落ちる

**実際に踏んだ。** `Category`（enum の値）をクライアントコンポーネントで使ったところ、`npm run build` が次で失敗した。

```
the chunking context (unknown) does not support external modules (request: node:module)
  at ... Failed to write app endpoint /recipes/[id]/page
```

**原因**: `generated/prisma/client.ts` は先頭で `node:process` / `node:path` / `node:url` と `@prisma/client/runtime/client` を import している（L13-21）。**そこから値を1つ取るだけで、Prisma のランタイムごとブラウザ向けバンドルに入る。**

**対処**: 値は `@/generated/prisma/enums` から取る。

```ts
// ✅ enums.ts は import を1つも持たない定数だけのファイル。
// Prisma 自身が「🟢 You can import this file directly」と書いている
import { Category } from "@/generated/prisma/enums";
// 型は import type なのでコンパイル時に消える。client から取ってよい
import type { Ingredient } from "@/generated/prisma/client";
```

- **`.kiro/specs/recipe-analysis/design.md` 5.3 と同じ構図。** あちらは「`normalize.ts` に定数を置いたままクライアントから import すると sharp がブラウザ向けバンドルに混入する」で、`lib/images/constants.ts` に切り出して解決した。**サーバー専用の重い依存を持つファイルから、値を1つだけ借りない**
- **見分け方**: `npm run build` が `does not support external modules` で落ちたら、クライアント側から import している値の出どころを疑う。**型チェックもテストも通る**ので、ビルドまで分からない
- **✅ 確認**: 修正後、クライアントの JS チャンクに `node:process` の参照が無いことを確認した

### Server → Client に渡すもの

渡しているのは `Ingredient[]`（`string` / `number` / `null` だけ）と `servings`。**`Date` は渡していない**（落とし穴 #15）。`createdAt` / `updatedAt` はこの画面で使わないので、そもそも props に含めない。

### 絞り込みを ARIA の tablist にしない

`role="tablist"` / `role="tab"` は**矢印キーでの移動が要求される**が、ここでは実装していない。**実装していない操作を約束しない**ため、`<button>` ＋ `aria-pressed` にした。`role="group"` に `aria-label="材料の絞り込み"` を付けて、まとまりだけ伝える。

### `#23505C` を `--color-ink-control` として `@theme` に追加した

**引き継ぎ資料の `@theme` ブロックには無いが、コンポーネント仕様に3箇所出てくる色**（非選択の絞り込みピルの文字 / フォームのラベル / 確認ダイアログの本文）。デザインHTMLでも35箇所で使われている。**推測した値ではない。**

Phase 2 の `--color-muted` / `--color-track` と同じ扱い（`.kiro/specs/recipe-analysis/design.md` 6.2.8）。**名前はこちらで付けた**（資料側に変数名が無いため）。既存の `--color-ink`（#0B2D39）より軽く、`--color-ink-sub`（#4A6570）より重い位置にある。

**近い既存トークンで代用しない。** 資料に書かれている色を勝手に別の色へ寄せることになる。

---

# 6. 画面

**`UI_DESIGN.md` が構造（何をどこに置くか）、この章が実装上の決定**（`.kiro/README.md` 5）。

## 6.1 視覚仕様の対応表（📄 出典: 引き継ぎ資料 README）

**hifi なので確定値。推測で変えない。** トークン名は `app/globals.css` の `@theme` にある。

| 部位               | 仕様                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **固定ヘッダー**   | 面 `--color-header` / 下境界 1px `--color-border` / 影 `--shadow-e1`。3段構成（**Phase 3 は上段が無く2段**。下記）                                                        |
| 　上段             | 左 `← 一覧`（面なし・48px）／右 `編集`（枠線・48px）、padding 6px 12px。**Phase 3 では描かない**                                                                          |
| 　中段             | タイトル 22px/700/lh1.4 ＋ `✎`（`--color-link` 17px）、padding 0 16px 8px                                                                                                 |
| 　下段             | `材料 ↓` `作り方 ↓`（面なし・48px、ページ内ジャンプ）、padding 0 12px 6px                                                                                                 |
| **絞り込みタブ**   | flex gap 8px、wrap 可。各ピル 高さ48px / padding 11px 18px / 角丸999px / 17px。選択中 `--color-primary`＋白＋500 / 非選択 白＋`#23505C`＋枠1px `--color-border`           |
| **カテゴリ見出し** | flex / gap 10px / 角丸8px / padding 10px 16px。左に 10px の丸、ラベル 17px/700、右端に件数 15px（`margin-left: auto`）。面と文字は `--color-cat-*`                        |
| **材料の1行**      | flex / `align-items: baseline` / gap 16px / padding 16px 18px / 下境界 1px `--color-track`                                                                                |
| 　分量             | **width 5.5em / flex none / 右揃え / 19px / 700 / `font-feature-settings: 'tnum'`**。**行内の位置は右**（6.5 のユーザー決定。資料は左としていた）                         |
| 　材料名           | flex 1 / 19px / lh1.6 / `text-wrap: pretty`                                                                                                                               |
| **手順リスト**     | 各項目 flex / gap 16px / `align-items: flex-start`、項目間 20〜24px                                                                                                       |
| 　番号             | 40px角の丸、面 `--color-primary-soft`、文字 `--color-link` 19px 700、中央揃え                                                                                             |
| 　本文             | 17px / **lh 1.9** / padding-top 6px / `text-wrap: pretty`                                                                                                                 |
| **確認バナー**     | 面 `--color-warn-soft` / 下境界 1px `--color-attention` / padding 14px 16px / 17px 700 `--color-warn-ink`                                                                 |
| **最下部固定バー** | 面 `--color-surface` / 上境界 1px `--color-border` / 影 `0 -4px 12px rgba(11,45,57,.06)` / padding 16px / 縦 gap 10px                                                     |
| **ボタン**         | 主要: 面 `--color-primary`（hover `--color-primary-dark`）／白 19px 700／56px／角丸12px。副次: 白（hover `--color-primary-soft`）／`--color-link` 19px 500／枠1.5px／56px |
| レスポンシブ       | **この画面は単一カラムのまま max-width 640px で中央寄せ**（一覧だけが1列/3列で切り替わる）                                                                                |

> **⚠️ 行内の左右は資料と逆にした。** 資料は「分量が左・材料名が右」だが、**2026-08-24 のユーザー決定で「材料名が左・分量が右」にした**。経緯と理由は 6.5。**資料の記述だけを見て元に戻さないこと。**

### ✅ 食い違い5: PC で材料を3列に並べるか（決着 2026-08-24。段階5 で発覚）

**2つの資料が違うことを言っている。**

| 出典                                | 記述                                                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `UI_DESIGN.md` S-04「材料タブ」     | **「PC:「全体」時は3カテゴリを横に並べて表示」**                                                                     |
| 引き継ぎ資料 README「Interactions」 | **「レスポンシブ: 一覧のみ 1列（〜767px）/ 3列（768px〜）。他の画面は単一カラムのまま max-width 640px で中央寄せ」** |

**`UI_DESIGN.md` は「S-04 の PC は3列」、引き継ぎ資料は「3列になるのは一覧だけ」。両立しない。**

**段階5 では引き継ぎ資料に従い、単一カラム（max-width 640px）で実装した。** 根拠は「確定事項」の**「視覚仕様は引き継ぎ資料 README が正」**で、レスポンシブの規則は視覚仕様に含まれるため。また `v2.dc.html` の PC モックも一覧（582行）だけが3列で、S-04 のモックは単一カラムになっている。

**✅ ユーザー決定（2026-08-24）: 単一カラムのままでよい。** `UI_DESIGN.md` S-04 の「PC は3カテゴリを横に並べる」は**採らない**。同ファイルにも注記を入れた。**蒸し返さない。**

- **この決定により、材料セクションに `md:` の分岐を入れない。** 段階6 の絞り込みタブも単一カラム前提で組める
- **PC でも「全体」時は3カテゴリを縦に積む**（スマホと同じ）

### ⚠️ Phase 3 のヘッダーは上段が空になる（✅ 2026-08-24 ユーザー決定の帰結）

上段に置くのは `← 一覧`（→ S-02 は Phase 4）と `編集`（→ S-05 は Phase 5）の2つだけで、**どちらも Phase 3 では出さないと決まった**（requirements.md の決着2・3）。

- **空の段を高さだけ残さない。** 上段そのものを描かず、タイトル段から始める
- **この結果、S-04 から他の画面へ出る導線がこのフェーズには無い**（ブラウザバックのみ）。**Phase 4 で `← 一覧` が入って解消する**
- **Phase 4 / 5 で上段を戻すときは、この表の padding 6px 12px を復元する。** 段を消したまま忘れると、デザインとずれたまま固定される

**確認モード（S-04c）はもともと `← 一覧` を出さない**（6.3）ので、このフェーズでは**通常モードと確認モードでヘッダーの見た目が同じ**になる。差はバナーと最下部バーだけ。

## 6.2 「移動 / 操作 / 絞り込み」の描き分け（📄 出典。**このデザインの中核ルール**）

| 役割                               | 見た目                                                                 | 例                              |
| ---------------------------------- | ---------------------------------------------------------------------- | ------------------------------- |
| **移動**（押しても状態が残らない） | 面なし・枠なし。文字色 `--color-link` ＋ 方向記号                      | `← 一覧` `材料 ↓` `作り方 ↓`    |
| **操作**（モードが変わる）         | 枠線 1.5px `--color-link`、角丸8px、面は白                             | `編集` `✎ 改題`                 |
| **絞り込み**（現在の状態を表す）   | 塗りピル（角丸999px）。選択中=`--color-primary`＋白文字／非選択=白＋枠 | `全体` `野菜` `調味料` `その他` |

**配置でも区別する**: 移動はヘッダー内の横一列、絞り込みは材料セクション見出しの直下（所属を位置で示す）。

- **この3種以外の見た目をヘッダー・タブに足さない**
- **移動系リンクに hover 装飾を足さない**（引き継ぎ資料 Interactions）
- hover は面の明度のみ変化。transition は 120ms ease
- focus は `outline 3px --color-accent-light`（キーボード操作時のみ visible）

## 6.3 S-04c（確認モード）との差は3点だけ

1. 上部に確認バナー「確認画面 — 内容をチェック」
2. 最下部固定バーに `[この内容で決定]`（主要）→ `[編集する]`（副次）の**縦並び**
3. **`← 一覧` を出さない**

**同一コンポーネントの `mode` 切り替えで実装する。** 別コンポーネントに分けると、片方だけ直して表示がずれる。

- **スマホでは最下部バーを固定表示にする**（`UI_DESIGN.md` S-04c）。材料が多いレシピだと最下部が遠く、決定に辿り着けない
- **⚠️ 未検証**: 固定バーの分だけ本文の下に余白が要る。**無いと最後の手順がバーに隠れる。** 段階11 で実機確認する

## 6.4 アンカー移動（✅ 決着 2026-08-24、段階7）

引き継ぎ資料の Interactions には **「`scrollIntoView` は使わず、コンテナの scrollTop 操作で実装」** とある。

**これはモックの事情だった。** デザインHTMLはスマホの枠の中に画面を描いているので、スクロールするのは枠の中の要素で、`scrollTop` を操作する必要があった。**実アプリでスクロールするのは `window`。**

### 決定: `window` スクロール ＋ `position: sticky` ＋ 素の `<a href="#...">`

| 論点               | 決定                                                                           |
| ------------------ | ------------------------------------------------------------------------------ |
| スクロールコンテナ | **`window`**（案A）。本文を専用のスクロール要素にしない                        |
| ヘッダーの固定     | **`position: sticky`**（`fixed` ではない）                                     |
| 移動の実装         | **素の `<a href="#ingredients">`**。`scrollIntoView` も `scrollTop` も使わない |
| 重なりの回避       | **飛び先に `scroll-mt-28`（112px）**                                           |

**`sticky` を選んだ理由。** `sticky` は通常のフローに残るので、**本文がヘッダーの下に潜り込まない。** `fixed` にすると本文の先頭が隠れ、その分の `padding-top` を手で足すことになり、**ヘッダーの高さが変わるたびにズレる**（タイトルが2行になるだけで崩れる）。

**素の `<a>` を選んだ理由。** JS を挟まずに動き、リンクとして読み上げにも伝わる。「移動（押しても状態が残らない）」という役割とも一致する。**資料の記述を写すために JS を足す必要はない。**

### 着地点のオフセットは実測値を CSS 変数に流す（✅ 段階8 で改善）

**固定ヘッダーは本文の上に重なるので、`scroll-margin-top` が無いと飛び先の見出しがヘッダーの下に潜る**（落とし穴 #9。**エラーは出ない**）。

**段階7 は `scroll-mt-28`（112px）の固定値だった。** 仕様値から積んだ約106px（中段50.8 ＋ 下段54 ＋ 境界1）に余裕を持たせた数字で、**タイトルが1行のときしか正しくない。2行になると約31px 高くなって足りなくなる。**

**段階8 で `--recipe-header-h` に置き換えた。**

| 層                                                  | 役割                                                          |
| --------------------------------------------------- | ------------------------------------------------------------- |
| `app/globals.css` の `:root`                        | フォールバック **112px**。JSが動く前・動かない場合に使われる  |
| `recipe-header.tsx`（クライアント）                 | `offsetHeight` を測って上書き。**スクロールとリサイズのたび** |
| 各セクションの `scroll-mt-[var(--recipe-header-h)]` | それを参照する                                                |

- **タイトルが2行になっても追従する。** 段階7 で残した `⚠️` はこれで解消
- **`ResizeObserver` は使っていない。** ヘッダーの高さが変わるのは「画面幅が変わったとき」と「タイトルが変わったとき」で、前者は `resize` で拾え、後者は `useEffect` の依存に `title` を入れてある。**jsdom に無いAPIを持ち込まずに済む**
- **画面を離れたら CSS 変数を消す。** 残すと他の画面に S-04 のヘッダー高さが漏れる（テストで固定）

### 上余白12px は仕様値ではない

中段の padding は仕様では `0 16px 8px` で、上余白は**上段が持っていた**。上段を描かない（requirements.md 決着2・3）ため、**上余白をこちらで12px足した。** これは判断であって資料の値ではない。**Phase 4 で上段を戻すときに取り除く。**

---

## 6.5 ✅ 食い違い6: 材料行の左右（決着 2026-08-24、実機確認で発覚）

**引き継ぎ資料は「分量が左・材料名が右」で、理由まで書いてある。**

> 買い物中に数量だけを縦に追えるようにするため、数量が左（引き継ぎ資料「材料の1行表示」）

**しかし実機で見たユーザーが「逆にしてほしい」と決定した**（2026-08-24、段階7 の実機確認時）。

| 項目   | 資料              | **採用（ユーザー決定）** |
| ------ | ----------------- | ------------------------ |
| 材料名 | 右・可変幅        | **左・可変幅・左寄せ**   |
| 分量   | 左・5.5em・右寄せ | **右・5.5em・右寄せ**    |

### 資料の意図は右側で残している

**分量は右寄せ・幅5.5em固定のまま**にした。`tabular-nums` も外していない。**右端で桁が揃うので、数量を縦に追う利点は右側で成立する。** 資料が守りたかった性質（数量が一列に並ぶ）は失われていない。

### なぜ「デザインが正」を上書きしてよいか

「確定事項」の**「視覚仕様は引き継ぎ資料が正」**は、**推測で値を変えないための規則**であって、ユーザーの決定より上位ではない。**資料は根拠であって決定者ではない。** 食い違い5（PC の3列）は資料を採ったが、あれは資料と `UI_DESIGN.md` の**資料どうしの食い違い**で、判断材料がユーザーに無かった。今回は**実物を見たうえでの指示**なので性質が違う。

### 元に戻されないようにした

- 落とし穴 #8 を「**資料どおり『分量が左』に戻す**」という逆向きの警告に書き換えた
- 6.1 の視覚仕様の表に、資料と逆である旨を注記した
- **`__tests__/ingredient-list.test.tsx` に4件のテストを置いた**（順序 / 分量の右寄せ / 材料名に右寄せを当てない / 分量が無い行）。**資料どおりに戻すと4件とも落ちる**ことを確認済み

> **⚠️ Phase 5（S-05 編集画面）でも同じ並びに揃えること。** 資料の編集画面は「材料名入力 ＋ 分量入力」の順で、**こちらは元から材料名が左**。表示と編集で左右が揃う。

---

## 6.6 現在位置の反映（✅ 決着 2026-08-24、段階8）

`UI_DESIGN.md` S-04 の「作り方までスクロールすると『作り方』が選択状態になる」。

### `IntersectionObserver` は使わなかった

| 案                                   | 判断                                                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `IntersectionObserver` ＋ rootMargin | **採らない。** rootMargin の調整が要り、**作り方セクションが短いレシピで発火しない**失敗モードがある |
| **飛び先の位置を直接見る**（採用）   | セクションは2つだけ。「作り方の先頭がヘッダー線を越えたか」で一意に決まる                            |

```ts
setCurrent(steps.getBoundingClientRect().top < height ? "steps" : "ingredients");
```

- **スクロールとリサイズを `passive` で拾い、`requestAnimationFrame` でまとめる。** スクロール中に毎回測るが1フレーム1回に抑える
- **`<` は等号を含めない。** jsdom はレイアウトを持たず全部 0 を返すため、`<=` だと**初期状態で「作り方」が現在位置になってしまう**。実ブラウザでの差は1pxで体感に出ない

### 現在位置も「面」では示さない

**`aria-current="location"` ＋ 太さ（`font-bold`）と文字色（`--color-ink`）だけで差をつける。**

**面を付けると絞り込みのピルと同じ見た目になり、「移動 / 操作 / 絞り込み」の描き分けが壊れる**（落とし穴 #14）。資料は現在位置の見せ方を指定していないので、**中核ルールを壊さない範囲で決めた**。テストで「面を持たない」ことを固定してある。

### ⚠️ 高さの計測と現在位置の追跡を切り離した（テストが捕まえた）

最初の実装は `#steps` が見つからなければ早期 return していた。**そのせいでヘッダー高さの計測まで巻き添えで止まり**、`--recipe-header-h` が設定されなかった。

**飛び先の `scroll-margin` は現在位置とは無関係に必要**なので、2つの関心事を分けた。**ヘッダー単体のテスト（`#steps` が存在しない）がこれを捕まえた。**

---

# 7. エラー設計

## 7.1 画面側（表示）

| 場面                | 挙動                                                    |
| ------------------- | ------------------------------------------------------- |
| 未ログイン          | `/login` へリダイレクト（`app/page.tsx` と同じ形）      |
| 存在しないID        | `notFound()` → `app/recipes/[id]/not-found.tsx`         |
| 他人のレシピID      | **同上。区別しない**（5.2）                             |
| DB の障害など想定外 | Next.js の error boundary。**内部情報を画面に出さない** |

**`not-found.tsx` に書く内容**（requirements.md Req6）。

- 日本語の説明。「レシピが見つかりません」＋「削除されたか、URLが違う可能性があります」
- **戻る導線。** `← 一覧` は Phase 4 まで出さないと決まった（requirements.md 決着3）ので、**ここでは暫定ホーム `/` へ送る**。この画面は行き止まりにできない
- **IDの生値・例外メッセージ・スタックトレースを出さない**

## 7.2 API 側（タイトルの変更。Req7）

**Req7 を Phase 3 に入れる決定により、`lib/errors.ts` と `lib/api-response.ts` の `STATUS` 表に2つ足す**（5.6）。

| code               | 場面                            | HTTP | 文言の要点                         |
| ------------------ | ------------------------------- | ---- | ---------------------------------- |
| `VALIDATION_ERROR` | タイトルが空 / 長すぎる         | 400  | 何が悪いかと、どう直すか           |
| `RECIPE_NOT_FOUND` | 存在しない **または他人のもの** | 404  | **どちらなのかを明かさない**       |
| `UNAUTHORIZED`     | 未ログイン                      | 401  | 既存（`lib/errors.ts`）            |
| `INTERNAL_ERROR`   | 上記以外すべて                  | 500  | 既存。**原因を明かさない固定文言** |

- **`lib/errors.ts` と `STATUS` 表の両方に足す。** 片方だけだと 500 にフォールバックし、型でもテストでも捕まらない（Phase 2 段階2 で実際に踏んだ）
- **文言は「原因」と「次にすること」の両方が読み取れるようにする**（Phase 2 の流儀）
- **`AppError` のサブクラスは `message` を引数で受け取らない形にする。** Phase 2 の書き方に揃え、外部の生メッセージを差し込めなくする

---

# 8. テスト方針

`vitest.config.mts` の `environment` は **jsdom**。画面のテストはそのままで足りる。

> **⚠️ `PATCH /api/recipes/[id]` のテストだけは node 環境で走らせる。** ファイル先頭に `// @vitest-environment node` を書く。**jsdom で Route Handler を走らせると Request / Response が壊れる**（`.kiro/specs/recipe-analysis/design.md` 9.3。Phase 2 で12件のテストが落ちて実装側を疑った）。

| 対象                      | 何を固定するか                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `findRecipeForUser`       | **他人の `userId` で `null` が返る**（5.1）／材料・手順が `order` の昇順で返る      |
| `updateRecipeTitle`       | **他人の `userId` で更新件数が 0 になる**（5.6）                                    |
| `PATCH /api/recipes/[id]` | 未ログインで 401／空タイトルで 400／他人のIDで 404／成功で 200                      |
| `app/recipes/[id]`        | 未ログインで `/login` へ／存在しないIDで `notFound()`                               |
| 見出しの人数              | `servings` があれば「材料（4人分）」／`null` なら「材料」で**数字が出ない**（5.5）  |
| 絞り込み                  | 既定が「全体」／「野菜」を押すと他カテゴリの行が消える／0件のカテゴリで文言が出る   |
| 材料行                    | `amount` が `null` でも材料名が出る／「適量」がそのまま出る                         |
| 手順                      | 全件が `order` の昇順で、1からの連番で出る                                          |
| タイトルの改名            | `✎` で入力欄になる／確定で表示が変わる／空では確定できない                          |
| 確認モード                | バナーと最下部バーが出る／通常モードでは出ない                                      |
| ヘッダー                  | **Phase 3 では `← 一覧` も `編集` も出ない**（requirements.md 決着2・3）            |
| タブの並び                | **enum の順序ではなく「全体 / 野菜 / 調味料 / その他」**（5.4）                     |
| エラーの対応表            | 新しい2コードが `STATUS` 表に載っている（既存の `api-response.test.ts` が検出する） |

## テストを書くときの前提

- **Prisma はモックする。** 既存の `__tests__/recipe-repository.test.ts` に前例がある。段階2 でその流儀に合わせる
- `vitest.setup.ts` の `afterEach(cleanup)` が入っているので、DOM はテスト間で残らない
- **`npm run lint` は `--max-warnings 0`。** 未使用変数が1つあるだけで落ちる

## 自動テストで担保しないもの

- **見た目そのもの**（色・余白・角丸）。jsdom は Tailwind の CSS を解釈しない（`.kiro/specs/recipe-analysis/design.md` 6.2.9）
- **固定ヘッダーが実際に固定されるか**、アンカー移動でヘッダーの下に潜らないか。**実機とブラウザでしか分からない**
- スクロールに応じた現在位置の反映

---

# 9. 落とし穴の一覧

**着手前に書いているので、実装中に増える。**

| #   | 落とし穴                                                                          | 症状                                                                                                                        | 対処                  |
| --- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 1   | `params` を `await` せずに使う                                                    | **型は通り、実行時に `undefined`。** 「見つかりません」が出るだけでエラーにならない                                         | 1.2                   |
| 2   | `findUnique` で取ってから `userId` を確認する                                     | 確認を忘れても動く。**他人のレシピが読める**                                                                                | 5.1                   |
| 3   | `include` に `orderBy` を書かない                                                 | 並び順が DB 依存。**手元では偶然正しく見える**                                                                              | 1.4                   |
| 4   | 「存在しない」と「他人のもの」を出し分ける                                        | IDの総当たりで他人のレシピの存在が分かる                                                                                    | 5.2                   |
| 5   | `requireUserId()` を Server Component で使う                                      | **`/login` へのリダイレクトではなくエラー画面になる**                                                                       | 5.2                   |
| 6   | `Object.values(Category)` をタブの並びに使う                                      | スキーマの enum 順を変えると画面のタブ順が変わる。**型では捕まらない**                                                      | 5.4                   |
| 7   | `servings` が `null` のとき数字を補う                                             | 読み取れなかったことを隠す。**丸めない**                                                                                    | 5.5                   |
| 8   | 資料どおり「分量が左」に戻す                                                      | **ユーザー決定（2026-08-24）で材料名が左。** 資料のほうが古い扱いになっている                                               | 6.5                   |
| 9   | `scroll-margin-top` を入れない                                                    | **アンカー移動の着地点が固定ヘッダーの下に潜る。エラーは出ない**                                                            | 6.4                   |
| 10  | 資料の「`scrollIntoView` を使わない」をそのまま写す                               | あれはモックが枠内スクロールだったため。**実アプリのスクロールコンテナは別**                                                | 6.4                   |
| 11  | 最下部固定バーの分の余白を入れない                                                | 最後の手順がバーに隠れる                                                                                                    | 6.3                   |
| 12  | S-04 と S-04c を別コンポーネントにする                                            | 片方だけ直して表示がずれる。**差は3点だけ**                                                                                 | 6.3                   |
| 13  | `--color-accent` の上に文字を置く                                                 | 白文字 2.1:1 / 濃色 4.2:1 でどちらもコントラスト不足                                                                        | 6.1                   |
| 14  | ヘッダーやタブに4種類目の見た目を足す                                             | 「移動 / 操作 / 絞り込み」の描き分けが壊れる。**このデザインの中核ルール**                                                  | 6.2                   |
| 15  | `Date` を Client Component に渡す                                                 | 実行時に「Only plain objects can be passed」。**ビルドでは捕まらない**                                                      | 5.3                   |
| 16  | 旧版の緑基調 `Recipe Design System.dc.html` を参照する                            | 履歴として同梱されているだけ。**正は v2**                                                                                   | 確定事項              |
| 19  | タイトル更新に `update({ where: { id } })` を使う                                 | 所有チェックが `where` の外に出る。**忘れても動き、他人のレシピを改名できる**                                               | 5.6                   |
| 20  | 新しいエラーを `lib/errors.ts` にだけ足す                                         | `STATUS` 表に無いコードは 500 にフォールバックする。**型では捕まらない**                                                    | 5.6 / 7.2             |
| 21  | `PATCH` のテストを jsdom で走らせる                                               | Request / Response が壊れ、**実装が悪いように見える**                                                                       | 8章                   |
| 22  | Route Handler の `params` を `await` しない                                       | `page.js` と同じく Route Handler の `params` も Promise                                                                     | 1.2 / 5.6             |
| 23  | ヘッダー上段を「空の段」として高さだけ残す                                        | Phase 3 では中身が両方とも無い。**段ごと描かない**                                                                          | 6.1                   |
| 24  | `not-found.tsx` を行き止まりにする                                                | `← 一覧` が Phase 3 に無いため、戻る手段が消える                                                                            | 7.1                   |
| 25  | ページを作った直後に `tsc` を回す                                                 | **`PageProps<"/新ルート">` は typegen 前だと解決しない。** コードが正しくても落ちる                                         | 1.2                   |
| 26  | ルート表に `not-found` が出ないので効いていないと思う                             | `not-found.tsx` はルートではない。**SSR チャンクに入る**                                                                    | 1.3                   |
| 27  | クライアントコンポーネントで `@/generated/prisma/client` から**値**を import する | **ビルドが `does not support external modules (request: node:module)` で落ちる。** 値は `@/generated/prisma/enums` から取る | 5.7                   |
| 28  | 資料のトークン表に無い色を、近い既存トークンで代用する                            | 資料のコンポーネント仕様には書かれている。**推測ではないので `@theme` に足す**                                              | 5.7                   |
| 29  | 設計書に**クラスに見える文字列**（`scroll-mt-[var(...)]` など）を書く             | Tailwind v4 が `.md` も走査して拾い、**不正なCSSを生成して `npm run dev` が起動しなくなる**。`npm run build` では捕まらない | 9.2                   |
| 17  | Tailwind のトークン名を打ち間違える                                               | **ビルドは通り、そのCSSだけ静かに空になる。** 成果物のCSSで確認する                                                         | recipe-analysis 6.2.6 |
| 18  | `--size-tap` から `h-tap` が生えると思う                                          | Tailwind v4 に `--size-*` の名前空間は無い。`h-[var(--size-tap)]` と書く                                                    | recipe-analysis 6.2.6 |

## 9.1 Phase 2 から引き継ぐ環境側の落とし穴

**リポジトリを新しくクローンした直後は、コードが正しくても検証コマンドが落ちる**（`.kiro/specs/recipe-analysis/design.md` 9.1）。`.env` が無い → `prisma generate` 失敗 → `generated/prisma` 欠落で `tsc` 失敗 → `.next` 未生成で `LayoutProps` が解決できず `tsc` 失敗、と3段階に連鎖する。**上から順に解消する。**

## 9.2 ⚠️ 設計書に書いた文字列で開発サーバーが起動しなくなった（✅ 実測 2026-08-24、段階8）

**この文書に説明として書いた1行が、アプリを壊した。**

design.md 6.4 の表に `scroll-mt-[var(...)]` と**省略形で**書いたところ、**Tailwind v4 がそれをクラス候補として拾い**、次のCSSを生成した。

```css
.scroll-mt-\[var\(\.\.\.\)\] {
  scroll-margin-top: var(...); /* ← 不正 */
}
```

`npm run dev` が `Parsing CSS source code failed / Unexpected token Delim('.')` で起動しなくなった。

### **`npm run build` では捕まらない**

| コマンド        | 挙動                                                                        |
| --------------- | --------------------------------------------------------------------------- |
| `npm run build` | **通る。** 本番の lightningcss が不正な宣言を黙って捨て、空のルールだけ残す |
| `npm run dev`   | **落ちる。** Turbopack の CSS パーサがエラーにする                          |

**検証手順（`format` / `lint` / `tsc` / `test` / `build`）を全部通しても素通りする。** 実際にこの順で全部 0 を確認した直後に、ユーザーがブラウザで踏んだ。

### 対処（2段構え）

1. **文書側**: 省略形をやめ、**実在するクラス名**（`scroll-mt-[var(--recipe-header-h)]`）で書く。これなら生成されても有効なCSSになる
2. **設定側**: `app/globals.css` に **`@source not "../**/*.md";`** を追加し、**Markdown を走査対象から外した**

> **`CLAUDE.md` の「lint / format の設定ファイルを推測で変更しない」に反しない。** あの規則が禁じているのは思い込みでの変更で、ここは**再現した失敗を確認してから**入れている（Phase 2 の `.prettierignore` 追加と同じ扱い。recipe-analysis design.md 9.2）。

- **`@source not` は tailwindcss 4.3.3 でサポートされている**（📄 出典: `node_modules/tailwindcss/dist/lib.js` の `@source` パーサに `startsWith("not ")` の分岐。パスは要クォート）
- **クラスは `.tsx` にしか書かないので、除外しても実CSSは減らない**（除外後も `scroll-margin-top: var(--recipe-header-h)` が出ることを確認）
- **Phase 2 でも同じ混入が起きていた**（recipe-analysis design.md 落とし穴 #41）。あのときは未使用の `md:hidden` が1行増えるだけで無害だったため放置された。**設計書に実装の詳細を書くほど踏みやすくなる**ので、今回は根から塞いだ

### 検証手順への申し送り

**`npm run build` が通っても、開発サーバーが起動するとは限らない。** CSS に関わる変更をしたときは、**ブラウザで1回開くまで完了にしない。**

---

# 10. 受け入れの確認手順

**コードを見ずに真偽が決まる形で書く**（`.kiro/README.md` 4）。

| #   | 手順                                               | 期待                                               |
| --- | -------------------------------------------------- | -------------------------------------------------- |
| 1   | 未ログインで `/recipes/<id>` を開く                | `/login` へリダイレクトされる                      |
| 2   | 自分のレシピを開く                                 | タイトル・材料・手順が出る                         |
| 3   | 材料の件数を DB と突き合わせる                     | 一致する                                           |
| 4   | `servings` が入ったレシピを開く                    | 見出しが「材料（4人分）」                          |
| 5   | `servings` が `null` のレシピを開く                | 見出しが「材料」で、**数字が出ない**               |
| 6   | 「野菜」タブを押す                                 | 野菜だけが残り、**URLは変わらない**                |
| 7   | 該当0件のカテゴリを押す                            | 空白ではなく文言が出る                             |
| 8   | 下までスクロールする                               | ヘッダーが上部に残っている                         |
| 9   | 「作り方 ↓」を押す                                 | 作り方の見出しが**ヘッダーに隠れず**画面上部に来る |
| 10  | 作り方までスクロールする                           | 押さなくても「作り方」が現在位置として示される     |
| 11  | 別ユーザーでログインし、他人のレシピIDを直打ちする | 内容が出ない。**存在しないIDと同じ画面**           |
| 12  | 存在しないIDを開く                                 | 日本語の説明と戻る導線。**内部情報が出ない**       |
| 13  | ヘッダーの `✎` を押す                              | タイトルがその場で入力欄になる                     |
| 14  | タイトルを変えて確定し、再読み込みする             | 変更が残っている                                   |
| 15  | タイトルを空にして確定しようとする                 | 保存されず、その旨が出る                           |
| 16  | 他ユーザーのレシピIDに `PATCH` を送る              | 404 が返り、**タイトルが変わらない**               |
| 17  | 未ログインで `PATCH` を送る                        | 401 が返る                                         |
| 18  | ヘッダーを見る                                     | **`← 一覧` も `編集` も出ない**（決着2・3）        |
| 19  | `/upload` で写真を解析する                         | 完了後、確認モードの画面へ遷移する                 |
| 20  | 確認モードの画面を見る                             | 確認バナーが出る                                   |
| 21  | 確認モードで下までスクロールする                   | 最下部バーが常に見えていて、最後の手順が隠れない   |
| 22  | 「この内容で決定」を押す                           | 通常モードになり、バナーと最下部バーが消える       |
| 23  | 確認モードのまま閉じて、あとで同じレシピを開く     | 内容が残っている（Phase 2 で保存済みのため）       |
| 24  | スマホ実機で開く                                   | 単一カラムで崩れず、タップ領域が押しやすい         |

---

# 11. リスクと対策

| リスク                                   | 影響                                      | 対策                                                             |
| ---------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| 固定ヘッダーとアンカー移動の相性         | 見出しがヘッダーに潜る                    | `scroll-margin-top`。**段階7 で実機確認する**（9章 #9）          |
| 資料の実装指示がモック前提               | そのまま写すと動かない                    | 6.4 の2案を段階7 で比較する                                      |
| 確認モードの伝え方（クエリ / 別ルート）  | 再訪時にまた確認画面が出る                | 段階11 で決める（4章）                                           |
| **Phase 3 のヘッダーに移動の導線が無い** | S-04 から出るのがブラウザバックだけになる | ユーザー決定（決着2・3）。**Phase 4 の `← 一覧` で解消する**     |
| タイトル更新で所有チェックが漏れる       | 他人のレシピを改名できる                  | `updateMany` の `where` に `userId`。**テストで固定する**（5.6） |
| `components/` の置き場所                 | Phase 5 で作り直しになる                  | 段階4 で決める（3章）                                            |
| 実データが1〜数件しか無い                | 材料が多いレシピでの見え方を確認できない  | 段階13 の実測で、材料の多いレシピを1枚追加で解析する             |
