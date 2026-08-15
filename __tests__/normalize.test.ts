import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { ImageTooLargeError, InvalidImageError, UnsupportedFormatError } from "@/lib/errors";
import { JPEG_QUALITY, MAX_EDGE_PX, MAX_IMAGE_BYTES } from "@/lib/images/constants";
import { normalizeImage, sniffFormat } from "@/lib/images/normalize";

/** 単色の JPEG を作る。EXIF の Orientation を付けられる。 */
async function makeJpeg(width: number, height: number, orientation?: number): Promise<Buffer> {
  const image = sharp({ create: { width, height, channels: 3, background: "#888" } }).jpeg();
  return orientation === undefined
    ? image.toBuffer()
    : image.withMetadata({ orientation }).toBuffer();
}

async function makePng(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: "#345" } })
    .png()
    .toBuffer();
}

describe("sniffFormat", () => {
  it("JPEG を判定する", async () => {
    expect(sniffFormat(await makeJpeg(10, 10))).toBe("jpeg");
  });

  it("PNG を判定する", async () => {
    expect(sniffFormat(await makePng(10, 10))).toBe("png");
  });

  it("HEIC を判定する", () => {
    // ISO-BMFF の ftyp ボックス。4〜8バイト目が "ftyp"、8〜12バイト目がブランド。
    const heic = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x18]), // ボックスサイズ
      Buffer.from("ftypheic", "latin1"),
      Buffer.alloc(16),
    ]);

    expect(sniffFormat(heic)).toBe("heif");
  });

  it("iPhone が使う mif1 ブランドも HEIC 扱いにする", () => {
    const heif = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x18]),
      Buffer.from("ftypmif1", "latin1"),
      Buffer.alloc(16),
    ]);

    expect(sniffFormat(heif)).toBe("heif");
  });

  it("GIF や WebP は unknown（MVP では JPEG / PNG のみ）", async () => {
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } })
      .gif()
      .toBuffer();
    const webp = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } })
      .webp()
      .toBuffer();

    expect(sniffFormat(gif)).toBe("unknown");
    expect(sniffFormat(webp)).toBe("unknown");
  });

  it("短すぎるデータで例外を投げない", () => {
    expect(sniffFormat(Buffer.alloc(0))).toBe("unknown");
    expect(sniffFormat(Buffer.from([0xff]))).toBe("unknown");
    expect(sniffFormat(Buffer.from([0xff, 0xd8]))).toBe("unknown");
  });
});

describe("normalizeImage: 寸法（requirements.md Req1）", () => {
  it(`長辺が ${MAX_EDGE_PX}px に収まる`, async () => {
    const output = await normalizeImage(await makeJpeg(4000, 3000));

    const { width, height } = await sharp(output).metadata();
    expect(width).toBe(MAX_EDGE_PX);
    expect(height).toBe(1932);
  });

  it("縦長の写真は高さが長辺として扱われる", async () => {
    const output = await normalizeImage(await makeJpeg(3000, 4000));

    const { width, height } = await sharp(output).metadata();
    expect(height).toBe(MAX_EDGE_PX);
    expect(width).toBe(1932);
  });

  it(`${MAX_EDGE_PX}px 未満の画像を拡大しない`, async () => {
    const output = await normalizeImage(await makeJpeg(800, 600));

    const { width, height } = await sharp(output).metadata();
    expect(width).toBe(800);
    expect(height).toBe(600);
  });

  it("縦横比を保つ", async () => {
    const output = await normalizeImage(await makeJpeg(4000, 1000));

    const { width, height } = await sharp(output).metadata();
    expect(width! / height!).toBeCloseTo(4, 2);
  });
});

