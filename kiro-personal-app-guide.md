# 個人アプリ開発向け Kiro フレームワーク導入ガイド

このガイドでは、エンタープライズレベルのKiroシステムを個人アプリ開発向けにシンプル化し、AIアシスタントに効果的に指示する方法を説明します。

---

## 📁 フォルダ構成

### シンプル版（個人開発向け）
```
my-app/
├── .kiro/
│   ├── steering/              # プロジェクト全体の設計方針
│   │   ├── tech-stack.md      # 使用技術スタック
│   │   ├── architecture.md    # アーキテクチャ基本方針
│   │   └── api-standards.md   # API設計ルール（あれば）
│   │
│   └── specs/                 # 機能ごとの仕様
│       ├── user-auth/
│       │   ├── requirements.md
│       │   ├── design.md
│       │   └── tasks.md
│       ├── dashboard-ui/
│       │   ├── requirements.md
│       │   ├── design.md
│       │   └── tasks.md
│       └── ...
│
├── backend/
├── frontend/
└── README.md
```

### エンタープライズ版（参考用）の追加要素
```
# steering/ に追加
├── database.md                # DB設計ポリシー
├── event-sourcing.md          # イベント駆動ポリシー
├── authorization.md           # 認可設計
└── testing.md                 # テスト方針

# specs/<feature>/ に追加
├── research.md                # 技術調査結果
├── spec.json                  # メタデータ
└── verification/              # テスト・検証記録
```

---

## 📄 各ファイルの目的と例

### 1. steering/ フォルダ（プロジェクト全体の骨組み）

**役割**: 「このプロジェクトはどのような原則で開発するのか」を定義する

#### tech-stack.md の例
```markdown
# Technology Stack

## Backend
- Runtime: Node.js 20
- Framework: Express.js v4
- Database: PostgreSQL
- ORM: Prisma
- Auth: JWT + bcrypt

## Frontend
- Framework: React 18 + TypeScript
- UI: Tailwind CSS + shadcn/ui
- Data fetching: React Query
- State: Zustand

## Development
- Build: Vite
- Test: Vitest + React Testing Library
- Linting: ESLint + Prettier
```

#### architecture.md の例
```markdown
# Architecture Principles

## Backend Layering
```
Router → Controller → Service → Repository → Database
```

## API Response Format
- すべてのレスポンスは下記の構造を使う
  ```json
  {
    "success": true,
    "data": { ... },
    "error": null
  }
  ```

## Error Handling
- 各層で定義したエラーは Service で統一化
- Controller で HTTP ステータスに変換

## Database
- マイグレーション: `npx prisma migrate`
- Schema is the source of truth（schema.prisma が真実の情報源）
```

---

### 2. specs/<feature>/ フォルダ（機能ごとの仕様）

**役割**: 個別機能の「何が必要か」「どう実装するか」「何をやるか」を段階的に定義

#### 例: `specs/user-auth/requirements.md`
```markdown
# ユーザー認証機能の要件定義

## 背景
ユーザーがメールアドレスとパスワードでアカウントを作成し、ログインできる必要がある

## 要件

### Req1: ユーザー登録
- ユーザーはメールアドレスとパスワードを入力して登録できる
- パスワードは6文字以上である必要がある
- メールアドレスはユニークである必要がある

### Req2: ログイン
- ユーザーは登録済みのメールアドレスとパスワードでログインできる
- ログイン成功時は JWT トークンを返す
- 不正な認証情報の場合は 401 Unauthorized を返す

### Req3: JWT 検証
- API各エンドポイント呼び出し時に JWT を検証する
- 無効なトークンは 401 Unauthorized を返す
```

#### 例: `specs/user-auth/design.md`
```markdown
# ユーザー認証機能の設計書

## Architecture

### データベーススキーマ
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Backend API

#### POST /auth/register
- リクエスト: `{ email, password }`
- レスポンス: `{ success: true, data: { id, email, token } }`

#### POST /auth/login
- リクエスト: `{ email, password }`
- レスポンス: `{ success: true, data: { token } }`

### 実装の流れ
1. `AuthController` が req.body を検証
2. `AuthService` がビジネスロジックを処理
   - パスワードをハッシュ化（bcrypt）
   - JWT トークンを生成
3. `UserRepository` が DB に保存
4. エラーは Service で定義、Controller で HTTP ステータスに変換

### Security
- パスワードは bcrypt でハッシュ化、平文は保存しない
- JWT の有効期限は 24 時間
- 環境変数で JWT_SECRET を管理
```

