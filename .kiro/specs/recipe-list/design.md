# recipe-list（Phase 4）の設計書

保存済みのレシピを並べ、開き、消す。`app/page.tsx` の暫定ホームを S-02 に置き換え、Phase 3 で保留していた S-04 のヘッダー上段（`← 一覧`）を戻す。

## この文書の読み方

**主張ごとに検証状態のラベルを付けてある**（`.kiro/README.md` の「design.md の書き方」）。

| ラベル    | 意味                                           | 実装時の扱い             |
| --------- | ---------------------------------------------- | ------------------------ |
| ✅ 実測   | 実際に動かして確認した                         | そのまま信じてよい       |
| 📄 出典   | 公式ドキュメントかライブラリのソースで確認した | そのまま信じてよい       |
| ⚠️ 未検証 | 妥当だと考えているが確かめていない             | **実装時に必ず確かめる** |

**ラベルの無い記述は「方針・判断」であって事実の主張ではない。**

## 確定事項（蒸し返さない）

- **視覚仕様は `Design_引き継ぎ資料/design_handoff_recipe_design_system/README.md` が正。** 正本の HTML は `Recipe Design System v2.dc.html`
- **デザインHTMLはリファレンスであって本番コードではない。** Tailwind CSS v4 + React 19 の規約で組み直す
- **「移動 / 操作 / 絞り込み」を面の有無で描き分ける。この3種以外の見た目を足さない**
- **署名付きURLは有効期限1時間・ページ表示時にまとめて発行・DBに保存しない**（2026-08-23 ユーザー決定）
- **サムネイル用の小画像は作らない。** 実機で遅いと感じてから判断する
- **削除は S3 の画像も消す**（2026-08-25 ユーザー決定）
- **一覧だけが 1列 / 3列。他の画面は 640px 単一カラム**

---

# 1. 調査結果

## 1.1 `getSignedUrl` の実物（✅ 実測 2026-08-25、段階1）

**`@aws-sdk/s3-request-presigner` を実際に入れて確認した。** 記憶で書かない（`.kiro/README.md`）。

| 項目                 | 実物                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------- |
| インストール結果     | `@aws-sdk/s3-request-presigner@3.1116.0`（`package.json` は `^3.1116.0`）                   |
| エクスポート         | `S3RequestPresigner` と **`getSignedUrl`** の2つだけ                                        |
| 併存する `client-s3` | `3.1111.0`。**メジャーが揃っていれば混在してよい**（AWS SDK v3 はパッケージごとに版が進む） |

**確認コマンド（再現手順）**

```bash
node -e "console.log(Object.keys(require('@aws-sdk/s3-request-presigner')))"
```

→ `[ 'S3RequestPresigner', 'getSignedUrl' ]`

### 型（📄 出典: `node_modules/@aws-sdk/s3-request-presigner/dist-types/getSignedUrl.d.ts`）

```ts
export declare const getSignedUrl: <
  InputTypesUnion extends object,
  InputType extends InputTypesUnion,
  OutputType extends MetadataBearer = MetadataBearer,
>(
  client: Client<any, InputTypesUnion, MetadataBearer, any>,
  command: Command<InputType, OutputType, any, InputTypesUnion, MetadataBearer>,
  options?: RequestPresigningArguments,
) => Promise<string>;
```

**`client` と `command` を受け取って `Promise<string>` を返す。** URLの文字列がそのまま返る。

### **`expiresIn` の単位は「秒」**（📄 出典: `node_modules/@smithy/types/dist-types/signature.d.ts` L56-60）

```ts
export interface RequestPresigningArguments extends RequestSigningArguments {
  /**
   * The number of seconds before the presigned URL expires
   */
  expiresIn?: number;
}
```

**1時間 = `3600`。** ミリ秒ではない。

- **無いとどうなるか**: ミリ秒のつもりで `3600000` を渡すと**約41日間有効なURL**が出る。**エラーは出ず、画像も普通に表示される**ので気づけない。非公開バケットにした意味が薄れる
- **見分け方**: 生成されたURLのクエリ `X-Amz-Expires` を見る。**`3600` であること**

### 署名の計算に AWS への通信は発生しない

**ローカルで HMAC を計算するだけ**なので、10件まとめて発行しても往復は増えない（`REQUIREMENTS.md` 6.1 の「1秒以内」に効く）。これが「ページ表示時にまとめて発行」を選べた理由。

## 1.2 `DeleteObjectCommand` は `@aws-sdk/client-s3` にある（✅ 実測 2026-08-25、段階1）

```bash
node -e "const s=require('@aws-sdk/client-s3'); for (const n of ['S3Client','PutObjectCommand','GetObjectCommand','DeleteObjectCommand']) console.log(n, typeof s[n])"
```

→ 4つとも `function`。**追加のインストールは不要。**

IAM ポリシー側も既に `s3:DeleteObject` を含んでいる（📄 出典: `SETUP.md` L125）。**ユーザーの手作業待ちは無い。**

## 1.3 `npm audit` の 3 high は Phase 4 が持ち込んだものではない（✅ 実測 2026-08-25、段階1）

presigner を入れた直後の `npm audit` が 3 件の high を報告するが、**中身は `prisma` → `@prisma/config` → `deepmerge-ts` の依存で、presigner とは無関係。**

- **`npm audit fix --force` を実行しない。** `prisma@6.12.0` へのダウングレードを提案してくる。**Prisma 7 は確定事項**（`.kiro/steering/tech-stack.md`）で、6 に落とすとドライバアダプタ構成が壊れる
- 内容は「再帰的なオブジェクトグラフのマージでスタックを使い切る」。**`prisma` は CLI 側の devDependency** で、ユーザー入力を渡す経路に無い