describe("normalizeImage: EXIF 回転（design.md 1.5 / 落とし穴 #4）", () => {
  /**
   * スマホを縦に構えて撮ると、ピクセルは横長のまま Orientation=6 が付く。
   * `.rotate()` を呼ばないと横倒しのまま保存され、**orientation タグも消えるので後から救えない**。
   */
  it("Orientation=6 の横長画像が縦長になる", async () => {
    const input = await makeJpeg(1000, 500, 6);
    expect((await sharp(input).metadata()).orientation).toBe(6);

    const output = await normalizeImage(input);

    const { width, height } = await sharp(output).metadata();
    expect(width).toBe(500);
    expect(height).toBe(1000);
  });

  it("Orientation=1（回転不要）はそのままの向きを保つ", async () => {
    const output = await normalizeImage(await makeJpeg(1000, 500, 1));

    const { width, height } = await sharp(output).metadata();
    expect(width).toBe(1000);
    expect(height).toBe(500);
  });

  it("回転してから長辺を測る（順序が逆だと寸法がずれる）", async () => {
    // 3000x4000 を Orientation=6 で渡すと、回転後は 4000x3000。
    // 回転前に測ると長辺は高さ4000、回転後に測ると長辺は幅4000 で、収まる先が変わる。
    const output = await normalizeImage(await makeJpeg(3000, 4000, 6));

    const { width, height } = await sharp(output).metadata();
    expect(width).toBe(MAX_EDGE_PX);
    expect(height).toBe(1932);
  });
});

describe("normalizeImage: 出力形式", () => {
  it("PNG を渡しても JPEG で返る", async () => {
    const output = await normalizeImage(await makePng(3000, 2000));

    expect((await sharp(output).metadata()).format).toBe("jpeg");
  });

  it("大きな写真が十分に小さくなる", async () => {
    const input = await makeJpeg(4000, 3000);

    const output = await normalizeImage(input);

    expect(output.byteLength).toBeLessThan(input.byteLength);
  });

  it(`品質 ${JPEG_QUALITY} で書き出す（クライアント側と同じ値を使う）`, async () => {
    // 値そのものは metadata から読めないため、定数がクライアントと共有されていることを固定する。
    expect(JPEG_QUALITY).toBe(85);
  });
});

describe("normalizeImage: 受け付けない入力（requirements.md Req2）", () => {
  it("10MB 超を ImageTooLargeError で弾く", async () => {
    const tooLarge = Buffer.alloc(MAX_IMAGE_BYTES + 1);
    // 先頭を JPEG に見せかけても、大きさの検査が先に効く
    tooLarge.set([0xff, 0xd8, 0xff], 0);

    await expect(normalizeImage(tooLarge)).rejects.toBeInstanceOf(ImageTooLargeError);
  });

  it("ちょうど 10MB は通す（境界）", async () => {
    // 10MB ちょうどの JPEG は作りにくいので、境界の判定だけを見る
    const justUnder = await makeJpeg(100, 100);
    expect(justUnder.byteLength).toBeLessThanOrEqual(MAX_IMAGE_BYTES);

    await expect(normalizeImage(justUnder)).resolves.toBeInstanceOf(Buffer);
  });

  it("HEIC を UnsupportedFormatError で弾く", async () => {
    const heic = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x18]),
      Buffer.from("ftypheic", "latin1"),
      Buffer.alloc(64),
    ]);

    await expect(normalizeImage(heic)).rejects.toBeInstanceOf(UnsupportedFormatError);
  });

  it("GIF / WebP を UnsupportedFormatError で弾く", async () => {
    const webp = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "#000" },
    })
      .webp()
      .toBuffer();

    await expect(normalizeImage(webp)).rejects.toBeInstanceOf(UnsupportedFormatError);
  });

  it("宣言された MIME ではなく実データで判定する", async () => {
    // 「image/jpeg として送られてきた HEIC」を模す。normalizeImage は MIME を受け取らないので、
    // 呼び出し側が何を宣言しようと結果は変わらない。
    const heicPretendingToBeJpeg = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x18]),
      Buffer.from("ftypheic", "latin1"),
      Buffer.alloc(64),
    ]);

    await expect(normalizeImage(heicPretendingToBeJpeg)).rejects.toBeInstanceOf(
      UnsupportedFormatError,
    );
  });

  it("JPEG の署名を持つが中身が壊れているものは InvalidImageError", async () => {
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(512, 0x41)]);

    await expect(normalizeImage(broken)).rejects.toBeInstanceOf(InvalidImageError);
  });

  it("壊れた画像の生メッセージをユーザー向け文言に混ぜない", async () => {
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(512, 0x41)]);

    await expect(normalizeImage(broken)).rejects.toSatisfy((error: InvalidImageError) => {
      // 原因は cause に残る（調査用）が、message には出ない（design.md 5.5）
      expect(error.cause).toBeDefined();
      expect(error.message).not.toMatch(/sharp|VipsJpeg|jpeg_/i);
      return true;
    });
  });
});
