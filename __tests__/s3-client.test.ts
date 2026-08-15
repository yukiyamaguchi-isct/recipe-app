import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock のファクトリは巻き上げられるため、参照するモックも vi.hoisted で一緒に巻き上げる。
const { sendMock, constructorMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  constructorMock: vi.fn(),
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

import { PutObjectCommand } from "@aws-sdk/client-s3";

import { StorageFailedError } from "@/lib/errors";
import { buildImageKey, uploadRecipeImage } from "@/lib/clients/s3";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
const USER_ID = "clx1a2b3c4d5e6f7g8h9";

const originalBucket = process.env.S3_BUCKET_NAME;

beforeEach(() => {
  sendMock.mockReset();
  constructorMock.mockReset();
  sendMock.mockResolvedValue({});
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
