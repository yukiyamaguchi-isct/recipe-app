import sharp from "sharp";

import { ImageTooLargeError, InvalidImageError, UnsupportedFormatError } from "@/lib/errors";
import { JPEG_QUALITY, MAX_EDGE_PX, MAX_IMAGE_BYTES } from "@/lib/images/constants";

/**
 * サーバー側の画像正規化。**最終防衛線**（design.md 5.3）。
 *
 * クライアント側（`normalize.client.ts`）の検証は DevTools からいくらでも迂回できるので、
 * 同じ判定をここでやり直す。クライアントが送ってきた Content-Type も信用しない
 * （宣言されたMIMEではなく、実データの先頭バイトで形式を決める）。
 */

/** 実データの先頭バイトから判定した形式。宣言された MIME タイプとは別物。 */
export type SniffedFormat = "jpeg" | "png" | "heif" | "unknown";

/**
 * HEIF ファミリの ftyp ブランド。
 *
 * iPhone の「高効率」設定で撮った写真がこれになる。**Claude API 自体が非対応**（design.md 1.1）で、
 * sharp も libheif 付きビルドでないと読めないため、変換して救う道が無い。
 * だから「読めなかった」ではなく「対応していない形式」として弾き、撮影設定の変え方を案内する。
 */
const HEIF_BRANDS = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "hevm",
  "hevs",
  "mif1",
  "msf1",
]);

/**
 * 先頭バイトから形式を判定する。
 *
 * **宣言された MIME タイプを見ない。** `Content-Type: image/jpeg` と書いて HEIC を送るのは
 * ブラウザの開発者ツールから簡単にできる。実データだけが根拠になる。
 */
export function sniffFormat(buffer: Buffer): SniffedFormat {
  // JPEG: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return "png";
  }

  // ISO-BMFF（HEIC / AVIF など）: 4〜8バイト目が "ftyp"、8〜12バイト目がブランド
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString("latin1") === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("latin1");
    if (HEIF_BRANDS.has(brand)) {
      return "heif";
    }
  }

  return "unknown";
}

/**
 * 画像を長辺 {@link MAX_EDGE_PX} px / JPEG品質 {@link JPEG_QUALITY} に正規化する。
 *
 * 処理順は `.rotate()` → `resize` → `jpeg` の順で、**この順序に意味がある**。
 * `.rotate()` を先に呼ばないと、EXIF の回転が適用される前の寸法で長辺が決まってしまう。
 *
 * @throws {ImageTooLargeError} 10MB を超えている
 * @throws {UnsupportedFormatError} JPEG / PNG 以外（HEIC を含む）
 * @throws {InvalidImageError} 形式は合っているがデータが壊れている
 */
export async function normalizeImage(input: Buffer): Promise<Buffer> {
  // 大きさの検査を先に置く。壊れた巨大ファイルを sharp に渡す前に落とすため。
  if (input.byteLength > MAX_IMAGE_BYTES) {
    throw new ImageTooLargeError();
  }

  const format = sniffFormat(input);
  if (format !== "jpeg" && format !== "png") {
    throw new UnsupportedFormatError();
  }

  try {
    return await sharp(input)
      // ⚠️ 必須。呼ばないと EXIF 回転が適用されず、解析結果も S3 の画像も横倒しになる。
      // しかも出力から orientation タグ自体が消えるため、後から救えない（design.md 1.5）。
      .rotate()
      .resize({
        width: MAX_EDGE_PX,
        height: MAX_EDGE_PX,
        fit: "inside", // 縦横比を保ったまま、長辺が MAX_EDGE_PX に収まるようにする
        withoutEnlargement: true, // 小さい画像を引き伸ばさない（requirements.md Req1）
      })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
  } catch (cause) {
    // sharp の既定は failOn: "warning" / limitInputPixels: 268402689。
    // 型定義にも「信頼できない入力には既定の warning を使え」とあるので、緩めない。
    // 壊れたデータと展開爆弾のどちらもここに来る。生メッセージは cause に隔離する。
    throw new InvalidImageError({ cause });
  }
}
