import { randomUUID } from "node:crypto";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { StorageFailedError } from "@/lib/errors";

/**
 * 変換後の画像を S3 に保存する。
 *
 * **保存するのは変換後の画像だけ。** 元画像は持たない（`REQUIREMENTS.md` 4.2）。
 * 呼ばれるのは解析が成功した後だけ（design.md 4.1 の順序）。
 */

/** ユーザーIDとして許す形。Prisma の `cuid()` は英数字のみを返す。 */
const SAFE_USER_ID = /^[A-Za-z0-9_-]+$/;

/**
 * オブジェクトキーを組み立てる。
 *
 * 形は `<userId>/<ランダム>.jpg`。**2つの性質を同時に満たす必要がある。**
 *
 * - **ユーザーごとに分かれている** — 誰の画像かがキーから分かり、IAM ポリシーで
 *   プレフィックス単位の制限をかけられる
 * - **ファイル名が推測できない** — キーを知られてもレシピIDや連番から
 *   他人の画像を当てられない。`randomUUID()` は 122bit のランダム
 *
 * `randomUUID()` は Node 組み込み。cuid ライブラリを足しても得られる性質は同じなので、
 * 依存を増やさない選択をした。
 */
export function buildImageKey(userId: string): string {
  // userId はセッション由来（`lib/auth/session.ts`）なので通常は安全だが、
  // ここが崩れると `../` でバケット内の別プレフィックスに書けてしまう。
  // 起きたらバグなので、ユーザー向けエラーではなく素の例外にする。
  if (!SAFE_USER_ID.test(userId)) {
    throw new Error("userId にキーとして使えない文字が含まれている");
  }
  return `${userId}/${randomUUID()}.jpg`;
}

/**
 * 遅延生成する。モジュール読み込み時に作ると、AWS の環境変数が無い環境で
 * ファイルを import しただけで落ちうる。
 */
let client: S3Client | undefined;

function getClient(): S3Client {
  // ✅ 実測（design.md 1.6）: 引数なしで AWS_REGION / AWS_ACCESS_KEY_ID /
  // AWS_SECRET_ACCESS_KEY を環境変数から解決する。**認証情報をコードに書かない。**
  client ??= new S3Client({});
  return client;
}

/**
 * 正規化済みのJPEGをアップロードし、オブジェクトキーを返す。
 *
 * **返すのはキーであってURLではない。** バケットは非公開の想定で、表示用のURLは
 * 参照時に署名付きで発行する（Phase 3）。詳細と未決事項は design.md 5.6。
 *
 * @throws {StorageFailedError} 設定不足・アップロード失敗。**バケット名を文言に含めない**
 */
export async function uploadRecipeImage(userId: string, jpeg: Buffer): Promise<string> {
  const bucket = process.env.S3_BUCKET_NAME;
  if (!bucket) {
    throw new StorageFailedError({ cause: new Error("S3_BUCKET_NAME が設定されていない") });
  }

  const key = buildImageKey(userId);

  try {
    await getClient().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: jpeg,
        ContentType: "image/jpeg",
        // ACL は指定しない。バケット側の設定（非公開）に従う。
        // ここで public-read を付けると、URLを知る誰でも他人のレシピ写真を見られる。
      }),
    );
  } catch (cause) {
    // 生メッセージにはバケット名やリージョンが入る。cause に隔離する（design.md 5.5）。
    throw new StorageFailedError({ cause });
  }

  return key;
}
