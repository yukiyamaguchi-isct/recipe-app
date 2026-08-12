# 手動セットアップ手順

**あなた（開発者）が手を動かす必要がある作業**をまとめたファイル。外部サービスのアカウント作成、キーの取得、設定画面での操作など、AIが代行できないものだけを載せる。

実装方針や仕様の検討事項はここに書かない（それらは `REQUIREMENTS.md` / `.kiro/` を参照）。

> ## ⚠️ このファイルに取得した値を書かないこと
>
> **`SETUP.md` は git 管理対象**。ここにパスワードやAPIキーを貼ると、コミットした瞬間に履歴へ残り、後から消すのが非常に面倒になる。
>
> 取得した値は**必ず `.env` に入れる**。`.env` は `.gitignore` 済みなのでコミットされない。
> このファイルに書くのは「どこで何を取得するか」の手順だけ。

---

## Phase 0: foundation — Neon（PostgreSQL）

Next.js 雛形を作った後、DB に繋ぐために必要。

- [ ] **Neon にサインアップする** — https://neon.tech
- [ ] **プロジェクトを作成する**
  - リージョンは日本から近いところ（例: Asia Pacific / Singapore）を選ぶと速い
- [ ] **接続文字列を2種類コピーする**
  - **Pooled connection**（プール接続）→ `.env` の `DATABASE_URL` に入れる
  - **Direct connection**（直接接続）→ `.env` の `DIRECT_URL` に入れる
  - Neon のダッシュボードに両方が表示される。切り替えのトグルやチェックボックスがあるので、**2回コピーする**
- [ ] `.env` に貼り付ける

```
DATABASE_URL="postgresql://...?sslmode=require"   # Pooled
DIRECT_URL="postgresql://...?sslmode=require"     # Direct
```

> **なぜ2種類必要か**: アプリは Vercel のサーバーレス関数から動くため、コネクションが枯渇しやすい。それを防ぐのが Pooled 接続。一方 Prisma のマイグレーションは Pooled 接続では動かないので、Direct 接続を別に渡す。

---

## Phase 1: user-auth — Google OAuth

Google アカウントでログインできるようにするために必要。

### Google Cloud Console でのOAuthクライアント作成

- [ ] **Google Cloud Console にアクセスする** — https://console.cloud.google.com
- [ ] **プロジェクトを作成する**（既存のものがあれば流用可）
- [ ] **OAuth 同意画面を設定する**
  - User Type は「外部」を選ぶ
  - アプリ名、サポートメール、デベロッパーの連絡先を入力する
  - 自分だけで使う間は「テスト」状態のままでよい。その場合は**テストユーザーに自分の Google アカウントを追加する**（追加しないとログインできない）
- [ ] **認証情報 → OAuth クライアント ID を作成する**
  - アプリケーションの種類: **ウェブアプリケーション**
  - **承認済みのリダイレクト URI** に以下を追加する

```
http://localhost:3000/api/auth/callback/google
```

- 本番用の URI は Vercel にデプロイしてドメインが決まってから追加する（後から追加できる）
- [ ] **クライアント ID とクライアントシークレットをコピーする**

### AUTH_SECRET の生成

セッション（JWT）の署名に使う鍵。自分で生成する。

- [ ] 以下を実行して出た文字列をコピーする

```bash
npx auth secret
```

うまくいかない場合は代わりにこちら:

```bash
openssl rand -base64 32
```

### .env に追加

```
AUTH_SECRET="生成した文字列"
AUTH_GOOGLE_ID="...apps.googleusercontent.com"
AUTH_GOOGLE_SECRET="..."
```

---

## Phase 2: recipe-analysis — Anthropic API と AWS S3

画像の解析と保存に必要。**ここから従量課金が発生する。**

### Anthropic API キー

