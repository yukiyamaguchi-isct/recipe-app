/**
 * レシピのタイトルの検証（requirements.md Req7）。
 *
 * **サーバーとクライアントの両方から使う。**
 * 段階9 の `PATCH /api/recipes/[id]` と、段階10 のヘッダーのインライン改名。
 *
 * **文言をクライアントとサーバーに二重に書かない。** 片方だけ直すと、
 * どちらで弾かれたかで見えるものが変わる
 * （`.kiro/specs/recipe-analysis/design.md` 落とし穴 #27 で実際に踏んだ）。
 *
 * **このファイルはサーバー専用の依存を持たない。** クライアントコンポーネントから
 * import するので、Prisma や sharp に触れるものを足さないこと（落とし穴 #27）。
 */

/**
 * タイトルの上限。
 *
 * **⚠️ 根拠のある数値ではない。** DB は Postgres の `text` で無制限、Claude 側にも
 * 制約は無い。ヘッダーで2行に収まる範囲の目安として置いた（design.md 5.6）。
 * **段階13 で実データのタイトル長を見て決め直してよい。**
 */
export const MAX_TITLE_LENGTH = 100;

export const EMPTY_TITLE_MESSAGE = "タイトルを入力してください。";
export const TOO_LONG_TITLE_MESSAGE = `タイトルは${MAX_TITLE_LENGTH}文字以内で入力してください。`;

/**
 * 保存する形に整える。**前後の空白を落とすだけ。**
 *
 * 中の空白は触らない（「肉じゃが（母の味）」のような表記をこちらで詰めない）。
 */
export function normalizeTitle(raw: string): string {
  return raw.trim();
}

/**
 * 整えた後のタイトルに問題があればその文言を、無ければ `null` を返す。
 *
 * **例外を投げない。** クライアントは入力中の案内に使い、サーバーは
 * `ValidationError` に載せる。**投げる形にすると、入力のたびに例外を作ることになる。**
 */
export function titleProblem(title: string): string | null {
  if (title.length === 0) {
    return EMPTY_TITLE_MESSAGE;
  }

  // **`length` ではなくコードポイントで数える。** `"🍳".length` は 2（サロゲートペア）で、
  // `length` で弾くと絵文字入りのタイトルが半分の長さで引っかかる。
  //
  // ⚠️ **書記素単位ではない。** `"👩‍🍳"` は 👩 + ZWJ + 🍳 の3コードポイントなので、
  // 見た目1文字が3と数えられる。`Intl.Segmenter` を使えば正確になるが、
  // レシピ名に結合絵文字が並ぶ場面は想定しにくいので入れていない。**割り切り。**
  if ([...title].length > MAX_TITLE_LENGTH) {
    return TOO_LONG_TITLE_MESSAGE;
  }

  return null;
}
