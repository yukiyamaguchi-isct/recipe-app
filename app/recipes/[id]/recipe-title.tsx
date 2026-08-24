"use client";

import { useEffect, useRef, useState } from "react";

import { INTERNAL_ERROR, type ApiResponseBody } from "@/lib/api-response";
import { normalizeTitle, titleProblem } from "@/lib/recipes/title";

/**
 * タイトルとその場での改名（requirements.md Req7 / `UI_DESIGN.md` S-04）。
 *
 * 「編集画面まで行かせない」ためのインライン編集。`PATCH /api/recipes/[id]` を呼ぶ。
 *
 * **検証の規則と文言は `lib/recipes/title.ts` を共有する。** サーバーと同じものを使うので、
 * どちらで弾かれても見えるものが変わらない
 * （`.kiro/specs/recipe-analysis/design.md` 落とし穴 #27）。
 */

type Props = {
  recipeId: string;
  /** 確定済みのタイトル。**編集中の下書きは親に持たせない** */
  title: string;
  /** 保存が成功したときだけ呼ぶ。親（ヘッダー）が高さを測り直す */
  onRenamed: (title: string) => void;
};

const NETWORK_MESSAGE = "通信に失敗しました。通信環境を確認して、もう一度お試しください。";

type SaveResponse = ApiResponseBody<{ title: string }>;

/**
 * 失敗レスポンスから画面に出す文言を取り出す。
 *
 * **JSONですら無い場合がある**（プロキシのエラーページなど）。そのときは
 * `INTERNAL_ERROR` の文言に倒す。**クライアントで独自の文言を作らない**ので、
 * サーバーが 500 を返したときと見えるものが一致する。
 */
function messageFromResponse(text: string): string {
  try {
    const body = JSON.parse(text) as SaveResponse;
    if (body.success === false && typeof body.error?.message === "string") {
      return body.error.message;
    }
  } catch {
    // JSON でなければ既定の文言に倒す
  }
  return INTERNAL_ERROR.message;
}

export function RecipeTitle({ recipeId, title, onRenamed }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 編集に入ったら入力欄へ移す。**キーボードだけで操作できるようにするため**
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function startEditing() {
    setDraft(title);
    setProblem(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setProblem(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();

    const next = normalizeTitle(draft);
    const found = titleProblem(next);

    // **サーバーと同じ規則で先に弾く。** 通信を1往復省けるだけで、
    // サーバー側の検証を省いているわけではない（あちらが最後の砦）
    if (found !== null) {
      setProblem(found);
      inputRef.current?.focus();
      return;
    }

    // 変わっていないなら送らない
    if (next === title) {
      cancel();
      return;
    }

    setSaving(true);
    setProblem(null);

    try {
      const response = await fetch(`/api/recipes/${recipeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: next }),
      });

      const text = await response.text();

      if (!response.ok) {
        setProblem(messageFromResponse(text));
        return;
      }

      onRenamed(next);
      setEditing(false);
    } catch {
      // fetch が投げるのは通信そのものの失敗（オフライン等）。
      // **原因を断定しない**（`.kiro/specs/recipe-analysis/design.md` の StorageFailedError の反省）
      setProblem(NETWORK_MESSAGE);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 pt-3 pb-2">
      {/*
       * **編集中も <h1> を残す。** 見出しが一時的に消えると文書構造が崩れる。
       * <form> は phrasing content ではないので <h1> の中には入れられない。
       * そこで h1 は残したまま視覚的に隠し、フォームを横に置く。
       */}
      <h1
        className={editing ? "sr-only" : "text-ink text-title leading-[1.4] font-bold text-pretty"}
      >
        {title}
      </h1>

      {editing ? (
        <form onSubmit={save} className="flex flex-wrap items-center gap-2">
          <label htmlFor="recipe-title-input" className="sr-only">
            レシピのタイトル
          </label>
          <input
            ref={inputRef}
            id="recipe-title-input"
            type="text"
            value={draft}
            disabled={saving}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Escape でやめる。**閉じる手段をボタンだけにしない**
              if (event.key === "Escape") {
                cancel();
              }
            }}
            aria-invalid={problem !== null}
            aria-describedby={problem === null ? undefined : "recipe-title-error"}
            className="border-border-strong text-ink min-w-0 flex-1 rounded-sm border px-3 text-title font-bold h-[var(--size-tap)]"
          />

          {/* 主要ボタン（design.md 6.1）。ラベルは体言止め・最大8文字 */}
          <button
            type="submit"
            disabled={saving}
            className="bg-primary hover:bg-primary-dark h-[var(--size-tap)] rounded-sm px-5 text-body font-bold text-white transition-colors duration-[120ms] disabled:bg-track disabled:text-muted"
          >
            {saving ? "保存中" : "保存"}
          </button>

          {/* 副次ボタン */}
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            className="border-link text-link hover:bg-primary-soft h-[var(--size-tap)] rounded-sm border-[1.5px] px-5 text-body font-medium transition-colors duration-[120ms]"
          >
            やめる
          </button>

          {problem !== null && (
            <p id="recipe-title-error" role="alert" className="text-danger-ink w-full text-body">
              {problem}
            </p>
          )}
        </form>
      ) : (
        /*
         * **`✎ 改題` は「操作」**（モードが変わる）なので、枠線1.5px・角丸8px・面は白
         * （design.md 6.2 の中核ルール）。
         *
         * ⚠️ 引き継ぎ資料は2箇所で食い違っている。中核ルールの表（README L124）は
         * `✎ 改題` を「操作」に分類しているが、中段の仕様（同 L158）は
         * `✎`（#0E6E7D 17px）と面も枠も無い書き方をしている。
         * **中核ルールを採った**（面なしにすると「移動」と混ざるため）。design.md 6.7。
         */
        <button
          type="button"
          onClick={startEditing}
          className="border-link text-link hover:bg-primary-soft mt-1 h-[var(--size-tap)] rounded-sm border-[1.5px] px-4 text-body font-medium transition-colors duration-[120ms]"
        >
          ✎ 改題
        </button>
      )}
    </div>
  );
}