## 1.4 日付の書式とタイムゾーン（📄 出典＋方針）

デザインの指定は **「2026年8月12日」**（引き継ぎ資料「レシピカード」）。

**Vercel の関数は UTC で動く。** `Recipe.createdAt` を素直に整形すると、**日本時間の朝9時より前に保存したレシピが前日として表示される。**

```ts
new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
  day: "numeric",
}).format(createdAt);
```

→ `"2026年8月12日"`

- **`timeZone` を明示する。** 省略すると実行環境の既定（Vercel は UTC / 手元は JST）になり、**ローカルでは正しく見えて本番でだけ1日ずれる**
- **`toLocaleDateString()` を素で使わない。** 同じ理由
- **⚠️ 整形は Server Component で済ませ、Client Component には文字列だけ渡す。** `Date` をそのまま渡すと実行時に「Only plain objects can be passed」で落ちる（recipe-view design.md 落とし穴 #15）

## 1.5 一覧に材料と手順は要らない

カードに出すのは**サムネイル・タイトル・作成日**だけ（引き継ぎ資料「レシピカード」）。

**`findRecipeForUser` のように `include` で材料と手順まで引かない。** 10件のレシピに材料8件・手順6件が付くと、**カードに使わない 140 行を運ぶことになる。** `select` で必要な4列だけを取る（5.1）。

---

# 2. データモデル

**このフェーズでのスキーマ変更は無い。マイグレーションも発生しない。**

```prisma
model Recipe     { id, userId, title, imageKey, servings, createdAt, updatedAt, ingredients[], steps[] }
model Ingredient { id, recipeId, name, amount?, category, order }
model Step       { id, recipeId, order, text }
```

✅ 実測（2026-08-25、段階1。`prisma/schema.prisma` L53-92）:

- **`Recipe.createdAt` がある**（`@default(now())`）。並び順とカードの日付に使う
- **`@@index([userId])` がある**。一覧のスコープ付き取得がインデックスに乗る
- **`Ingredient` / `Step` は `recipe` 関連に `onDelete: Cascade`。** レシピを消せば DB 側が材料と手順を消す。**アプリ側で先に消す必要はない**

> **⚠️ Cascade は DB の外側までは面倒を見ない。** S3 のオブジェクトは残る。だから 5.3 で明示的に消す。

---

# 3. ファイル構成

```
app/
├── page.tsx                  # S-02 の入口。Server Component。認可・取得・署名付きURLの発行
├── recipe-card.tsx           # カード1枚（サムネイル・タイトル・作成日）
├── recipe-list-header.tsx    # 「レシピ」＋件数＋ログアウト
├── empty-state.tsx           # レシピ0件のとき（Req3）
├── delete-dialog.tsx         # 削除の確認ダイアログ（Req5）
└── api/recipes/[id]/
    └── route.ts              # DELETE を追加。**3つ目の保護付きエンドポイント**
lib/
├── clients/s3.ts             # getRecipeImageUrl() / deleteRecipeImage() を追加
├── repositories/recipe.ts    # listRecipesForUser() / deleteRecipeForUser() を追加
└── recipes/date.ts           # 作成日の整形。**サーバーとクライアントで共有**（1.4）
```

`.kiro/steering/architecture.md` の3層に従う。**Repository は Prisma だけを知る。**

- **一覧の表示は Route Handler を経由しない。** 画面（Server Component）から Repository と S3 クライアントを直接呼ぶ。HTTP を挟む理由が無く、挟むと往復の分だけ遅くなる（`REQUIREMENTS.md` 6.1）
- **削除だけは Route Handler が要る。** ブラウザからの操作なので、`analyze`（POST）・`[id]`（PATCH）に続く**3つ目の保護付きエンドポイント**になる
- **DELETE は既存の `app/api/recipes/[id]/route.ts` に足す。** 同じリソースへの別メソッドなので、ファイルを分けない

## 3.1 `components/` は今回も新設しない

Phase 3 の決着（recipe-view design.md 3.1）を踏襲する。**ルート直下に同居させる。**

- `app/upload/`（Phase 2）・`app/recipes/[id]/`（Phase 3）と同じ形。**前例が2つある**
- **2つ目の利用者が現れてから動かす。** Phase 5 で S-05 がカードを使いたくなったら、そのとき移す

> **⚠️ `app/` 直下に置く点だけ Phase 2・3 と違う。** ルートとして解釈されるのは `page` / `layout` / `route` / `not-found` などの予約ファイル名だけなので、`recipe-card.tsx` がルートになることはない（Phase 2 で実証済み）。

---

# 4. 処理の流れ

```
GET /
  1. auth() → session.user.id が無ければ redirect("/login")   ← 画面はこの流儀（落とし穴 #5）
  2. listRecipesForUser(userId)                                ← userId でスコープ。createdAt 降順
  3. 各件の imageKey から署名付きURLをまとめて発行（1時間）      ← Promise.all
  4. createdAt を "2026年8月12日" の文字列に整形               ← Asia/Tokyo 明示
  5. 0件なら EmptyState、1件以上なら RecipeCard を並べる

DELETE /api/recipes/<id>
  1. requireUserId()                    ← 未ログインなら 401（Route Handler はこの流儀）
  2. deleteRecipeForUser(userId, id)    ← userId スコープ。消せた件数と imageKey を返す
  3. 0件なら RecipeNotFoundError → 404  ← 「存在しない」と「他人のもの」を区別しない
  4. deleteRecipeImage(imageKey)        ← **DBの後**。失敗してもリクエストは成功で返す（5.3）
```

---

# 5. 実装

## 5.1 一覧の取得

