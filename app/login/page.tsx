import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";

// Auth.js は失敗時に /login?error=<code> へ戻す（auth.ts の pages.error）。
// 対応表の根拠と、キャンセルが Configuration で届く理由は design.md 6.1 / 1.8 を参照。
const ERROR_MESSAGES: Record<string, string> = {
  // ⚠️ Configuration は「設定不備」専用ではなく、クライアントに見せてよいエラー以外の
  // 受け皿（@auth/core の index.ts L185-186）。**Google の同意画面でのキャンセルもここに来る。**
  // 原因を断定できないため、まず再試行を促し、続く場合に管理者へ誘導する。
  Configuration:
    "ログインを完了できませんでした。キャンセルした場合は、もう一度お試しください。繰り返し表示される場合は、管理者にお問い合わせください。",

  // signIn コールバックが false を返したときのみ。現状このアプリでは使っていない
  AccessDenied: "ログインが許可されませんでした。別のアカウントでお試しください。",

  OAuthSignin: "Googleとの通信に失敗しました。通信環境を確認して、もう一度お試しください。",
  OAuthCallbackError: "ログインを完了できませんでした。もう一度お試しください。",
  Callback: "ログインを完了できませんでした。もう一度お試しください。",

  // DB へのユーザー作成に失敗。スキーマ不足があるとここに来る（design.md 1.5 / 1.6）
  OAuthCreateAccount:
    "アカウントの作成に失敗しました。時間をおいて試しても直らない場合は、管理者にお問い合わせください。",

  OAuthAccountNotLinked:
    "このメールアドレスは別の方法で登録されています。最初に使ったアカウントでログインしてください。",
  SessionRequired: "この操作にはログインが必要です。ログインしてください。",
};

const DEFAULT_ERROR_MESSAGE = "ログインできませんでした。もう一度お試しください。";

export default async function LoginPage({
  searchParams,
}: {
  // Next.js 16 では searchParams が Promise。await して読む
  searchParams: Promise<{ error?: string }>;
}) {
  // ログイン済みならホームへ送る。ログイン画面に留まる意味が無いため
  const session = await auth();
  if (session?.user?.id) {
    redirect("/");
  }

  const { error } = await searchParams;
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? DEFAULT_ERROR_MESSAGE) : null;

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <main className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">レシピ帳</h1>

        {/* 何のアプリか分からないまま Google の認証を求めない（UI_DESIGN.md S-01） */}
        <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          料理本のレシピを撮って保存できるアプリです。写真から材料と作り方を読み取り、材料を「野菜 /
          調味料 / その他」に仕分けします。
        </p>

        {errorMessage && (
          <p
            role="alert"
            className="mt-6 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          >
            {errorMessage}
          </p>
        )}

        {/* 認証は Google のみ。入力フォームは無い（新規登録という操作も無く、初回に自動作成される） */}
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="mt-8 flex h-12 w-full items-center justify-center rounded-full bg-foreground px-5 text-base font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Googleでログイン
          </button>
        </form>

        <p className="mt-4 text-xs leading-5 text-zinc-500 dark:text-zinc-500">
          初めての方も、このボタンからそのまま始められます。
        </p>
      </main>
    </div>
  );
}
