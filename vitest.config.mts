import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // tsconfig.json の `@/*` エイリアスをテストからも解決する。
    // 以前は vite-tsconfig-paths プラグインが必要だったが、Vite がネイティブ対応した。
    tsconfigPaths: true,
  },
  test: {
    // jsdom: Reactコンポーネントの描画テストにDOMが要るため
    environment: "jsdom",
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      // Prisma の生成物。テスト対象にしない
      "**/generated/**",
    ],
  },
});
