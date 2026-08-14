import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library は afterEach がグローバルにある場合のみ自動でクリーンアップを登録する。
// このプロジェクトは globals を有効にしていないため、明示的に登録する。
// 登録しないとテスト間で描画結果が DOM に残り、2つ目以降のテストが
// 「Found multiple elements」で落ちる（実測）。
afterEach(cleanup);