```ts
// lib/repositories/recipe.ts に追加する
import { prisma } from "@/lib/prisma";

/** 一覧のカードが使う列だけ。**材料と手順は引かない**（design.md 1.5） */
export type RecipeListItem = {
  id: string;
  title: string;
  imageKey: string;
  createdAt: Date;
};

/**
 * userId でスコープした一覧の取得。**他人のレシピは1件も含まれない。**
 *
 * `select` で4列に絞る。`include` で材料と手順まで引くと、カードに使わない行を運ぶ。
 */
export async function listRecipesForUser(userId: string): Promise<RecipeListItem[]> {
  return prisma.recipe.findMany({
    where: { userId },
    select: { id: true, title: true, imageKey: true, createdAt: true },
    // 新しいものが先頭。直前に撮ったレシピが一番上に来る（requirements.md Req1）
    orderBy: { createdAt: "desc" },
  });
}
```

- **無いとどうなるか**: `where` から `userId` を落とすと、**全ユーザーのレシピが並ぶ。** テストでは1人分しか作らないので気づけない。**必ず「他人のレシピが含まれない」テストを書く**（8章）
- **見分け方**: 2人分のレシピを作り、片方の `userId` で呼んで**もう片方が1件も返らない**こと
- **`orderBy` を省かない。** 並び順が DB 依存になり、**手元では偶然新しい順に見える**（Phase 3 の落とし穴 #3 と同じ）

## 5.2 署名付きURLの発行

```ts
// lib/clients/s3.ts に追加する
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { StorageFailedError } from "@/lib/errors";

/**
 * 署名付きURLの有効期限（秒）。**1時間**（2026-08-23 ユーザー決定）。
 *
 * **単位は秒。ミリ秒ではない**（design.md 1.1、📄 `RequestPresigningArguments.expiresIn`）。
 * 3600000 を渡すと約41日有効なURLが出るが、**エラーも出ず画像も表示されるので気づけない。**
 */
export const IMAGE_URL_EXPIRES_IN_SECONDS = 3600;

/**
 * 表示用の署名付きURLを発行する。
 *
 * **発行したURLをDBに保存しない**（`Recipe.imageKey` はキーのまま）。有効期限があるので、
 * 保存した頃には切れている。**表示のたびに発行する。**
 *
 * 署名の計算はローカルで完結し、AWS への通信は発生しない。**全件分をまとめて発行してよい。**
 */
export async function getRecipeImageUrl(imageKey: string): Promise<string> {
  const bucket = process.env.S3_BUCKET_NAME;
  if (!bucket) {
    throw new StorageFailedError({ cause: new Error("S3_BUCKET_NAME が設定されていない") });
  }

  try {
    return await getSignedUrl(
      getClient(),
      new GetObjectCommand({ Bucket: bucket, Key: imageKey }),
      { expiresIn: IMAGE_URL_EXPIRES_IN_SECONDS },
    );
  } catch (cause) {
    // 生メッセージにはバケット名やリージョンが入る。cause に隔離する
    throw new StorageFailedError({ cause });
  }
}
```

`getClient()` は既存の遅延生成（`lib/clients/s3.ts`）をそのまま使う。**新しいクライアントを作らない。**

### 1件の失敗で一覧全体を落とさない

**`Promise.all` は1つでも reject すると全体が reject する。** 画像URLが1件作れないだけで**一覧そのものが開かなくなる**のは割に合わない（requirements.md Req2「画像が読めなかったカードでも、タイトルと作成日は読めて、レシピを開ける」）。

**`Promise.allSettled` を使い、失敗した件は `imageUrl: null` にしてカードを描く。**

- **無いとどうなるか**: `S3_BUCKET_NAME` の設定漏れや1件のキー不正で、**保存済みの全レシピに辿り着けなくなる**
- **見分け方**: 存在しないキーを持つレシピを1件混ぜて一覧を開く。**他のカードが並び、そのカードだけ画像が欠ける**こと

> **⚠️ 署名付きURLは「キーが存在するか」を見ずに発行できる。** 署名はローカル計算なので、**存在しないキーでも URL は作れてしまい、失敗するのはブラウザが取りに行った時（404）。** つまり `imageUrl: null` に落ちるのは主に設定不備のときで、キー不正は**ブラウザ側で画像が壊れる**形で出る。**`<img>` 側にも代替表示が要る**（6.3）。

## 5.3 削除

### Repository

```ts
// lib/repositories/recipe.ts に追加する
import { prisma } from "@/lib/prisma";

/** 削除の結果。`imageKey` は S3 の後片付けに使う。**消せなかったときは null。** */
export type DeletedRecipe = { imageKey: string } | null;

/**
 * レシピを削除する。**他人のレシピは消えない。**
 *
 * **消す前に `imageKey` を読む必要がある。** 消した後では取れず、S3 の画像を
 * 後片付けできなくなる。だから `deleteMany` 一発ではなく、取得 → 削除の2手にする。
 *
 * **`delete({ where: { id } })` を使わない。** 所有チェックが `where` の外に出ると、
 * 書き忘れても動いてしまう（recipe-view design.md 落とし穴 #19 と同じ形）。
 *
 * `Ingredient` / `Step` は `onDelete: Cascade` なので DB 側が消す（design.md 2章）。
 *
 * **見分け方**: 他人の userId で呼んで `null` が返ること。オブジェクトが返ったらスコープが外れている。
 */
export async function deleteRecipeForUser(
  userId: string,
  recipeId: string,
): Promise<DeletedRecipe> {
  // ⚠️ userId を where に入れるのが唯一の所有チェック
  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, userId },
    select: { imageKey: true },
  });

  if (recipe === null) {
    return null;
  }

  // ここも userId を落とさない。findFirst と delete の間に別リクエストが
  // 所有者を変えることは無いが、**where を1箇所だけ緩める癖を作らない**
  const result = await prisma.recipe.deleteMany({ where: { id: recipeId, userId } });

  return result.count === 0 ? null : { imageKey: recipe.imageKey };
}
```