#### 例: `specs/user-auth/tasks.md`
```markdown
# ユーザー認証機能の実装タスク

## Task 1: DB スキーマ作成
- [ ] Prisma schema に `users` テーブルを定義
- [ ] マイグレーション実行: `npx prisma migrate`
- [ ] Prisma Client 型生成: `npx prisma generate`

## Task 2: AuthService 実装
- [ ] パスワードハッシュ化ロジック（bcrypt）
- [ ] JWT 生成・検証ロジック
- [ ] エラー型定義（AuthError, ValidationError）
- [ ] ユニットテスト

## Task 3: UserRepository 実装
- [ ] `createUser(email, passwordHash)`: ユーザー作成
- [ ] `findByEmail(email)`: メールで検索
- [ ] エラーハンドリング（一意制約違反など）
- [ ] ユニットテスト

## Task 4: AuthController 実装
- [ ] POST /auth/register ハンドラ
- [ ] POST /auth/login ハンドラ
- [ ] リクエスト検証
- [ ] エラーレスポンス

## Task 5: Auth ミドルウェア実装
- [ ] JWT トークン検証ミドルウェア
- [ ] 保護されたルートに適用
- [ ] テスト

## Task 6: フロントエンド実装
- [ ] 登録フォーム UI
- [ ] ログインフォーム UI
- [ ] トークンを localStorage に保存
- [ ] API呼び出し（React Query）
- [ ] テスト

## Task 7: 結合テスト
- [ ] 登録 → ログイン フロー全体をテスト
- [ ] エラーケーステスト
- [ ] ブラウザでの手動確認
```

---

## 🤖 AIへの効果的な指示方法

### パターン1: 要件を定義させる

```
# AIへの指示例

I'm building a personal project with Kiro framework structure.
Here's what I want to build:

**Feature**: User Dashboard that shows user's recent activities and statistics

Please create a comprehensive requirements.md file that includes:
1. Background/problem statement
2. Detailed requirements in EARS format
3. Acceptance criteria for each requirement

Location: .kiro/specs/user-dashboard/requirements.md

Constraints:
- This is a React + Node.js app
- Use the tech stack defined in .kiro/steering/tech-stack.md
- Keep it focused on backend API contract and frontend display logic
```

### パターン2: 設計書を作成させる

```
# AIへの指示例

Based on the requirements in .kiro/specs/user-dashboard/requirements.md,
please create a comprehensive design.md that includes:

1. Architecture diagram (mermaid)
2. Database schema (SQL)
3. API contracts (request/response examples)
4. Component hierarchy (frontend)
5. Implementation flow and key decisions
6. Potential risks and mitigation

Constraints:
- Follow the architecture principles in .kiro/steering/architecture.md
- Maintain backward compatibility if modifying existing APIs
- Keep implementation complexity reasonable for one person

Location: .kiro/specs/user-dashboard/design.md
```

### パターン3: タスクリストを生成させる

```
# AIへの指示例

Based on design.md and requirements.md for the user-dashboard feature,
generate a detailed implementation task list (tasks.md) that:

1. Breaks down the feature into concrete, testable tasks
2. Defines clear acceptance criteria for each task
3. Specifies dependencies between tasks
4. Includes testing strategy (unit, integration, e2e)
5. Estimates complexity (small/medium/large)

Use checkbox format: [ ] Task description

Location: .kiro/specs/user-dashboard/tasks.md
```

### パターン4: 単一タスクを実装させる

```
# AIへの指示例

Implement Task 2 from .kiro/specs/user-dashboard/tasks.md:

**Task 2: Implement DashboardService**

Requirements:
- See: .kiro/specs/user-dashboard/requirements.md
- Design: .kiro/specs/user-dashboard/design.md

Tech Stack:
- See: .kiro/steering/tech-stack.md
- Architecture: .kiro/steering/architecture.md

Please:
1. Create the DashboardService with methods for fetching activities and statistics
2. Include proper error handling following architecture principles
3. Write comprehensive unit tests
4. Update tasks.md to mark this task as completed

Constraints:
- Follow existing code patterns in the backend/
- No third-party dependencies beyond what's in package.json
- Include TypeScript types for all functions
```

### パターン5: バグ修正・改善を指示する

