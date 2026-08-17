import { ImageTooLargeError, InvalidImageError, UnsupportedFormatError } from "@/lib/errors";
import {
  ACCEPTED_MIME_TYPES,
  JPEG_QUALITY,
  MAX_EDGE_PX,
  MAX_IMAGE_BYTES,
} from "@/lib/images/constants";

/**
 * ブラウザ側の画像正規化。
 *
 * **サーバー側（`normalize.ts`）と同じ値を使う。** 定数は `constants.ts` を共有しているので、
 * 片方だけ変わることはない（design.md 5.3）。
 *
 * ここでやる意味は2つ。
 *
 * - **送信量を減らす。** 5〜10MB の写真が1MB程度になる（requirements.md Req1）
 * - **その場でエラーを返す。** HEIC を選んだ瞬間に分かる。往復を待たせない（Req2）
 *
 * **これは最終防衛線ではない。** DevTools から迂回できるので、サーバー側で必ずやり直す。
 */

export type NormalizeFailureKind = "unsupported-format" | "too-large" | "decode-failed";

/**
 * 画面に出す文言。
 *
 * **サーバー側の `lib/errors.ts` から取る。** 同じ文言を2箇所に書くと、片方だけ直したときに
 * 「クライアントで弾かれたか、サーバーで弾かれたか」でユーザーの見えるものが変わる。
 * `lib/errors.ts` は外部依存が無いのでブラウザからも読める。
 */
export function messageFor(kind: NormalizeFailureKind): string {
  switch (kind) {
    case "unsupported-format":
      return new UnsupportedFormatError().message;
    case "too-large":
      return new ImageTooLargeError().message;
    case "decode-failed":
      return new InvalidImageError().message;
  }
}

export class ClientNormalizeError extends Error {
  readonly kind: NormalizeFailureKind;

  constructor(kind: NormalizeFailureKind, options?: { cause?: unknown }) {
    super(messageFor(kind), options);
    this.kind = kind;
    this.name = "ClientNormalizeError";
  }
}

/**
 * HEIC / HEIF の拡張子。
 *
 * **`file.type` だけでは判定できない。** iPhone から選んだ HEIC は、ブラウザによって
 * `image/heic` になることもあれば**空文字**になることもある。空文字だと
 * 「JPEG でない」ことしか分からず、「HEIC だから対応できない」と案内できない。
 */
const HEIF_EXTENSIONS = [".heic", ".heif"];

function looksLikeHeif(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    HEIF_EXTENSIONS.some((extension) => name.endsWith(extension))
  );
}

/**
 * 選ばれたファイルを送れるか判定する。**送信前に呼ぶ。**
 *
 * @returns 問題なければ `null`
 */
export function validateSelectedFile(file: File): NormalizeFailureKind | null {
  // HEIC を先に見る。Claude API 自体が非対応で、Canvas でもデコードできない（design.md 1.1）。
  // 「対応していない形式」と言えるよう、他の形式違いより先に判定する。
  if (looksLikeHeif(file)) {
    return "unsupported-format";
  }
  if (!(ACCEPTED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return "unsupported-format";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "too-large";
  }
  return null;
}

/** 長辺を {@link MAX_EDGE_PX} に収めた寸法を返す。**拡大はしない。** */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = MAX_EDGE_PX,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) {
    // 小さい画像を引き伸ばさない（requirements.md Req1）
    return { width, height };
  }
  const scale = maxEdge / longest;
  // 端数で 0 にならないよう最低1pxを保つ
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * 選ばれた画像を長辺 {@link MAX_EDGE_PX} px / JPEG品質 {@link JPEG_QUALITY} に正規化する。
 *
 * **EXIF の回転はブラウザに任せる。** `imageOrientation: "from-image"` を明示して環境差を減らす。
 * **ここが効かなくても、サーバー側が sharp の `.rotate()` で改めて適用するので最終的には正立する**
 * （design.md 1.5）。
 *
 * @throws {ClientNormalizeError} 形式違い / サイズ超過 / デコード失敗
 */
export async function normalizeImageInBrowser(file: File): Promise<Blob> {
  const failure = validateSelectedFile(file);
  if (failure) {
    throw new ClientNormalizeError(failure);
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (cause) {
    // 拡張子とMIMEは通ったが中身が壊れている場合
    throw new ClientNormalizeError("decode-failed", { cause });
  }

  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new ClientNormalizeError("decode-failed");
    }
    context.drawImage(bitmap, 0, 0, width, height);

    return await toJpegBlob(canvas);
  } finally {
    // Canvas に描いた後は不要。閉じないとメモリが残る
    bitmap.close();
  }
}

/** `toBlob` はコールバック式なので Promise に包む。**null が返りうる。** */
function toJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new ClientNormalizeError("decode-failed"));
        }
      },
      "image/jpeg",
      // toBlob の品質は 0〜1。constants.ts は 85 なので割る
      JPEG_QUALITY / 100,
    );
  });
}