### S3 の後片付け

```ts
// lib/clients/s3.ts に追加する
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

/**
 * レシピの画像を S3 から消す。
 *
 * **例外を投げない。** 呼ばれる時点で DB のレシピは既に消えており、
 * ここで失敗してもユーザーにできることは何も無い（5.3 の順序）。
 * **握り潰しではなくログに出す**（`.kiro/steering/architecture.md`「例外を握り潰さない」）。
 */
export async function deleteRecipeImage(imageKey: string): Promise<void> {
  const bucket = process.env.S3_BUCKET_NAME;
  if (!bucket) {
    console.error("[s3] S3_BUCKET_NAME が設定されていないため画像を削除できない", { imageKey });
    return;
  }

  try {
    await getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: imageKey }));
  } catch (cause) {
    // 孤児の画像が残るだけで、ユーザーの操作は完了している。**リクエストは失敗させない**
    console.error("[s3] 画像の削除に失敗した", { imageKey, cause });
  }
}
```

### ⚠️ 順序は「DB を消してから S3」（2026-08-25 決定）

**逆にしない。** どちらが先でも片方が失敗する可能性は残るが、**残る壊れ方が違う。**

| 順序                | 途中で失敗すると                     | 影響                                                     |
| ------------------- | ------------------------------------ | -------------------------------------------------------- |
| **DB → S3**（採用） | S3 に孤児の画像が残る                | ユーザーには見えない。保管料だけ（極小）                 |
| S3 → DB             | **画像の無いレシピがユーザーに残る** | 一覧に壊れたカードが出続け、**もう一度消すしか直せない** |

**ユーザーに見える壊れ方を避ける。** これは Phase 2 の「S3 → 解析 → DB」の判断（recipe-analysis design.md 397行）と同じ考え方。

- **S3 の削除失敗でリクエストを失敗させない。** DB からは消えているので、ユーザーにとって操作は完了している。**「失敗しました」と出して再試行させると、2回目は 404 になる**

### Route Handler

```ts
// app/api/recipes/[id]/route.ts に追加する（PATCH と同じファイル）
import { deleteRecipeImage } from "@/lib/clients/s3";
import { deleteRecipeForUser } from "@/lib/repositories/recipe";

export async function DELETE(_request: Request, context: RouteContext<"/api/recipes/[id]">) {
  try {
    // ⚠️ Route Handler の params も Promise（recipe-view design.md 落とし穴 #22）
    const { id } = await context.params;

    // クライアントが送ってきた userId は見ない。**セッションだけが根拠**
    const userId = await requireUserId();

    const deleted = await deleteRecipeForUser(userId, id);

    // null は「存在しない」か「他人のもの」。**区別せず 404**（Phase 3 と同じ理由）
    if (deleted === null) {
      throw new RecipeNotFoundError();
    }

    // **DBの後。** ここで失敗してもレシピは消えているので、例外にしない（上記）
    await deleteRecipeImage(deleted.imageKey);

    return successResponse({ id });
  } catch (error) {
    return errorResponse(error);
  }
}
```

**新しいエラーコードは足さない。** `RecipeNotFoundError`（404）と `UnauthorizedError`（401）が `lib/errors.ts` に既にあり、`lib/api-response.ts` の `STATUS` 表にも載っている（✅ 実測 2026-08-25、段階1）。**表に無いコードは 500 にフォールバックする**（recipe-view 落とし穴 #20）ので、足すときは両方に足す。

## 5.4 作成日の整形

```ts
// lib/recipes/date.ts（新規）

/**
 * カードの作成日。デザインの指定は「2026年8月12日」（引き継ぎ資料「レシピカード」）。
 *
 * **`timeZone` を明示する。** 省略すると実行環境の既定になり、Vercel（UTC）と
 * 手元（JST）で結果が変わる。**日本時間の朝9時より前に保存したレシピが前日になる**
 * （design.md 1.4）。ローカルでは正しく見えて本番でだけずれるので、テストで固定する。
 */
const FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
  day: "numeric",
});

export function formatRecipeDate(date: Date): string {
  return FORMATTER.format(date);
}
```

**`lib/recipes/title.ts` と同じ置き場所にする。** サーバー側で呼ぶが、Phase 5 で編集画面が使う可能性があるので `lib/` に出しておく（`title.ts` が共有の前例）。

## 5.5 ログアウトの移設

暫定ホーム（`app/page.tsx`）の `signOut` を使った Server Action の form を、`recipe-list-header.tsx` へ移す。

```tsx
<form
  action={async () => {
    "use server";
    await signOut({ redirectTo: "/login" });
  }}
>
```

- **Server Action のまま移す。** 動いている形を変えない。**Client Component にはしない**（`recipe-list-header.tsx` は Server Component のままでよい）
- **見た目は「操作」＝枠線ボタン**（6.2）。押すとログイン状態が変わるので「移動」ではない

## 5.6 認可は画面の流儀に従う

```tsx
// app/page.tsx
const session = await auth();

if (!session?.user?.id) {
  redirect("/login");
}
```

**`requireUserId()` を画面で使わない**（recipe-view design.md 落とし穴 #5）。`UnauthorizedError` を投げるので、**`/login` へのリダイレクトではなくエラー画面になる。** `requireUserId()` は Route Handler 用。

**現在の `app/page.tsx` が既にこの形なので、置き換えの際に消さないこと。**

---

# 6. 画面

**`UI_DESIGN.md` が構造（何をどこに置くか）、この章が実装上の決定**（`.kiro/README.md` 5）。