```
# AIへの指示例

The user-dashboard feature is implemented but has an issue:

**Problem**: Dashboard API returns data for all users, not just the authenticated user

Context:
- Requirements: .kiro/specs/user-dashboard/requirements.md
- Implementation: .kiro/specs/user-dashboard/tasks.md
- Architecture: .kiro/steering/architecture.md

Debug checklist:
1. Check if JWT validation middleware is applied
2. Verify userId is extracted from token in Controller
3. Confirm Service filters by authenticated userId
4. Test with two different user accounts

Please provide:
1. Root cause analysis
2. Code fix
3. Test case to prevent regression
4. Verification steps
```

---

## 🔄 推奨ワークフロー

### Week ごとの流れ

```
Week 1: Planning
├── どの機能を実装するか決定
└── AIに指示: requirements.md を生成

Week 2: Design
├── requirements.md をレビュー
└── AIに指示: design.md を生成

Week 3-4: Implementation
├── AIに指示: tasks.md を生成（タスク分割）
├── タスク1～5を実装
│   └── AIに指示: 各タスクの実装
└── tasks.md のチェックボックスを更新

Week 5: Testing & Refinement
├── 手動テスト、エラーケース確認
├── 仕様と実装の乖離がないか確認
└── README に機能説明を追加
```

### チェックリスト

実装完了後、以下を確認:
```
機能: [機能名]

□ requirements.md が最新状態か確認
□ design.md で説明した実装になっているか確認
□ tasks.md のすべてのタスクが complete になっているか確認
□ ユニットテスト・結合テストが成功しているか確認
□ エラーケーステストが実施されているか確認
□ Code review（自己レビュー）で問題がないか確認
□ README や docs に使い方を記載したか確認
```

---

## 🎯 個人開発向けシンプル化のコツ

### ❌ 不要な要素（エンタープライズ版から削除OK）

```markdown
- research.md（新しい技術を学ぶ時間があれば作成、なければ省略OK）
- spec.json（メタデータ管理が必要ない場合は削除OK）
- verification/ フォルダ（テスト結果を仕様に紐付ける必要ない場合は削除OK）
- steering/database.md（シンプルな場合は schema.prisma にコメント追記で十分）
- steering/event-sourcing.md（CRUD のみなら不要）
```

### ✅ 最小構成

1つの機能に最低限必要なファイル:
```
.kiro/specs/<feature>/
├── requirements.md  # 「何が必要か」
├── design.md        # 「どう実装するか」
└── tasks.md         # 「何をやるか」
```

### 💡 効率化のコツ

1. **requirements.md は軽く**: 箇条書き + 受け入れ基準で十分
2. **design.md は図と API コントラクト中心**: 長い説明より図解
3. **tasks.md は実装時のチェックリスト**: 自分がやることを明確に
4. **steering/ は更新が少ない**: 一度作ったら変わりにくいので初期投資として捉える

---

## 📝 テンプレート集

### steering/tech-stack.md テンプレート
```markdown
# Technology Stack

## Backend
- Runtime: [言語・バージョン]
- Framework: [フレームワーク]
- Database: [DB]
- ORM/Query: [ORM]
- Auth: [認証方式]

## Frontend
- Framework: [フレームワーク]
- UI: [UIライブラリ]
- State: [状態管理]
- API: [データ取得]

## Development
- Build: [ビルドツール]
- Test: [テストフレームワーク]
- Lint: [リンター]
- Version Control: [VCS]
```

### steering/architecture.md テンプレート
```markdown
# Architecture Principles

## Backend Layering

[図またはテキスト説明]

## API Response Format

[標準フォーマット]

## Error Handling

[エラー処理の基本方針]

## Key Decisions

[プロジェクト固有の決定事項]
```

### specs/<feature>/requirements.md テンプレート
```markdown
# [機能名] の要件定義

## 背景

[なぜこの機能が必要か]

## 要件

### Req1: [機能1]
- [ユーザーストーリー]
- [受け入れ基準]

### Req2: [機能2]
- [ユーザーストーリー]
- [受け入れ基準]

## 非機能要件（あれば）

- パフォーマンス
- セキュリティ
```

### specs/<feature>/design.md テンプレート
```markdown
# [機能名] の設計書

## 概要

[何をどのように実装するか]

## Architecture

[図とテキスト説明]

## API / UI

[具体的なコントラクト]

## 実装の流れ

[各レイヤーの責務]

## 技術的な決定と理由

[なぜこの方針にしたか]
```

### specs/<feature>/tasks.md テンプレート
```markdown
# [機能名] の実装タスク

## Task 1: [タスク名]
- [ ] 小タスク1
- [ ] 小タスク2

## Task 2: [タスク名]
...

## テスト

- [ ] ユニットテスト
- [ ] 結合テスト
- [ ] エンドツーエンドテスト
```

