# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

料理本などのレシピ写真をアップロードすると、Claude の画像認識で材料と作り方を読み取り、材料を「野菜 / 調味料 / その他」に自動分類して表示・保存するWebアプリ。将来的にモバイルアプリ化を予定しており、Web版はその前段としての中核機能の検証を兼ねる。

## Current state

**実装前**。リポジトリには設計文書のみが存在し、コードもツールチェーンもまだない。

```
recipe-app/
├── REQUIREMENTS.md   # 要件定義（スコープ・機能要件・非機能要件・データモデル）
├── UI_DESIGN.md      # UI設計（画面一覧・遷移・各画面の設計・決定事項）
└── CLAUDE.md
```

## Read the design docs first

`REQUIREMENTS.md` と `UI_DESIGN.md` が仕様の唯一の情報源。実装や設計変更に着手する前に必ず読むこと。過去のセッションで一つずつ合意した決定が記録されており、そこから外れた実装をすると手戻りになる。

- **REQUIREMENTS.md 3章** — MVPスコープ。ここに無い機能は5章「後続フェーズ」に入っているので実装しない
- **REQUIREMENTS.md 9章** — 決定済み事項とその理由
- **UI_DESIGN.md 4章** — UI上の決定事項4点

仕様に迷いが出たら推測で埋めず、どちらの文書に書くべきかを判断して追記し、ユーザーに確認する。

## Planned stack

REQUIREMENTS.md 7章の初期案。まだ何もインストールされていないため、雛形作成時に確定させる。

- フロントエンド: React (Next.js)
- バックエンド: Node.js（Next.js API Routes、または別Express API）
- データベース: PostgreSQL（開発簡易化のためSQLiteも検討可）
- 画像解析: Anthropic Claude API（vision対応モデル）
- 画像ストレージ: AWS S3

## Non-obvious constraints

実装時に見落とすと問題になる制約。詳細は REQUIREMENTS.md の該当節を参照。

- **画像は必ずリサイズしてから送る**（4.2）。Claude APIは1画像5MBが上限で、長辺1568pxを超える分は精度に寄与しない。クライアント側（Canvas）とサーバー側（sharp）の両方で長辺1568px / JPEG品質85に正規化する
- **sharp では `.rotate()` を必ず呼ぶ**。呼ばないとEXIF回転が適用されず、スマホ写真が横倒しで保存される
- **S3に保存するのは変換後の画像のみ**。元画像は保持しない（容量とプライバシー両面の理由）
- **HEICはMVP非対応**。ChromeのCanvasでデコードできず、sharpもlibheif付きビルドが必要なため。選択されたら明示的にエラーを返す
- **解析結果は確認画面を出す前に保存する**（4.6）。確認画面で離脱した際に、APIコストと30秒を払った結果を失わないため
- **Claude APIのモデルIDや制約値は記憶で書かない**。`claude-api` skill か公式ドキュメントで確認する

## Conventions

- コミットメッセージは必ず1文。署名や帰属（`Co-Authored-By` / `Generated with…` 等）は付けない
- コミットは機能を構成する最小単位ごとに刻み、同じ機能を構成するコミット群を1 PRにまとめる
- 詳細・背景・確認手順はコミットメッセージではなくPRのdescriptionに書く
- 秘密情報（`ANTHROPIC_API_KEY`、AWS認証情報、DB接続文字列）は `.env` に置き、コードに直書きしない。`.env` は `.gitignore` 済み

## Git

リモートは `yukiyamaguchi-isct/recipe-app`（private）。環境変数 `GITHUB_TOKEN` にはリポジトリ作成・push権限がないため、`gh` や `git push` が権限エラーになる場合は `env -u GITHUB_TOKEN` を前置してkeyring側の認証情報を使う。

## Parallel sessions

ビジュアルデザイン（配色・書体・コンポーネントの形）は別セッションが `DESIGN.md` として作成中。**`DESIGN.md` は編集しない**。デザイントークンをコードへ落とし込むのは `DESIGN.md` の完成後。