## 6.1 視覚仕様の対応表（📄 出典: 引き継ぎ資料 README「Screens 2」「レシピカード」「空状態」）

**hifi なので確定値。推測で変えない。** トークン名は `app/globals.css` の `@theme` にある。

| 部位         | 仕様                                                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ヘッダー** | 面 `--color-header` / 下境界 1px `--color-border` / padding 20px。左「レシピ」22px 700、右に件数 15px `--color-ink-sub`                                                   |
| **本文**     | padding 16px、カード縦積み gap 16px。**PC（768px〜）は3列グリッド gap 20px**、コンテナ padding 24px 28px                                                                  |
| **カード**   | 面 `--color-surface` / 枠 1px `--color-border` / 角丸 `--radius-md`(12px) / 影 `--shadow-e1` / `overflow: hidden`                                                         |
| 　サムネイル | `aspect-ratio: 16 / 10`。下に padding 16px                                                                                                                                |
| 　タイトル   | 19px / 700 / lh 1.5、**2行まで**（以降省略）                                                                                                                              |
| 　作成日     | 15px / `--color-ink-sub` / 上マージン 4px、形式「2026年8月12日」                                                                                                          |
| 　当たり判定 | **カード全面がタップ領域**                                                                                                                                                |
| **FAB**      | `position: fixed` / right 20px / bottom 24px / 64px円 / 面 `--color-link` / 白の ＋ 32px / 影 `--shadow-e2`                                                               |
| **空状態**   | 枠 1.5px dashed `--color-border-strong` / 角丸12px / padding 40px 24px / 面 `--color-header` / 中央揃え / gap 14px                                                        |
| 　中身       | 56px角の枠付きアイコン（＋）／見出し「レシピなし」19px 700／説明 17px lh1.8 max-width 26ch／主要ボタン「写真を撮る」                                                      |
| **ボタン**   | 主要: 面 `--color-primary`（hover `--color-primary-dark`）／白 19px 700／56px／角丸12px。副次: 白（hover `--color-primary-soft`）／`--color-link` 19px 500／枠1.5px／56px |
| 　危険       | hover の面は `--color-danger-soft`。文字は `--color-danger`                                                                                                               |
| 　ラベル     | **体言止め・最大8文字**（「削除する」「やめる」「写真を撮る」）                                                                                                           |
| レスポンシブ | **この画面だけが 1列（〜767px）/ 3列（768px〜）**                                                                                                                         |

> **⚠️ デザイン資料は FAB を `position: absolute` と書いているが、括弧書きで「実装は fixed」と明記している**（引き継ぎ資料「Screens 2」）。**モックがスマホ枠の中に描かれているための表記。** Phase 3 のアンカー移動（落とし穴 #10）と同じ性質なので、**実アプリでは `fixed`。**

## 6.2 ログアウトの見た目（2026-08-25 ユーザー決定）

**デザイン資料の一覧ヘッダーは「左: レシピ / 右: 件数」で、ログアウトの居場所が無い。** 暫定ホームが消えると導線そのものが失われるので、このフェーズで置き場所を決めた。

| 項目       | 決定                                                              |
| ---------- | ----------------------------------------------------------------- |
| 場所       | **ヘッダーの右端**                                                |
| 見た目     | **「操作」＝枠線 1.5px `--color-link` / 角丸8px / 面は白 / 48px** |
| 件数の扱い | ヘッダー内に残す。**ログアウトの左**に置く                        |

**「操作」を選んだ理由。** 押すとログイン状態が変わるので、`✎ 改題` や `編集` と同じ種類（recipe-view design.md 6.2）。**面なしのテキストリンクにすると「移動」の見た目になり、中核ルールが壊れる**（落とし穴 #14）。

- **4種類目の見た目を作らない。** 既存の3種のどれかに割り当てる

## 6.3 サムネイルの実装

- **`next/image` を使わない。** 署名付きURLは1時間で切れるうえ、Next.js の画像最適化は**外部ドメインの許可設定（`remotePatterns`）**が要る。**素の `<img>` で出す**
  - **⚠️ ESLint の `@next/next/no-img-element` が warning を出す可能性がある。** `npm run lint` は `--max-warnings 0` なので**警告1件で落ちる**（`HANDOVER.md` 2.1）。実装時に確認し、落ちたら**設定を緩めるのではなく**該当行に理由付きの `eslint-disable-next-line` を置く
- **`alt` はレシピのタイトル**にする。画像が出ないときに何の写真かが読める
- **画像が壊れたときに枠が潰れないよう、サムネイル領域に `aspect-ratio` と背景色を先に置く**（`--color-track`）。読み込み前後でカードの高さが動かない
- **`loading="lazy"` を付ける。** 3列で並ぶと初期表示で全件取りに行くことになる

## 6.4 削除の導線と確認ダイアログ

**「削除は常に確認ダイアログを経由（縦並びボタン）」**（引き継ぎ資料 Interactions）。

### 導線の置き方

**カード全面がタップ領域**（＝レシピを開く）なので、**削除ボタンをカードの中に素朴に置くと入れ子のクリックになる。**

- **削除ボタンはカードの上に重ねる**（サムネイル右上）。`<a>` の**外側**に置き、`position: absolute` で重ねる
- **無いとどうなるか**: `<a>` の中に `<button>` を入れると**HTMLとして不正**（インタラクティブ要素の入れ子）で、削除を押したつもりがレシピが開く。**ブラウザによって挙動が違う**

### ダイアログ

