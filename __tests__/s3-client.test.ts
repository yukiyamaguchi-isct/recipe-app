import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock のファクトリは巻き上げられるため、参照するモックも vi.hoisted で一緒に巻き上げる。
const { sendMock, constructorMock, getSignedUrlMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  constructorMock: vi.fn(),
  getSignedUrlMock: vi.fn(),
}));

// S3Client だけ差し替える。PutObjectCommand は実物を使い、
// 実際に組み立てられる入力（command.input）を検証する。
vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-s3")>();
  class MockS3Client {
    send = sendMock;
    constructor(config: unknown) {
      constructorMock(config);
    }
  }
  return { ...actual, S3Client: MockS3Client };
});

// 署名の計算そのものは AWS SDK の責務。ここで固定したいのは
// **こちらが何を渡しているか**（とりわけ expiresIn の単位）なので、関数ごと差し替える。
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: getSignedUrlMock }));

import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import { StorageFailedError } from "@/lib/errors";
import {
  buildImageKey,
  getRecipeImageUrl,
  IMAGE_URL_EXPIRES_IN_SECONDS,
  uploadRecipeImage,
} from "@/lib/clients/s3";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
const USER_ID = "clx1a2b3c4d5e6f7g8h9";

const originalBucket = process.env.S3_BUCKET_NAME;

beforeEach(() => {
  sendMock.mockReset();
  constructorMock.mockReset();
  getSignedUrlMock.mockReset();
  sendMock.mockResolvedValue({});
  getSignedUrlMock.mockResolvedValue(
    "https://test-bucket.s3.amazonaws.com/key.jpg?X-Amz-Signature=x",
  );
  process.env.S3_BUCKET_NAME = "test-bucket";
});

afterEach(() => {
  if (originalBucket === undefined) {
    delete process.env.S3_BUCKET_NAME;
  } else {
    process.env.S3_BUCKET_NAME = originalBucket;
  }
});

describe("buildImageKey", () => {
  it("<userId>/<ランダム>.jpg の形になる", () => {
    const key = buildImageKey(USER_ID);

    expect(key).toMatch(
      /^clx1a2b3c4d5e6f7g8h9\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/,
    );
  });

  it("ユーザーごとにプレフィックスが分かれる", () => {
    expect(buildImageKey("userA").startsWith("userA/")).toBe(true);
    expect(buildImageKey("userB").startsWith("userB/")).toBe(true);
  });

  it("同じユーザーでも毎回違うキーになる（上書きしない）", () => {
    const keys = new Set(Array.from({ length: 50 }, () => buildImageKey(USER_ID)));

    expect(keys.size).toBe(50);
  });

  it("ファイル名が連番やレシピIDから推測できない", () => {
    const [, filename] = buildImageKey(USER_ID).split("/");

    // UUID v4 は 122bit のランダム。連番でもタイムスタンプでもない
    expect(filename).not.toMatch(/^\d+\./);
    expect(filename).not.toContain(USER_ID);
  });

  it.each(["../other-user", "a/b", "user id", "user..id", ""])(
    "キーに使えない userId (%j) を弾く",
    (bad) => {
      expect(() => buildImageKey(bad)).toThrow();
    },
  );

  it("パストラバーサルで他ユーザーのプレフィックスに書けない", () => {
    expect(() => buildImageKey("../victim")).toThrow();
  });
});

