/**
 * DB のレシピと S3 のオブジェクトを突き合わせる。**削除の実測に使う**（段階13）。
 *
 *   npm run check:images            … 自分の全レシピを DB と S3 の両方で確認する
 *   npm run check:images -- <キー>  … キーを直接指定して S3 だけ確認する
 *
 * **削除の前後で2回走らせて、行が消えることを見る。**
 *
 * ## なぜ一覧（ListObjectsV2）を使わないか
 *
 * `SETUP.md` の IAM ポリシーは `PutObject` / `GetObject` / `DeleteObject` を
 * `arn:aws:s3:::バケット名/*` にしか許可しておらず、**`s3:ListBucket`（バケット ARN 自体に
 * 必要）が無い。** `aws s3 ls` 相当は AccessDenied になる。
 *
 * **`HeadObject` は `s3:GetObject` の権限で動く**ので、ポリシーを変えずに
 * 「このキーが存在するか」だけを問い合わせられる。**確認のために本番の権限を広げない。**
 *
 * ## ⚠️ 無いオブジェクトには 404 ではなく 403 が返る（✅ 実測 2026-09-01）
 *
 * ListBucket 権限が無い相手に対して、S3 は**存在しないオブジェクトの存在有無を漏らさない**
 * ため 403 を返す。**「権限エラーだ」と読むと削除を確認できない。**
 *
 * ポリシーは `GetObject` を `バケット名/*` に許可しているので、**存在するオブジェクトが
 * 403 になることはない**。よってこのスクリプトでは **403 = 無い** と判定している。
 *
 * `.env` は読むだけで、値は表示しない。
 */
import "dotenv/config";

import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import pg from "pg";

// ⚠️ Prisma のクライアントは `generated/prisma/client.ts`（TypeScript のまま）なので、
// 素の .mjs からは import できない。**確認用スクリプトのために型を通す仕組みを足さない。**
// 読み取り1本だけなので、アダプタが内部で使っている `pg` を直接叩く。

const bucket = process.env.S3_BUCKET_NAME;

if (!bucket) {
  console.log(
    "❌ S3_BUCKET_NAME が設定されていません。`npm run check:s3` で先に設定を確認してください。",
  );
  process.exit(1);
}

const client = new S3Client({});

/**
 * S3 にそのキーのオブジェクトがあるか。
 *
 * **404 / 403 は「無い」であってエラーではない。** 削除後はこれが期待値になる。
 */
async function existsInS3(key) {
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { exists: true, bytes: head.ContentLength };
  } catch (error) {
    const status = error.$metadata?.httpStatusCode;

    if (error.name === "NotFound" || status === 404) {
      return { exists: false, status: 404 };
    }

    // ⚠️ **無いオブジェクトに 403 が返る**（✅ 実測 2026-09-01）。
    //
    // S3 は `s3:ListBucket` 権限が無い相手には、**存在しないオブジェクトについて
    // 404 ではなく 403 を返す**（存在の有無を漏らさないため）。`SETUP.md` の IAM
    // ポリシーは ListBucket を含まないので、削除後はここに来る。
    //
    // **これを「権限エラー」と読むと、消えたことを確認できない。**
    // ポリシーは `GetObject` を `バケット名/*` に許可しているので、
    // **既存のオブジェクトが 403 になることはない** → 403 は「無い」と読んでよい。
    if (status === 403) {
      return { exists: false, status: 403 };
    }

    return { exists: null, error: `${error.name} (HTTP ${status ?? "?"})` };
  }
}

function label(result) {
  if (result.exists === true) {
    return `✅ S3にある (${result.bytes?.toLocaleString() ?? "?"} bytes)`;
  }
  if (result.exists === false) {
    return result.status === 403
      ? "❌ S3に無い（403。ListBucket 権限が無いため S3 は 404 ではなく 403 を返す）"
      : "❌ S3に無い（404）";
  }
  return `⚠️ 判定不能: ${result.error}`;
}

// --- キーを直接指定した場合。DB に触らない ---
const keyArg = process.argv[2];

if (keyArg) {
  console.log(`キー: ${keyArg}`);
  console.log(label(await existsInS3(keyArg)));
  process.exit(0);
}

// --- DB の全レシピと突き合わせる ---
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.log("❌ DATABASE_URL が設定されていません。");
  process.exit(1);
}

const db = new pg.Client({ connectionString });
await db.connect();

try {
  // 列名は camelCase なので二重引用符が要る（Prisma の既定。@@map は無い）
  const { rows: recipes } = await db.query(
    'SELECT id, title, "imageKey", "createdAt" FROM "Recipe" ORDER BY "createdAt" DESC',
  );

  if (recipes.length === 0) {
    console.log("DB にレシピがありません（空状態のはずです）。");
  } else {
    console.log(`DB のレシピ: ${recipes.length}件\n`);

    // 1件につき S3 への問い合わせは1回だけにする（結果を持ち回る）
    const missing = [];

    for (const recipe of recipes) {
      const result = await existsInS3(recipe.imageKey);

      console.log(`- ${recipe.title}`);
      console.log(`  id      : ${recipe.id}`);
      console.log(`  imageKey: ${recipe.imageKey}`);
      console.log(`  ${label(result)}`);
      console.log();

      if (result.exists === false) {
        missing.push(recipe.title);
      }
    }

    if (missing.length > 0) {
      console.log(
        `⚠️ DBに行はあるのに画像が無いレシピが ${missing.length}件: ${missing.join(", ")}`,
      );
      console.log("   一覧では画像だけが欠けたカードになります。");
    } else {
      console.log("✅ DB の全レシピに対応する画像が S3 にあります。");
    }
  }
} finally {
  await db.end();
}