- **ダイアログは Client Component。** どのレシピを消すかの state（引き継ぎ資料 State Management の `dialog`）を持つ
- **対象のタイトルを出す。** 「本当に削除しますか」だけだと、どれを選んだのか確認できない
- **ボタンは縦並び。** 「削除する」（危険）と「やめる」
- **`Escape` と背景クリックで閉じられる。** 閉じたときは**消えない**
- 削除が終わったら `router.refresh()` で一覧を取り直す。**Server Component が持つデータなので、クライアント側で配列から抜かない**（署名付きURLの再発行もここで乗る）

## 6.5 S-04 のヘッダー上段を戻す（Req7）

**Phase 3 が意図的に描かなかった段を復元する**（recipe-view design.md 6.1 / requirements.md 決着2・3）。

| 項目                 | 戻し方                                                                          |
| -------------------- | ------------------------------------------------------------------------------- |
| 上段の padding       | **6px 12px**（recipe-view design.md 6.1 の表から復元）                          |
| 左                   | `← 一覧` — **「移動」の見た目**（面なし・枠なし・`--color-link`・48px）         |
| 右                   | **`編集` は出さない。** Phase 5 のまま（決着2）                                 |
| **中段の上余白12px** | **取り除く。** 上段が無いぶんPhase 3 で足した値で、仕様値ではない（6.4 の注記） |
| 確認モード           | **上段ごと出さない**（`UI_DESIGN.md` S-04c 差3）                                |

- **⚠️ 上段が増えるとヘッダーが約34px高くなる。** アンカー移動の着地点は `--recipe-header-h` の**実測値**を見ているので自動で追従するが、**フォールバック値 112px（`app/globals.css` の `:root`）は古くなる。** JSが動く前に効く値なので、**あわせて見直す**
- **⚠️ CSS に関わる変更なので、ブラウザで1回開くまで完了にしない**（recipe-view design.md 9.2）

## 6.6 `not-found.tsx` の戻り先

**リンク先は既に `/` なので変えなくてよい**（✅ 実測 2026-08-25、段階1）。`/` が S-02 になるため、**直すのはラベルだけ**（「ホームへ戻る」→ 一覧の呼び名）。

**Phase 3 の申し送り（落とし穴 #24「行き止まりにしない」）はこれで解消する。**

---

# 7. エラー設計

## 7.1 画面側（一覧）

| 起きること                             | 出すもの                                                    |
| -------------------------------------- | ----------------------------------------------------------- |
| 未ログイン                             | `/login` へリダイレクト（5.6）                              |
| レシピ0件                              | **エラーではない。** 空状態（Req3）                         |
| 署名付きURLが1件作れない               | **そのカードだけ画像なしで描く。** 一覧は開く（5.2）        |
| 画像URLは作れたが取得に失敗（403/404） | ブラウザ側で画像が欠ける。**`alt` にタイトルが出る**（6.3） |

## 7.2 API 側（削除）

| 状況                    | コード             | HTTP | 文言                                 |
| ----------------------- | ------------------ | ---- | ------------------------------------ |
| 未ログイン              | `UNAUTHORIZED`     | 401  | 既存                                 |
| 存在しない / 他人のもの | `RECIPE_NOT_FOUND` | 404  | 既存。**区別しない**                 |
| S3 の削除に失敗         | —                  | 200  | **エラーにしない。** ログのみ（5.3） |

**新しいエラーコードは足さない。** 足す場合は `lib/errors.ts` と `lib/api-response.ts` の `STATUS` 表の**両方**に足す（落とし穴 #20）。

---

# 8. テスト方針

Phase 3 の 406件に足す。**Vitest + React Testing Library。**

| 対象                  | 何を固定するか                                                                    |
| --------------------- | --------------------------------------------------------------------------------- |
| `listRecipesForUser`  | **他人のレシピが1件も返らない。** `orderBy` が降順。`select` に材料が無い         |
| `deleteRecipeForUser` | **他人の userId では `null`。** 消えたときに `imageKey` が返る                    |
| `getRecipeImageUrl`   | **`expiresIn` に `3600` を渡している**（1.1 の単位ミスを固定）                    |
| `deleteRecipeImage`   | **失敗しても例外を投げない。** バケット未設定でも投げない                         |
| `formatRecipeDate`    | **UTC の 2026-08-11T23:00:00Z が「2026年8月12日」になる**（1.4 のずれを固定）     |
| DELETE ルート         | 401 / 404 / 200。**DBの後に S3 を呼ぶ順序**                                       |
| 一覧の画面            | 0件で空状態、1件以上でカード。件数の表示                                          |
| カード                | カード全面がリンク。**削除ボタンが `<a>` の中に無い**（6.4）                      |
| S-04 ヘッダー         | 通常モードに `← 一覧` が出る。**確認モードでは出ない。`編集` はどちらでも出ない** |

## テストを書くときの前提

- **Route Handler のテストは jsdom で走らせない**（recipe-view 落とし穴 #21）。`Request` / `Response` が壊れ、実装が悪いように見える。既存の `__tests__/recipe-patch-route.test.ts` の環境指定に揃える
- **Repository をモックしたルートのテストは所有チェックを担保しない**（Phase 3 の反省）。`where` から `userId` を抜いても通ってしまうので、**スコープの担保は Repository 層のテストで行う**
- **`formatRecipeDate` のテストは UTC の境界を跨ぐ時刻を使う。** JST の朝9時より前（= UTC の前日）を選ばないと、タイムゾーン指定の有無で差が出ない

## 自動テストで担保しないもの

- 実際の S3 からの画像取得（署名の正しさ）。**ローカルの実測でのみ確認できる**（`.env` の実値はユーザーのローカルにしかない）
- 3列レイアウトの見え方、FAB の重なり、ダイアログの実機での操作感

---

# 9. 落とし穴の一覧

**着手前に書いているので、実装中に増える。**

