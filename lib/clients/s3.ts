import { randomUUID } from "node:crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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

// ---- Phase 4: recipe-list ----

/**
 * 表示用の署名付きURLの有効期限（**秒**）。**1時間**（2026-08-23 ユーザー決定）。
 *
 * **⚠️ 単位は秒。ミリ秒ではない。**
 * 📄 出典: `node_modules/@smithy/types/dist-types/signature.d.ts` L56-60 の
 * `RequestPresigningArguments.expiresIn` —「The number of seconds before the presigned
 * URL expires」（recipe-list design.md 1.1）。
 *
 * **無いとどうなるか**: ミリ秒のつもりで 3600000 を渡すと**約41日間有効なURL**が出る。
 * **エラーも出ず画像も普通に表示されるので気づけない。** 非公開バケットにした意味が薄れる。
 *
 * **見分け方**: 生成されたURLのクエリ `X-Amz-Expires` が `3600` であること。
 */
export const IMAGE_URL_EXPIRES_IN_SECONDS = 3600;

/**
 * 保存済みの画像を表示するための署名付きURLを発行する。
 *
 * **`Recipe.imageKey` は S3 のキーであってURLではない。** バケットは非公開なので、
 * キーからURLを組み立てても表示できない（`.kiro/specs/recipe-analysis/design.md` 5.6）。
 *
 * **⚠️ 発行したURLをDBに保存しない。** 有効期限があるので、保存した頃には切れている。
 * **表示のたびに発行する**（recipe-list design.md 1.1）。
 *
 * **署名の計算はローカルで完結し、AWS への通信は発生しない。** HMAC を計算するだけなので、
 * 一覧の全件分をまとめて発行しても往復は増えない（`REQUIREMENTS.md` 6.1 の「1秒以内」）。
 *
 * **⚠️ キーが存在するかは見ない。** 署名はローカル計算なので、**存在しないキーでも URL は
 * 作れてしまう。** 失敗するのはブラウザが取りに行った時（404）なので、画面側にも
 * 画像が出ないときの備えが要る（design.md 5.2）。
 *
 * @throws {StorageFailedError} 設定不足・署名の失敗。**バケット名を文言に含めない**
 */
export async function getRecipeImageUrl(imageKey: string): Promise<string> {
  const bucket = process.env.S3_BUCKET_NAME;
  if (!bucket) {
    throw new StorageFailedError({ cause: new Error("S3_BUCKET_NAME が設定されていない") });
  }

  try {
    // getClient() を使い回す。**ここで新しい S3Client を作らない**（接続とメモリを増やさない）
    return await getSignedUrl(
      getClient(),
      new GetObjectCommand({ Bucket: bucket, Key: imageKey }),
      {
        expiresIn: IMAGE_URL_EXPIRES_IN_SECONDS,
      },
    );
  } catch (cause) {
    // 認証情報の不足やリージョン不一致がここに来る。生メッセージを画面に出さない
    throw new StorageFailedError({ cause });
  }
}

/**
 * レシピの画像を S3 から消す。
 *
 * **⚠️ 例外を投げない。** 呼ばれる時点で DB のレシピは既に消えており（design.md 5.3 の
 * DB → S3 の順序）、**ここで失敗してもユーザーにできることは何も無い。**
 * 「失敗しました」と出して再試行させても、2回目は 404 になるだけ（落とし穴 #8）。
 *
 * **握り潰しではない。** 孤児の画像が溜まっていることに気づけるよう、
 * `imageKey` 付きでログに残す（`.kiro/steering/architecture.md`「例外を握り潰さない」）。
 */
export async function deleteRecipeImage(imageKey: string): Promise<void> {
  const bucket = process.env.S3_BUCKET_NAME;
  if (!bucket) {
    console.error("[s3] S3_BUCKET_NAME が設定されていないため画像を削除できない", { imageKey });
    return;
  }

  try {
    await getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: imageKey }));
  } catch (cause) {
    // レシピ本体は消えているので、ユーザーにとって操作は完了している。
    // **リクエストを失敗させない。** 残るのは S3 の孤児オブジェクトだけ
    console.error("[s3] 画像の削除に失敗した", { imageKey, cause });
  }
}
