import { describe, expect, it } from "vitest";

import { ImageTooLargeError, InvalidImageError, UnsupportedFormatError } from "@/lib/errors";
import { JPEG_QUALITY, MAX_EDGE_PX, MAX_IMAGE_BYTES } from "@/lib/images/constants";
import {
  ClientNormalizeError,
  fitWithin,
  messageFor,
  validateSelectedFile,
} from "@/lib/images/normalize.client";

/** File を組み立てる。中身は使わないので空でよい（判定は type / name / size で行う）。 */
function file(name: string, type: string, size = 1024): File {
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type });
}

describe("validateSelectedFile: 受け付けるもの", () => {
  it("JPEG を通す", () => {
    expect(validateSelectedFile(file("recipe.jpg", "image/jpeg"))).toBeNull();
  });

  it("PNG を通す", () => {
    expect(validateSelectedFile(file("recipe.png", "image/png"))).toBeNull();
  });
});

describe("validateSelectedFile: HEIC を弾く（requirements.md Req2）", () => {
  it("image/heic を弾く", () => {
    expect(validateSelectedFile(file("IMG_0001.heic", "image/heic"))).toBe("unsupported-format");
  });

  it("image/heif を弾く", () => {
    expect(validateSelectedFile(file("IMG_0001.heif", "image/heif"))).toBe("unsupported-format");
  });

  /**
   * **`file.type` だけを見ていると取りこぼす。** iPhone から選んだ HEIC は
   * ブラウザによって type が空文字になる。そのとき「HEICだから対応できない」と
   * 案内するには拡張子を見るしかない。
   */
  it("type が空でも拡張子が .heic なら弾く", () => {
    expect(validateSelectedFile(file("IMG_0001.heic", ""))).toBe("unsupported-format");
  });

  it("拡張子が大文字でも弾く", () => {
    expect(validateSelectedFile(file("IMG_0001.HEIC", ""))).toBe("unsupported-format");
  });

  it("JPEG を名乗る HEIC も拡張子で弾く", () => {
    // 「image/jpeg として渡された .heic」。MIME だけ見ると通ってしまう
    expect(validateSelectedFile(file("IMG_0001.heic", "image/jpeg"))).toBe("unsupported-format");
  });
});

describe("validateSelectedFile: その他の不適合", () => {
  it("GIF を弾く（Claude は読めるが MVP は JPEG / PNG のみ）", () => {
    expect(validateSelectedFile(file("a.gif", "image/gif"))).toBe("unsupported-format");
  });

  it("WebP を弾く", () => {
    expect(validateSelectedFile(file("a.webp", "image/webp"))).toBe("unsupported-format");
  });

  it("PDF を弾く", () => {
    expect(validateSelectedFile(file("a.pdf", "application/pdf"))).toBe("unsupported-format");
  });

  it("10MB 超を弾く", () => {
    expect(validateSelectedFile(file("big.jpg", "image/jpeg", MAX_IMAGE_BYTES + 1))).toBe(
      "too-large",
    );
  });

  it("ちょうど 10MB は通す（境界）", () => {
    expect(validateSelectedFile(file("edge.jpg", "image/jpeg", MAX_IMAGE_BYTES))).toBeNull();
  });

  it("形式違いとサイズ超過が重なったら形式違いを先に返す", () => {
    // 「対応していない形式」のほうが次の行動（別の写真を選ぶ）に直結する
    expect(validateSelectedFile(file("big.heic", "image/heic", MAX_IMAGE_BYTES + 1))).toBe(
      "unsupported-format",
    );
  });
});

describe("fitWithin: サーバー側と同じ寸法になる（design.md 5.3）", () => {
  it(`長辺を ${MAX_EDGE_PX}px に収める（横長）`, () => {
    // sharp 側の実測値と一致すること: 4000x3000 → 2576x1932
    expect(fitWithin(4000, 3000)).toEqual({ width: MAX_EDGE_PX, height: 1932 });
  });

  it(`長辺を ${MAX_EDGE_PX}px に収める（縦長）`, () => {
    expect(fitWithin(3000, 4000)).toEqual({ width: 1932, height: MAX_EDGE_PX });
  });

  it("正方形も長辺で判定する", () => {
    expect(fitWithin(4000, 4000)).toEqual({ width: MAX_EDGE_PX, height: MAX_EDGE_PX });
  });

  it("2576px 未満は拡大しない（requirements.md Req1）", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("ちょうど 2576px はそのまま", () => {
    expect(fitWithin(MAX_EDGE_PX, 1000)).toEqual({ width: MAX_EDGE_PX, height: 1000 });
  });

  it("縦横比を保つ", () => {
    const { width, height } = fitWithin(4000, 1000);

    expect(width / height).toBeCloseTo(4, 2);
  });

  it("極端に細長い画像でも高さが 0 にならない", () => {
    const { height } = fitWithin(100000, 10);

    expect(height).toBeGreaterThanOrEqual(1);
  });
});

describe("文言はサーバー側と同一（二重管理しない）", () => {
  it("形式違いの文言が UnsupportedFormatError と一致する", () => {
    expect(messageFor("unsupported-format")).toBe(new UnsupportedFormatError().message);
  });

  it("サイズ超過の文言が ImageTooLargeError と一致する", () => {
    expect(messageFor("too-large")).toBe(new ImageTooLargeError().message);
  });

  it("読み取り失敗の文言が InvalidImageError と一致する", () => {
    expect(messageFor("decode-failed")).toBe(new InvalidImageError().message);
  });

  it("HEIC の文言が代わりの手段を示している（Req2）", () => {
    const message = messageFor("unsupported-format");

    expect(message).toContain("JPEG");
    expect(message).toContain("PNG");
  });
});

describe("ClientNormalizeError", () => {
  it("kind に対応した文言を message に持つ", () => {
    const error = new ClientNormalizeError("too-large");

    expect(error.kind).toBe("too-large");
    expect(error.message).toBe(new ImageTooLargeError().message);
  });

  it("cause を保持する（原因の調査用）", () => {
    const cause = new Error("decode blew up");

    expect(new ClientNormalizeError("decode-failed", { cause }).cause).toBe(cause);
  });

  it("Error として catch できる", () => {
    expect(new ClientNormalizeError("too-large")).toBeInstanceOf(Error);
  });
});

describe("定数をサーバー側と共有している", () => {
  it("品質は toBlob の 0〜1 に変換できる値", () => {
    expect(JPEG_QUALITY).toBe(85);
    expect(JPEG_QUALITY / 100).toBeCloseTo(0.85, 5);
  });

  it("長辺の上限は高解像度ティアの 2576px", () => {
    // 1568px は Claude 4.6 以前の標準ティアの値（design.md 1.1）
    expect(MAX_EDGE_PX).toBe(2576);
    expect(MAX_EDGE_PX).not.toBe(1568);
  });
});