- [ ] **Anthropic Console にアクセスする** — https://console.anthropic.com
- [ ] **支払い方法を登録する**（API は Claude Pro / Max のサブスクリプションとは別課金）
- [ ] **API キーを作成する**
- [ ] `.env` に追加する

```
ANTHROPIC_API_KEY="sk-ant-..."
```

> 想定コストは「レシピ1枚あたり2〜5円、月100回で200〜500円程度」（`REQUIREMENTS.md` 6.1）。
> **使いすぎが心配なら、Console で使用量上限（spend limit）を設定しておく。**

### AWS S3 バケット

- [ ] **AWS アカウントを作成する**（既存があれば流用可） — https://aws.amazon.com
- [ ] **S3 バケットを作成する**
  - バケット名は世界で一意にする必要がある（例: `recipe-app-images-yukiyamaguchi`）
  - リージョンは日本（`ap-northeast-1`）を選ぶ
  - **パブリックアクセスのブロックは既定（ブロックしたまま）でよい**。サーバー側から IAM 認証でアクセスするため
- [ ] **IAM ユーザーを作成する**（アプリ専用。ルートアカウントのキーは絶対に使わない）
  - アクセスキー（プログラムによるアクセス）を発行する
  - 以下の権限だけを与える（作成したバケットに限定する）

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::バケット名/*"
    }
  ]
}
```

- [ ] **アクセスキー ID とシークレットアクセスキーをコピーする**（シークレットは作成時の1回しか表示されない）
- [ ] `.env` に追加する

```
AWS_ACCESS_KEY_ID="AKIA..."
AWS_SECRET_ACCESS_KEY="..."
AWS_REGION="ap-northeast-1"
S3_BUCKET_NAME="バケット名"
```

---

## デプロイ時: Vercel

ローカルで動くようになってから行う。

- [ ] **Vercel にサインアップする**（GitHub アカウントで連携すると楽） — https://vercel.com
- [ ] **GitHub リポジトリ `yukiyamaguchi-isct/recipe-app` をインポートする**
- [ ] **プランが Hobby であることを確認する**
  - Hobby は**非商用・個人利用限定**。広告・決済・アフィリエイト・寄付募集を入れると規約違反になる
- [ ] **環境変数をすべて登録する**
  - `.env` に入れた変数を Vercel の Environment Variables にも同じ内容で設定する
  - `.env` はリポジトリに含まれないので、**Vercel 側は手動で入れる必要がある**
- [ ] **デプロイ後、本番ドメインを確認する**
- [ ] **Google Cloud Console に本番用のリダイレクト URI を追加する**

```
https://（Vercelのドメイン）/api/auth/callback/google
```

- [ ] **Fluid compute が有効になっていることを確認する**（新規プロジェクトは既定で有効）
  - 無効だと関数の実行時間上限が短くなり、画像解析が途中で切れる

---

## 困ったときに見る場所

各サービスのコンソールは UI が変わることがある。上の手順どおりの画面が出ない場合は、公式ドキュメントを確認する。

| サービス      | ドキュメント                                            |
| ------------- | ------------------------------------------------------- |
| Neon          | https://neon.com/docs                                   |
| Auth.js       | https://authjs.dev                                      |
| Google OAuth  | https://developers.google.com/identity/protocols/oauth2 |
| Anthropic API | https://platform.claude.com/docs                        |
| AWS S3        | https://docs.aws.amazon.com/s3/                         |
| Vercel        | https://vercel.com/docs                                 |

**料金や制限値はサービス側で改定されるため、このファイルには金額・上限値を書かない。** 必要なときは公式ドキュメントで確認する。

---

## 注意

- **`.env` を絶対にコミットしない。** `.gitignore` に入っているが、`git add -f` などで強制追加しないこと
- **キーが漏れたと思ったら、すぐ発行元で無効化して再発行する。** 特に AWS のキーは悪用されると高額請求につながる
- **AWS には請求アラートを設定しておく。** 想定外の課金に早く気づける