describe("uploadRecipeImage", () => {
  it("PutObjectCommand で Bucket / Key / Body / ContentType を送る", async () => {
    const key = await uploadRecipeImage(USER_ID, JPEG);

    const command = sendMock.mock.calls[0][0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toEqual({
      Bucket: "test-bucket",
      Key: key,
      Body: JPEG,
      ContentType: "image/jpeg",
    });
  });

  it("アップロードしたキーを返す（URLではない）", async () => {
    const key = await uploadRecipeImage(USER_ID, JPEG);

    expect(key).toMatch(/^clx1a2b3c4d5e6f7g8h9\/.+\.jpg$/);
    expect(key).not.toMatch(/^https?:/);
  });

  it("ACL を指定しない（バケット側の非公開設定に従う）", async () => {
    await uploadRecipeImage(USER_ID, JPEG);

    expect(sendMock.mock.calls[0][0].input).not.toHaveProperty("ACL");
  });

  // クライアントはモジュール内にキャッシュされ、初回呼び出し時に1度だけ作られる。
  // 他のテストで既に作られているため、生成そのものを見るテストはモジュールを作り直す。
  it("認証情報を明示的に渡さない（環境変数から解決させる）", async () => {
    vi.resetModules();
    const { uploadRecipeImage: fresh } = await import("@/lib/clients/s3");

    await fresh(USER_ID, JPEG);

    expect(constructorMock).toHaveBeenCalledWith({});
  });

  it("クライアントを使い回す（リクエストごとに作らない）", async () => {
    vi.resetModules();
    const { uploadRecipeImage: fresh } = await import("@/lib/clients/s3");

    await fresh(USER_ID, JPEG);
    await fresh(USER_ID, JPEG);

    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(constructorMock).toHaveBeenCalledTimes(1);
  });
});

describe("失敗時（design.md 5.5 / 7章）", () => {
  it("アップロードに失敗したら StorageFailedError", async () => {
    sendMock.mockRejectedValue(new Error("Access Denied"));

    await expect(uploadRecipeImage(USER_ID, JPEG)).rejects.toBeInstanceOf(StorageFailedError);
  });

  it("S3_BUCKET_NAME が未設定なら StorageFailedError（送信を試みない）", async () => {
    delete process.env.S3_BUCKET_NAME;

    await expect(uploadRecipeImage(USER_ID, JPEG)).rejects.toBeInstanceOf(StorageFailedError);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("バケット名やAWSの生メッセージをユーザー向け文言に含めない", async () => {
    sendMock.mockRejectedValue(
      new Error("Access Denied: arn:aws:s3:::recipe-app-prod-images/clx1/abc.jpg"),
    );

    await expect(uploadRecipeImage(USER_ID, JPEG)).rejects.toSatisfy(
      (error: StorageFailedError) => {
        expect(error.message).not.toContain("recipe-app-prod-images");
        expect(error.message).not.toContain("test-bucket");
        expect(error.message).not.toContain("Access Denied");
        expect(error.message).not.toContain("arn:aws");
        // 原因は cause に残る（調査用）
        expect(error.cause).toBeInstanceOf(Error);
        return true;
      },
    );
  });

  it("例外を握り潰さない（失敗が成功として返らない）", async () => {
    sendMock.mockRejectedValue(new Error("network"));

    await expect(uploadRecipeImage(USER_ID, JPEG)).rejects.toThrow();
  });
});

describe("getRecipeImageUrl（Phase 4。recipe-list design.md 1.1 / 5.2）", () => {
  const IMAGE_KEY = "clx1a2b3c4d5e6f7g8h9/01abc5ef-06e6-40e0-bbe5-a1bedde6b3fa.jpg";

  it("GetObjectCommand で Bucket / Key を渡す", async () => {
    await getRecipeImageUrl(IMAGE_KEY);

    const [, command] = getSignedUrlMock.mock.calls[0];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toEqual({ Bucket: "test-bucket", Key: IMAGE_KEY });
  });

  /**
   * ⚠️ このフェーズで最も踏みやすい間違い（落とし穴 #1）。
   *
   * expiresIn の単位は**秒**（📄 @smithy/types の RequestPresigningArguments）。
   * ミリ秒のつもりで 3600000 を渡すと**約41日有効なURL**になるが、
   * **エラーも出ず画像も普通に表示されるので、実機で確認しても気づけない。**
   */
  it("有効期限に 3600 秒（1時間）を渡す。ミリ秒ではない", async () => {
    await getRecipeImageUrl(IMAGE_KEY);

    const [, , options] = getSignedUrlMock.mock.calls[0];
    expect(options).toEqual({ expiresIn: 3600 });
  });

  it("有効期限の定数が秒の桁のままである（ミリ秒に書き換えられていない）", () => {
    expect(IMAGE_URL_EXPIRES_IN_SECONDS).toBe(3600);
    // 3600000 を入れると通らない。単位の取り違えをここで止める
    expect(IMAGE_URL_EXPIRES_IN_SECONDS).toBeLessThan(86400);
  });

  it("発行したURLをそのまま返す", async () => {
    getSignedUrlMock.mockResolvedValue("https://example.com/signed");

    await expect(getRecipeImageUrl(IMAGE_KEY)).resolves.toBe("https://example.com/signed");
  });

  it("アップロードと同じクライアントを使い回す（新しく作らない）", async () => {
    vi.resetModules();
    const { getRecipeImageUrl: fresh, uploadRecipeImage: freshUpload } =
      await import("@/lib/clients/s3");

    await freshUpload(USER_ID, JPEG);
    await fresh(IMAGE_KEY);

    expect(constructorMock).toHaveBeenCalledTimes(1);
  });

  it("署名の計算で S3 へ送信しない（AWS への通信が発生しない）", async () => {
    await getRecipeImageUrl(IMAGE_KEY);

    expect(sendMock).not.toHaveBeenCalled();
  });

  it("S3_BUCKET_NAME が未設定なら StorageFailedError（署名を試みない）", async () => {
    delete process.env.S3_BUCKET_NAME;

    await expect(getRecipeImageUrl(IMAGE_KEY)).rejects.toBeInstanceOf(StorageFailedError);
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });

  it("署名に失敗したら StorageFailedError。バケット名や生メッセージを漏らさない", async () => {
    getSignedUrlMock.mockRejectedValue(
      new Error("Credential is missing for bucket recipe-app-prod-images"),
    );

    await expect(getRecipeImageUrl(IMAGE_KEY)).rejects.toSatisfy((error: StorageFailedError) => {
      expect(error.message).not.toContain("recipe-app-prod-images");
      expect(error.message).not.toContain("test-bucket");
      expect(error.message).not.toContain("Credential");
      // 原因は cause に残る（調査用）
      expect(error.cause).toBeInstanceOf(Error);
      return true;
    });
  });

  it("例外を握り潰さない（失敗が成功として返らない）", async () => {
    getSignedUrlMock.mockRejectedValue(new Error("network"));

    await expect(getRecipeImageUrl(IMAGE_KEY)).rejects.toThrow();
  });
});
