/**
 * 画像の正規化に使う値。
 *
 * **クライアント（Canvas）とサーバー（sharp）で同じ値を使う**（design.md 5.3）。
 * 片方だけ変えると、クライアントで縮めた画像をサーバーが再び別の大きさに直すことになり、
 * 「送信サイズは小さいのに保存された画像が違う」という追いにくいズレが出る。
 *
 * **このファイルは sharp を import しない。** クライアント側の正規化からも読むため、
 * ここにネイティブ依存を持ち込むとブラウザ向けバンドルに混入する。
 */

/** 1画像の上限。Claude API の制限そのもの（design.md 1.1、`build-with-claude/vision`）。 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * 長辺の上限。
 *
 * **2576px は Claude 4.7 以降の高解像度ティアの値**（design.md 1.1）。
 * **1568px は Claude 4.6 以前の標準ティアの値なので、その数字を見たら疑う。**
 */
export const MAX_EDGE_PX = 2576;

/** JPEG の品質。`REQUIREMENTS.md` 4.2。 */
export const JPEG_QUALITY = 85;

/** 受け付ける形式。**Claude API は WebP / GIF も読めるが、MVP では JPEG / PNG に絞る**（requirements.md Req2）。 */
export const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png"] as const;