| #   | 落とし穴                                               | 症状                                                                                                         | 対処                  |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | --------------------- |
| 1   | `expiresIn` をミリ秒のつもりで渡す                     | **約41日有効なURLが出る。エラーも出ず画像も表示される**                                                      | 1.1                   |
| 2   | 署名付きURLをDBに保存する                              | 保存した頃には切れている                                                                                     | 1.1                   |
| 3   | `listRecipesForUser` の `where` から `userId` を落とす | **全ユーザーのレシピが並ぶ。** 1人分しか作らないテストでは通る                                               | 5.1                   |
| 4   | `orderBy` を書かない                                   | 並び順が DB 依存。**手元では偶然新しい順に見える**                                                           | 5.1                   |
| 5   | `include` で材料と手順まで引く                         | カードに使わない行を運ぶ。**動くので気づかない**                                                             | 1.5                   |
| 6   | `Promise.all` で署名付きURLを作る                      | **1件の失敗で一覧全体が開かなくなる**                                                                        | 5.2                   |
| 7   | S3 → DB の順で消す                                     | **画像の無いレシピがユーザーに残る**                                                                         | 5.3                   |
| 8   | S3 の削除失敗でリクエストを失敗させる                  | DB からは消えているので、**再試行すると 404 になる**                                                         | 5.3                   |
| 9   | `delete({ where: { id } })` で消す                     | 所有チェックが `where` の外に出る。**忘れても動き、他人のレシピを消せる**                                    | 5.3                   |
| 10  | 消す前に `imageKey` を読まない                         | 消した後では取れず、**S3 の後片付けができない**                                                              | 5.3                   |
| 11  | `Intl.DateTimeFormat` の `timeZone` を省く             | **ローカルでは正しく、本番（UTC）でだけ1日ずれる**                                                           | 1.4                   |
| 12  | `Date` を Client Component に渡す                      | 実行時に「Only plain objects can be passed」。**ビルドでは捕まらない**                                       | 1.4                   |
| 13  | 削除ボタンをカードの `<a>` の中に置く                  | インタラクティブ要素の入れ子でHTMLとして不正。**削除を押すとレシピが開く**                                   | 6.4                   |
| 14  | 削除後にクライアント側で配列から抜く                   | Server Component が持つデータとずれる。**`router.refresh()` を使う**                                         | 6.4                   |
| 15  | `next/image` を使う                                    | 外部ドメインの `remotePatterns` 設定が要る。**署名付きURLは1時間で切れる**                                   | 6.3                   |
| 16  | `<img>` にして lint が warning を出す                  | **`--max-warnings 0` なので警告1件でコミット前の検証が落ちる。** 設定を緩めず理由付きで無効化する            | 6.3                   |
| 17  | 中段の上余白12px を残したまま上段を戻す                | Phase 3 が上段の代わりに足した値。**二重になる**                                                             | 6.5                   |
| 18  | `--recipe-header-h` のフォールバック 112px を放置      | 上段が増えて約34px高くなる。**JSが動く前の着地点だけがずれる**                                               | 6.5                   |
| 19  | 確認モードに `← 一覧` を出す                           | `UI_DESIGN.md` S-04c の差3に反する。**デザインHTMLのモックには描かれているが README が正**                   | 6.5                   |
| 20  | 新しいエラーを `lib/errors.ts` にだけ足す              | `STATUS` 表に無いコードは 500 になる。**型では捕まらない**                                                   | 7.2                   |
| 21  | ログアウトを面なしのテキストリンクにする               | 「移動」の見た目になり、**「移動 / 操作 / 絞り込み」の描き分けが壊れる**                                     | 6.2                   |
| 22  | FAB を `absolute` にする（資料の字面どおり）           | モックがスマホ枠内に描かれているための表記。**資料自身が「実装は fixed」と書いている**                       | 6.1                   |
| 23  | Route Handler の `params` を `await` しない            | `page.js` と同じく Route Handler の `params` も Promise                                                      | 5.3                   |
| 24  | `requireUserId()` を画面で使う                         | **`/login` へのリダイレクトではなくエラー画面になる**                                                        | 5.6                   |
| 25  | Route Handler のテストを jsdom で走らせる              | `Request` / `Response` が壊れ、**実装が悪いように見える**                                                    | 8章                   |
| 26  | `npm audit fix --force` を実行する                     | **`prisma@6.12.0` へダウングレードされる。** Prisma 7 は確定事項                                             | 1.3                   |
| 27  | 設計書に**クラスに見える文字列**を書く                 | Tailwind v4 が `.md` を走査して不正なCSSを生成し、`npm run dev` が起動しなくなる。**`build` では捕まらない** | recipe-view 9.2       |
| 28  | Tailwind のトークン名を打ち間違える                    | **ビルドは通り、そのCSSだけ静かに空になる**                                                                  | recipe-analysis 6.2.6 |

> **⚠️ #27 は `app/globals.css` の `@source not "../**/*.md"` で根から塞いである**（Phase 3、段階8）。**この行を消さないこと。**

## 9.1 Phase 2・3 から引き継ぐ環境側の落とし穴

**リポジトリを新しくクローンした直後は、コードが正しくても検証コマンドが落ちる**（recipe-analysis design.md 9.1）。`.env` が無い → `prisma generate` 失敗 → `generated/prisma` 欠落で `tsc` 失敗 → `.next` 未生成で型ヘルパーが解決できず `tsc` 失敗、と3段階に連鎖する。**上から順に解消する。**

**新しいルートを作った直後も `tsc` が落ちる**（recipe-view 落とし穴 #25）。`RouteContext<"/api/recipes/[id]">` は既存なので今回は増えないが、**新しいページを足したら `npx next typegen` が要る。**

