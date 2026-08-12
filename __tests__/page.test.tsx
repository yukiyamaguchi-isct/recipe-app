import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

// DOM側のツールチェーン（jsdom + Testing Library + React プラグイン）が
// 動くことの確認。Phase 3 以降の画面実装で本格的に使う。
//
// 対象は create-next-app の初期ページなので、文言ではなく
// 「見出しが存在する」ことだけを見る。差し替え時にこのテストが壊れないようにするため。
describe("トップページ", () => {
  it("見出しが描画される", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1 })).toBeDefined();
  });
});
