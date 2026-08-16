import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Claude Design から受け取ったデザイン引き継ぎ資料。
    // 同梱の support.js はプロトタイプ用のバンドル済みスクリプトで、
    // ReactDOM.render など現行の規約に反する箇所を含む。アプリのコードではなく
    // 手も入れないため、lint の対象から外す（除外しないと `--max-warnings 0` で落ちる）。
    "Design_引き継ぎ資料/**",
  ]),
]);

export default eslintConfig;
