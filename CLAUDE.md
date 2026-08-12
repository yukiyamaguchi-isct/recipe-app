# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

料理本などのレシピ写真をアップロードすると、Claude の画像認識で材料と作り方を読み取り、材料を「野菜 / 調味料 / その他」に自動分類して表示・保存するWebアプリ。将来的にモバイルアプリ化を予定しており、Web版はその前段としての中核機能の検証を兼ねる。

## Current state

**実装前**。リポジトリには設計文書のみが存在し、コードもツールチェーンもまだない。

```
recipe-app/
├── REQUIREMENTS.md            # 要件定義（スコープ・機能要件・非機能要件・データモデル）
├── UI_DESIGN.md               # UI設計（画面一覧・遷移・各画面の設計・決定事項）
├── SETUP.md                   # 開発者が手動でやる作業（外部サービス登録・キー取得）
├── .kiro/                     # Kiroフレームワーク。実装の「記憶」
│   ├── README.md              # .kiroの使い方と実装フェーズ一覧
│   ├── steering/              # 技術スタックとアーキテクチャ方針
│   └── specs/<feature>/       # 機能ごとの requirements / design / tasks
├── kiro-personal-app-guide.md      # Kiroフレームワークの参考ガイド
├── kiro-ai-prompts-template.md     # 同上（プロンプト集）
└── CLAUDE.md
```

## Read the design docs first

実装や設計変更に着手する前に必ず読むこと。過去のセッションで一つずつ合意した決定が記録されており、そこから外れた実装をすると手戻りになる。

| 文書 | 役割 |
|---|---|
| `REQUIREMENTS.md` | アプリ全体の要件。**3章**がMVPスコープ、**5章**が後続フェーズ、**9章**が決定事項と理由 |
| `UI_DESIGN.md` | アプリ全体の画面設計。**4章**がUI上の決定事項 |
| `.kiro/steering/` | 技術スタックとアーキテクチャ方針。**確定済み** |
| `.kiro/specs/<feature>/` | 機能単位の仕様。フェーズ着手時に作る |
| `SETUP.md` | 開発者が手で行う外部サービスの設定。**AIが代行できない作業のみ**を書く。実装方針は書かない |

仕様に迷いが出たら推測で埋めず、どの文書に書くべきかを判断して追記し、ユーザーに確認する。

## Stack（確定）

詳細と選定理由は `.kiro/steering/tech-stack.md`。

- Next.js 15（App Router）+ TypeScript + Tailwind CSS
- Next.js Route Handlers（別途Expressは立てない）
- Neon（PostgreSQL, Free）+ Prisma
- Auth.js（NextAuth v5）+ **Google provider**、session strategy は `jwt`
- Anthropic Claude API（vision対応モデル）
- AWS S3
- Vercel Hobby

## Non-obvious constraints

実装時に見落とすと問題になる制約。詳細は REQUIREMENTS.md の該当節を参照。

- **画像は必ずリサイズしてから送る**（4.2）。Claude APIは1画像5MBが上限で、長辺1568pxを超える分は精度に寄与しない。クライアント側（Canvas）とサーバー側（sharp）の両方で長辺1568px / JPEG品質85に正規化する
- **sharp では `.rotate()` を必ず呼ぶ**。呼ばないとEXIF回転が適用されず、スマホ写真が横倒しで保存される
- **S3に保存するのは変換後の画像のみ**。元画像は保持しない（容量とプライバシー両面の理由）
- **ローカルファイルシステムに永続データを書かない**。Vercelの関数には永続的な書き込み可能ファイルシステムがなく、ローカルでは動いても本番で壊れる
- **HEICはMVP非対応**。ChromeのCanvasでデコードできず、sharpもlibheif付きビルドが必要なため。選択されたら明示的にエラーを返す
- **解析結果は確認画面を出す前に保存する**（4.6）。確認画面で離脱した際に、APIコストと30秒を払った結果を失わないため
- **画像解析は同期処理。ジョブキューを入れない**。Vercel Hobbyの実行時間上限（Fluid compute有効時300秒）に対し30秒は十分収まる。保険として `maxDuration = 60` とSDK timeout を設定する
- **画像送信は Route Handlers を使う**。Server Actions は body size 上限がデフォルト1MBで先に効く
- **Prismaの接続URLは2本立て**。`DATABASE_URL`（Neonプール接続）と `DIRECT_URL`（直接接続、migrate用）。サーバーレス関数のコネクション枯渇を避けるため
- **Claude APIのモデルIDや制約値、各サービスの料金・制限値は記憶で書かない**。`claude-api` skill か公式ドキュメントで確認し、出典を示す

## Workflow

実装作業は Kiro フレームワークに沿って進め、各作業で以下の順序を必ず踏む。

1. 今からする作業が全体のどの部分に位置するのかを報告する
2. この作業が終わったら次に何をするのかを伝える
3. その作業の `.kiro/specs/<feature>/`（requirements / design / tasks）を作成する
4. 作業を機能ごとのフェーズに分けて提案する
5. **許可を得てから**ブランチを作成する
6. 段階が終わるごとに報告する
7. **許可を得てから**コミットする
8. 次の段階の実装に進む
9. 完了したらバグ検証を行い、**報告してから** push する

**ブランチ作成・コミット・push の3点は、明示的な許可なしに実行しない。**

## Conventions

- コミットメッセージは必ず1文。署名や帰属（`Co-Authored-By` / `Generated with…` 等）は付けない
- コミットは機能を構成する最小単位ごとに刻み、同じ機能を構成するコミット群を1 PRにまとめる
- 詳細・背景・確認手順はコミットメッセージではなくPRのdescriptionに書く
- 秘密情報（`ANTHROPIC_API_KEY`、AWS認証情報、DB接続文字列）は `.env` に置き、コードに直書きしない。`.env` は `.gitignore` 済み

## Git

リモートは `yukiyamaguchi-isct/recipe-app`（private）。環境変数 `GITHUB_TOKEN` にはリポジトリ作成・push権限がないため、`gh` や `git push` が権限エラーになる場合は `env -u GITHUB_TOKEN` を前置してkeyring側の認証情報を使う。

## Parallel sessions

ビジュアルデザイン（配色・書体・コンポーネントの形）は別セッションが `DESIGN.md` として作成中。**`DESIGN.md` は編集しない**。デザイントークンをコードへ落とし込むのは `DESIGN.md` の完成後。
