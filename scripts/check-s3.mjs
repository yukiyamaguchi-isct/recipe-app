/**
 * S3 への接続確認。**アプリを通さずに認証情報とバケット設定だけを試す。**
 *
 *   npm run check:s3
 *
 * 解析は12〜19秒かかるので、S3 の設定を直すたびにアプリを通していると時間を溶かす。
 * ここだけを1秒で試せるようにしてある（design.md 9.5 で実際に踏んだ）。
 *
 * **`.env` は読むだけで、値は表示しない。** シークレットは伏せる。
 */
import "dotenv/config";

import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const KEY = "connection-test.txt";

/** 症状から原因に辿り着けるようにする。**エラー名だけでは何を直すか分からない。** */
const CAUSES = {
  PermanentRedirect:
    "AWS_REGION がバケットの実際のリージョンと違います。S3 コンソールの「AWS リージョン」列と合わせてください。",
  SignatureDoesNotMatch:
    "AWS_SECRET_ACCESS_KEY が AWS_ACCESS_KEY_ID と対になっていません。ID とシークレットを同じ画面から一緒にコピーし直してください。",
  InvalidAccessKeyId:
    "AWS_ACCESS_KEY_ID が存在しないか、削除済みです。IAM でキーを作り直してください。",
  InvalidClientTokenId: "アクセスキーが非アクティブです。IAM で「アクティブ化」してください。",
  AccessDenied:
    'IAM の権限が足りません。ポリシーの Resource が "arn:aws:s3:::バケット名/*" になっているか確認してください（末尾の /* が要ります）。',
  NoSuchBucket: "S3_BUCKET_NAME が存在しません。綴りを確認してください。",
};

const region = process.env.AWS_REGION;
const bucket = process.env.S3_BUCKET_NAME;
const keyId = process.env.AWS_ACCESS_KEY_ID;
const secret = process.env.AWS_SECRET_ACCESS_KEY;

console.log("AWS_REGION           :", region ?? "(未設定)");
console.log("S3_BUCKET_NAME       :", bucket ?? "(未設定)");
console.log("AWS_ACCESS_KEY_ID    :", keyId ?? "(未設定)");
// シークレットは出さない。長さだけ見れば貼り間違い（切れている等）は分かる
console.log("AWS_SECRET_ACCESS_KEY:", secret ? `(設定済み ${secret.length}文字)` : "(未設定)");
console.log();

const missing = [
  ["AWS_REGION", region],
  ["S3_BUCKET_NAME", bucket],
  ["AWS_ACCESS_KEY_ID", keyId],
  ["AWS_SECRET_ACCESS_KEY", secret],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length > 0) {
  console.log("❌ .env に足りない値があります:", missing.join(", "));
  console.log("   .env.example を参照してください。");
  process.exit(1);
}

const client = new S3Client({});

try {
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: KEY, Body: "ok", ContentType: "text/plain" }),
  );
  console.log("✅ アップロードに成功しました");
} catch (error) {
  console.log("❌", error.name);
  console.log("  ", CAUSES[error.name] ?? error.message);
  process.exit(1);
}

// 置きっぱなしにしない。DeleteObject の権限確認も兼ねる
try {
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: KEY }));
  console.log("✅ テスト用オブジェクトを削除しました");
} catch (error) {
  console.log("⚠️  アップロードはできましたが削除に失敗しました:", error.name);
  console.log(`   ${KEY} が残っています。コンソールから消してください。`);
  console.log(
    "   IAM ポリシーに s3:DeleteObject が無い可能性があります（Phase 4 の削除機能で要ります）。",
  );
}