---

## 🚀 スタートガイド

### ステップ1: steering フォルダを作成（1時間）

```bash
mkdir -p .kiro/steering
```

AIに指示:
```
Create .kiro/steering/tech-stack.md and .kiro/steering/architecture.md
for a [your app description] app.

Include:
- All dependencies you plan to use
- Layering (backend)
- API response format
- Error handling approach
```

### ステップ2: 最初の機能の要件を定義（2-3時間）

```bash
mkdir -p .kiro/specs/feature-1
```

AIに指示:
```
Create a requirements.md for [feature description] using the
technology stack and architecture defined in .kiro/steering/.

Include at least 3 key requirements with acceptance criteria.
```

### ステップ3: 設計書を作成（3-4時間）

AIに指示:
```
Create a design.md based on the requirements.md.

Include:
- Database schema
- API contracts (request/response examples)
- Component/function architecture
- Key implementation decisions
```

### ステップ4: タスクリストを生成（1時間）

AIに指示:
```
Create tasks.md that breaks down the design.md into specific,
testable tasks I can implement.

Include test cases and acceptance criteria for each task.
```

### ステップ5: 実装開始（1-2週間）

AIに指示（タスクごと）:
```
Implement Task 1 from .kiro/specs/feature-1/tasks.md

Include:
- Code implementation
- Unit tests
- Error handling
```

---

## 📊 プロジェクト例

### 例: SaaS 管理ツール

```
.kiro/
├── steering/
│   ├── tech-stack.md       # Next.js, Supabase
│   ├── architecture.md     # API層, 認証層, UI層
│   └── api-standards.md    # REST + OpenAPI
│
└── specs/
    ├── user-auth/
    │   ├── requirements.md
    │   ├── design.md
    │   └── tasks.md
    ├── billing/
    │   ├── requirements.md
    │   ├── design.md
    │   └── tasks.md
    ├── dashboard/
    │   ├── requirements.md
    │   ├── design.md
    │   └── tasks.md
    └── team-management/
        ├── requirements.md
        ├── design.md
        └── tasks.md
```

### 例: モバイルアプリ（Flutter）

```
.kiro/
├── steering/
│   ├── tech-stack.md           # Flutter, Firebase, Riverpod
│   ├── architecture.md         # MVVM, Service層
│   └── state-management.md     # Riverpod patterns
│
└── specs/
    ├── onboarding/
    ├── user-profile/
    ├── notifications/
    └── offline-support/
```

---

## 🎓 参考資料

- [Kiro フレームワーク概要](#.kiroとは)
- [EARS フォーマット](https://www.incose.org/systems-engineering/se-standards/se-handbook) — 要件の書き方
- [OpenAPI スペック](https://swagger.io/specification/) — API 定義

---

## ❓ よくある質問

### Q1: 小さいアプリなので requirements.md は必要ですか？

**A**: 簡潔に（1-2ページ）でもあるといいです。数週間後に「何をつくるつもりだったか」を忘れるので。

### Q2: 仕様と実装がズレたら？

**A**: 実装に合わせて仕様を更新してください。Kiro は「仕様が絶対」ではなく、「プロジェクト記憶の同期」が目的です。

### Q3: AI が作った仕様をそのまま使っていいですか？

**A**: チェックしてください。特に:
- API レスポンスが実装可能か
- DB スキーマに矛盾がないか
- 非機能要件は見落とされていないか

### Q4: 複数の機能を並行開発する場合？

**A**: 各機能フォルダは独立しているので問題ありません。`steering/` だけは共通なので、矛盾がないか注意してください。

### Q5: AI が間違った実装をしてくれたら？

**A**: 以下をアシスタントに与えてください:
```
Here's the bug: [問題説明]
See the current code: [ファイルへのリンク]
The spec said: [仕様のリンク]
Please: [修正指示]
```

---

## 🎉 まとめ

Kiro を個人開発に導入すれば:

✅ AI アシスタントとの指示が明確になる  
✅ 数週間後に「何をつくってたか」を思い出せる  
✅ 複数の機能を管理しやすくなる  
✅ バグが少なくなる（仕様と実装のズレが減る）  
✅ コード品質が上がる（設計が明確）

**初期投資**: 最初の steering/ 作成に2-3時間  
**リターン**: 後続の機能ごとに開発時間が 15-20% 短縮される
