import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * jsdom には Canvas のデコードが無いので、ブラウザ側の正規化だけ差し替える。
 * **検証（`validateSelectedFile`）は本物を使う。** そこを潰すと画面の分岐が確かめられない。
 */
vi.mock("@/lib/images/normalize.client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/images/normalize.client")>();

  return {
    ...actual,
    normalizeImageInBrowser: vi.fn(async () => new Blob([new Uint8Array(64)])),
  };
});

import { PhotoPicker } from "@/app/upload/photo-picker";
import {
  messageFromResponse,
  OCR_TO_CATEGORIZING_MS,
  progressPercent,
} from "@/app/upload/use-analysis";
import { INTERNAL_ERROR } from "@/lib/api-response";
import { AnalysisFailedError } from "@/lib/errors";

/**
 * XMLHttpRequest の差し替え。
 *
 * **`fetch` ではなく XHR を使っているのは upload progress を取るため**（design.md 6.1）。
 * その進捗イベントをテストから起こせるよう、最後に作られたインスタンスを掴んでおく。
 */
class FakeXhr {
  static last: FakeXhr | null = null;

  status = 0;
  responseText = "";
  timeout = 0;
  aborted = false;

  upload: { onprogress?: (event: ProgressEvent) => void; onload?: () => void } = {};
  onload?: () => void;
  onerror?: () => void;
  ontimeout?: () => void;

  constructor() {
    FakeXhr.last = this;
  }

  open() {}
  send() {}
  abort() {
    this.aborted = true;
  }

  /** ブラウザが起こすのと同じ順序でイベントを流す */
  emitUpload(fraction: number) {
    this.upload.onprogress?.({
      lengthComputable: true,
      loaded: fraction * 100,
      total: 100,
    } as ProgressEvent);
  }

  finishUpload() {
    this.upload.onload?.();
  }

  respond(status: number, body: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.onload?.();
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeXhr.last = null;
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function jpeg(name = "recipe.jpg"): File {
  return new File([new Uint8Array(1024)], name, { type: "image/jpeg" });
}

/** 写真を選んで「読み取る」まで進める。正規化は非同期なので act で流し切る */
async function startAnalysis(container: HTMLElement) {
  const input = container.querySelectorAll<HTMLInputElement>('input[type="file"]')[1];
  fireEvent.change(input, { target: { files: [jpeg()] } });

  fireEvent.click(screen.getByRole("button", { name: "読み取る" }));

  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });

  return FakeXhr.last as FakeXhr;
}

describe("S-03 解析中の段階表示（Req5）", () => {
  it("表示が段階を追って2回以上変わる", async () => {
    const { container } = render(<PhotoPicker />);
    const xhr = await startAnalysis(container);

    // 1段階目。アップロード中だけが実データ（design.md 6.1）
    expect(screen.getByText("読み取り中")).toBeDefined();
    expect(labelOf("アップロード中")).toContain("font-bold");

    // 2段階目。送信し終えたイベントで切り替わる（実データ）
    await act(async () => xhr.finishUpload());
    expect(labelOf("文字を読み取り中")).toContain("font-bold");

    // 3段階目。**時間による推定**。実際に仕分けが始まった証拠は無い
    await act(async () => {
      await vi.advanceTimersByTimeAsync(OCR_TO_CATEGORIZING_MS);
    });
    expect(labelOf("材料を仕分け中")).toContain("font-bold");
  });

  it("アップロードの進捗が進むとバーが伸びる", async () => {
    const { container } = render(<PhotoPicker />);
    const xhr = await startAnalysis(container);

    const before = Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"));
    await act(async () => xhr.emitUpload(1));
    const after = Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"));

    expect(after).toBeGreaterThan(before);
  });

  // Req5「解析中の離脱を許さない」。画面内の遷移はここで止める。
  it("解析中は「中止」がリンクでなくなる", async () => {
    const { container } = render(<PhotoPicker />);

    expect(screen.getByRole("link", { name: "← 中止" })).toBeDefined();

    await startAnalysis(container);

    expect(screen.queryByRole("link", { name: "← 中止" })).toBeNull();
    expect(screen.getByText("← 中止")).toBeDefined();
  });

  it("解析中は「読み取る」を出さない（二重送信させない）", async () => {
    const { container } = render(<PhotoPicker />);
    await startAnalysis(container);

    expect(screen.queryByRole("button", { name: "読み取る" })).toBeNull();
  });
});

