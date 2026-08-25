import Link from "next/link";

/**
 * 一覧のカード1枚（`UI_DESIGN.md` S-02 / recipe-list design.md 6.1）。
 *
 * 視覚仕様は引き継ぎ資料「レシピカード」の確定値。**推測で変えない。**
 *
 * **カード全面がタップ領域。** タイトルの文字の上だけがリンクだと、
 * 歩きながら片手で押すには的が小さすぎる（資料の同名の項目）。
 */

type Props = {
  id: string;
  title: string;
  /**
   * 署名付きURL。**発行に失敗した件は `null`**（design.md 5.2）。
   * 1件の失敗で一覧全体を落とさないため、カード側が欠けても描けるようにしてある。
   */
  imageUrl: string | null;
  /**
   * **整形済みの文字列**（「2026年8月12日」）。
   * `Date` を渡さない（design.md 落とし穴 #12）。
   */
  createdAt: string;
};

export function RecipeCard({ id, title, imageUrl, createdAt }: Props) {
  return (
    // overflow-hidden でサムネイルの角をカードの角丸に合わせる（資料「レシピカード」）
    <article className="bg-surface border-border shadow-e1 overflow-hidden rounded-md border">
      {/* カード全面がリンク。block にしないと余白部分が当たり判定から外れる */}
      <Link href={`/recipes/${id}`} className="block">
        {/*
         * ⚠️ 先に aspect-ratio と面を置く。**画像の読み込み前後でカードの高さが動かない。**
         * 画像が取れなかったときも枠が潰れず、3列に並べたときに行が崩れない（design.md 6.3）。
         */}
        <div className="bg-track aspect-[16/10] w-full">
          {imageUrl !== null && (
            /*
             * next/image を使わない（design.md 落とし穴 #15）。署名付きURLは1時間で切れるうえ、
             * 画像最適化には外部ドメインの remotePatterns 設定が要る。
             *
             * alt はレシピのタイトル。**画像が出ないときに何の写真かが読める。**
             */
            // eslint-disable-next-line @next/next/no-img-element -- 上記の理由で next/image を使わない
            <img
              src={imageUrl}
              alt={title}
              // 3列で並ぶと初期表示で全件取りに行くことになるので遅延させる
              loading="lazy"
              className="size-full object-cover"
            />
          )}
        </div>

        <div className="p-4">
          {/*
           * タイトルは2行まで（資料「レシピカード」）。**3行以上でカードの高さが揃わなくなる。**
           * line-clamp は行数で切るので、日本語でも語の途中で不自然に切れない。
           */}
          <h2 className="text-ink text-lead leading-[1.5] font-bold line-clamp-2">{title}</h2>
          <p className="text-ink-sub mt-1 text-meta">{createdAt}</p>
        </div>
      </Link>
    </article>
  );
}