## 9.2 検証手順への申し送り

**`npm run build` が通っても、開発サーバーが起動するとは限らない**（recipe-view design.md 9.2）。**CSS に関わる変更をしたら、ブラウザで1回開くまで完了にしない。**

**このフェーズは CSS の比重が高い**（カード・グリッド・FAB・ダイアログ・空状態・ヘッダー上段の復元）。段階ごとにブラウザで確認する。

---

# 10. 受け入れの確認手順

**コードを見ずに真偽が決まる形で書く**（`.kiro/README.md` 4）。

| #   | 手順                                              | 期待                                                         |
| --- | ------------------------------------------------- | ------------------------------------------------------------ |
| 1   | 未ログインで `/` を開く                           | `/login` へリダイレクトされる                                |
| 2   | レシピが1件以上あるアカウントで `/` を開く        | カードが並ぶ。件数が DB と一致する                           |
| 3   | 並び順を見る                                      | 直前に解析したレシピが先頭                                   |
| 4   | カードの日付を見る                                | 「2026年8月12日」の形式                                      |
| 5   | **JST の朝9時より前に保存したレシピの日付を見る** | **前日になっていない**（1.4 のずれ）                         |
| 6   | カードのサムネイルの外側（余白）を押す            | レシピが開く（**カード全面がタップ領域**）                   |
| 7   | ページのソースで画像URLを見る                     | `X-Amz-Signature` があり、**`X-Amz-Expires` が `3600`**      |
| 8   | 画像URLからクエリを削って開く                     | 画像が取得できない（403）                                    |
| 9   | DB の `Recipe.imageKey` を見る                    | **URLではなくキーのまま**                                    |
| 10  | タイトルが3行以上になるレシピを混ぜる             | 2行で省略され、**カードの高さが他と揃っている**              |
| 11  | レシピ0件のアカウントで `/` を開く                | 空状態が出る。「レシピなし」の見出しと説明                   |
| 12  | 空状態のボタンを押す                              | `/upload` へ移動する                                         |
| 13  | スマホ幅で下までスクロールする                    | FAB が見えている。**最後のカードの内容を隠していない**       |
| 14  | FAB を押す                                        | `/upload` へ移動する                                         |
| 15  | PC 幅（768px以上）で開く                          | **3列**になる。S-04 は単一カラムのまま                       |
| 16  | 削除の操作をする                                  | いきなり消えず、確認ダイアログが出る                         |
| 17  | ダイアログを見る                                  | **対象のレシピのタイトルが出る**                             |
| 18  | 「やめる」を押す / `Escape` を押す                | 閉じて、**レシピが残っている**                               |
| 19  | 「削除する」を押す                                | 一覧から消える                                               |
| 20  | 再読み込みする                                    | 消えたまま                                                   |
| 21  | DB を見る                                         | `Recipe` / `Ingredient` / `Step` が消えている                |
| 22  | **S3 を見る**                                     | **該当の画像が消えている**                                   |
| 23  | 最後の1件を削除する                               | 空状態に変わる                                               |
| 24  | 他ユーザーのレシピIDに `DELETE` を送る            | 404 が返り、**そのレシピが消えていない**                     |
| 25  | 未ログインで `DELETE` を送る                      | 401 が返る                                                   |
| 26  | 通常モードの S-04 を開く                          | `← 一覧` が出る。**`編集` は出ない**                         |
| 27  | `← 一覧` を押す                                   | `/` へ移動する                                               |
| 28  | 確認モード（`?confirm=1`）を開く                  | **`← 一覧` が出ない**                                        |
| 29  | **タイトルが2行のレシピで**「作り方 ↓」を押す     | 見出しが**ヘッダーに隠れず**画面上部に来る（上段が増えても） |
| 30  | 存在しないIDを開き、ボタンを押す                  | 一覧へ移動する                                               |
| 31  | ログアウトを押す                                  | `/login` に着地する                                          |
| 32  | ログアウト後に `/` を直接開く                     | `/login` へ戻される                                          |
| 33  | **`npm run dev` を起動してブラウザで開く**        | 起動する（9.2。**`build` だけでは捕まらない**）              |
| 34  | スマホ実機で開く                                  | 崩れない。タップ領域が押しやすい                             |
| 35  | **本番へデプロイし、1〜34 を通す**                | ローカルと同じ結果になる                                     |

---

# 11. リスクと対策

| リスク                                   | 影響                                | 対策                                                                          |
| ---------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------- |
| **署名付きURLが本番で発行できない**      | 一覧の画像が全部出ない              | ローカルで実測してからデプロイ。`npm run check:s3` で設定を先に切り分ける     |
| 正規化済み画像（500KB〜1MB）を10件並べる | 一覧が重い。**モバイル回線で顕著**  | 実機で測る。遅ければサムネイル生成を判断（2026-08-23 決定の保留分）           |
| `<img>` で lint が落ちる                 | コミット前の検証が止まる            | 段階の早いうちに `npm run lint` を回す（落とし穴 #16）                        |
| ヘッダー上段の復元でアンカー移動が崩れる | 見出しがヘッダーに潜る              | `--recipe-header-h` は実測値なので追従する。**フォールバック値も直す**（6.5） |
| 削除でユーザーのデータが消える           | **取り返しがつかない**              | 確認ダイアログ必須。Repository 層で `userId` スコープのテストを固定           |
| S3 の削除が黙って失敗し続ける            | 孤児の画像が溜まる                  | `console.error` に `imageKey` を残す。**握り潰さない**（5.3）                 |
| 実データが数件しか無い                   | 3列レイアウトと並び順を確認できない | 実測の段階で数件追加で解析する（Phase 3 と同じ手）                            |