describe("S-03 解析の結果", () => {
  it("成功したら保存できたことを伝える", async () => {
    const { container } = render(<PhotoPicker />);
    const xhr = await startAnalysis(container);

    await act(async () => {
      xhr.finishUpload();
      xhr.respond(200, { success: true, data: { recipeId: "rec_1" }, error: null });
    });

    expect(screen.getByText("読み取りました")).toBeDefined();
  });

  // Req6。サーバーの文言をそのまま出す（原因と次にすることの両方が入っている）。
  it("失敗したらサーバーが返した原因と次の行動を出す", async () => {
    const { container } = render(<PhotoPicker />);
    const xhr = await startAnalysis(container);
    const failure = new AnalysisFailedError();

    await act(async () => {
      xhr.finishUpload();
      xhr.respond(422, {
        success: false,
        data: null,
        error: { code: failure.code, message: failure.message },
      });
    });

    expect(screen.getByRole("alert").textContent).toContain(failure.message);
    // 次にできることが2つとも出ている。**同じ写真で再試行**と**別の写真を選ぶ**
    expect(screen.getByRole("button", { name: "もう一度読み取る" })).toBeDefined();
    expect(screen.getByRole("button", { name: "選び直す" })).toBeDefined();
  });

  it("通信そのものが失敗したら通信環境の確認を促す", async () => {
    const { container } = render(<PhotoPicker />);
    const xhr = await startAnalysis(container);

    await act(async () => xhr.onerror?.());

    expect(screen.getByRole("alert").textContent).toContain("通信");
  });

  it("タイムアウトしたらその文言を出す", async () => {
    const { container } = render(<PhotoPicker />);
    const xhr = await startAnalysis(container);

    await act(async () => xhr.ontimeout?.());

    expect(screen.getByRole("alert").textContent).toContain("タイムアウトしました");
  });

  // 失敗しても写真は捨てない。通信の失敗やタイムアウトなら写真自体は問題ないため。
  it("「もう一度読み取る」で同じ写真をもう一度送れる", async () => {
    const { container } = render(<PhotoPicker />);
    const first = await startAnalysis(container);

    await act(async () => {
      first.finishUpload();
      first.respond(500, { success: false, data: null, error: INTERNAL_ERROR });
    });
    fireEvent.click(screen.getByRole("button", { name: "もう一度読み取る" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // 新しいリクエストが立ち、エラー表示が消えて解析中に戻る
    expect(FakeXhr.last).not.toBe(first);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("読み取り中")).toBeDefined();
  });
});

describe("messageFromResponse: 内部情報を出さない（design.md 5.5）", () => {
  it("サーバーの文言をそのまま使う", () => {
    const failure = new AnalysisFailedError();

    expect(
      messageFromResponse(
        JSON.stringify({
          success: false,
          data: null,
          error: { code: failure.code, message: failure.message },
        }),
      ),
    ).toBe(failure.message);
  });

  // プロキシのエラーページなど、JSON ですら返ってこない場合。
  it("JSON でない応答でも固定文言に落ちる", () => {
    expect(messageFromResponse("<html>502 Bad Gateway</html>")).toBe(INTERNAL_ERROR.message);
  });

  it("JSON だが形が違う応答でも固定文言に落ちる", () => {
    expect(messageFromResponse(JSON.stringify({ oops: true }))).toBe(INTERNAL_ERROR.message);
  });
});

describe("progressPercent", () => {
  it("段階が進むほど大きくなる", () => {
    const values = [
      progressPercent({ phase: "uploading", uploaded: 0 }),
      progressPercent({ phase: "uploading", uploaded: 1 }),
      progressPercent({ phase: "ocr" }),
      progressPercent({ phase: "categorizing" }),
      progressPercent({ phase: "done", recipeId: "rec_1" }),
    ];

    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(values.at(-1)).toBe(100);
  });

  it("エラーと未着手は0", () => {
    expect(progressPercent({ phase: "idle" })).toBe(0);
    expect(progressPercent({ phase: "error", message: "だめでした" })).toBe(0);
  });
});

/** 段階のラベルに当たっている class を返す。太字＝進行中（design.md 6.2.2） */
function labelOf(text: string): string {
  return screen.getByText(text).className;
}

describe("読み上げへの伝達", () => {
  /**
   * ⚠️ 3段階のラベルは未着手のぶんも含めて最初から DOM に居るので、
   * 段階が進んでも live region の文字列は変わらない（変わるのは class だけ）。
   * それだと読み上げは何も起きない。
   */
  it("進行中の段階が文字として live region に入る", async () => {
    const { container } = render(<PhotoPicker />);
    const xhr = await startAnalysis(container);

    expect(screen.getByText("現在: アップロード中")).toBeDefined();

    await act(async () => xhr.finishUpload());

    expect(screen.getByText("現在: 文字を読み取り中")).toBeDefined();
  });
});
