# Kiro フレームワーク用 AI プロンプトテンプレート集

このファイルは、個人アプリ開発で Kiro フレームワークを使用する際に、AI（Claude、ChatGPT等）への指示文のテンプレート集です。

コピペして、`[ブラケット内]` を自分のプロジェクト情報に置き換えて使用してください。

---

## 📋 テンプレート一覧

| テンプレート | 目的 | 所要時間 |
|---|---|---|
| [Steering 初期化](#steering-初期化) | 技術スタックと基本方針を定義 | 2-3h |
| [要件生成](#要件生成) | 機能の要件定義書を作成 | 1-2h |
| [設計書生成](#設計書生成) | 要件を実装設計に変換 | 2-3h |
| [タスク生成](#タスク生成) | 設計を実装タスクに分割 | 1h |
| [単一タスク実装](#単一タスク実装) | 特定のタスクをコーディング | 2-8h |
| [テスト追加](#テスト追加) | 実装にテストを追加 | 1-2h |
| [バグ修正](#バグ修正) | 既存実装の問題を修正 | 1-3h |
| [リファクタリング](#リファクタリング) | コードを改善（仕様は変わらない） | 1-2h |
| [ドキュメント生成](#ドキュメント生成) | README や使い方を作成 | 30min-1h |

---

## 🚀 Steering 初期化

### テンプレート

```
I'm starting a personal project with the Kiro framework.

**Project**: [プロジェクト名]
**Description**: [プロジェクトの簡潔な説明]
**Target Users**: [誰が使うのか]

Example:
- Project: TaskFlow
- Description: Personalized task management app with AI-powered suggestions
- Target Users: Individual professionals who want productivity tracking

Please create two files for the .kiro/steering/ folder:

1. **tech-stack.md**
   - List all backend technologies (language, framework, database, ORM, auth)
   - List all frontend technologies
   - Specify versions and major libraries
   - Include development tools (build, test, lint)

2. **architecture.md**
   - Draw a simple architecture diagram (text or mermaid)
   - Define backend layering pattern (e.g., Router → Controller → Service → Repository)
   - Define standard API response format (with examples)
   - Define error handling approach
   - List key architectural decisions and why they were chosen

Use markdown format and make it easy to reference in future specs.
```

### 使用例

```
I'm starting a personal project with the Kiro framework.

Project: RecipeBox
Description: A web app where users can save, organize, and share recipes with notes
Target Users: Home cooks who want to build their personal recipe collection

Please create tech-stack.md and architecture.md in .kiro/steering/ that use:
- Backend: Node.js + Express + PostgreSQL + Prisma ORM + JWT auth
- Frontend: React + TypeScript + Vite + Tailwind + React Query
- Testing: Vitest + React Testing Library + Supertest

Include standard API response format and how errors are handled.
```

---

## 📋 要件生成

### テンプレート

```
Based on the steering documents in .kiro/steering/, create a requirements.md file for a new feature.

**Feature Name**: [機能名]
**Brief Description**: [機能の簡潔な説明]
**Context**: [なぜ必要なのか、どの問題を解決するのか]

File location: .kiro/specs/[feature-slug]/requirements.md

Please include:

1. **Background** (2-3 paragraphs)
   - Why is this feature needed?
   - What problem does it solve?
   - Who benefits?

2. **Functional Requirements** (3-5 requirements minimum)
   - Use clear user-centric language (As a [role], I want to [action])
   - Include acceptance criteria for each requirement
   - Focus on WHAT, not HOW

3. **Non-Functional Requirements** (if applicable)
   - Performance expectations
   - Security considerations
   - Scalability needs

4. **Constraints & Dependencies**
   - Any limitations?
   - Does this depend on other features?
   - Any compliance or regulatory requirements?

Use markdown format with clear sections and bullet points.
```

### 使用例

```
Based on the steering documents, create a requirements.md for:

Feature Name: User Account Management
Brief Description: Users can create accounts, update profiles, and manage password changes
Context: This is the foundation for authentication and personalization

File location: .kiro/specs/user-account-management/requirements.md

Include at least:
- User registration with email verification
- Profile update (name, avatar, preferences)
- Password change flow
- Account deletion option
- Session management

Format: EARS style requirements with clear acceptance criteria
```

---

## 🏗️ 設計書生成

### テンプレート

```
Based on the requirements in .kiro/specs/[feature-slug]/requirements.md,
create a comprehensive design.md file.

Feature: [機能名]

File location: .kiro/specs/[feature-slug]/design.md

Please include:

1. **Overview**
   - Summary of what will be built
   - How it solves the requirements
   - Key user flows

2. **Architecture**
   - Backend: Data flow, layers, key components
   - Frontend: Component hierarchy, state management
   - Use Mermaid diagrams if helpful

3. **Database Design**
   - SQL schema (CREATE TABLE statements)
   - Relationships and constraints
   - Data types and nullable fields

4. **API Contracts**
   - Each endpoint: method, path, request body, response
   - Include example JSON
   - Error responses

5. **Frontend Components**
   - Page/component hierarchy
   - State management approach
   - User interaction flows

6. **Implementation Strategy**
   - Order of implementation (backend-first? frontend? parallel?)
   - Key technical decisions and why
   - Potential risks and mitigation

7. **Testing Strategy**
   - Unit test cases
   - Integration test cases
   - Edge cases to handle

Constraints:
- Follow the architecture principles from .kiro/steering/architecture.md
- Be specific and concrete (not abstract)
- Include security considerations (auth, validation, etc.)
- Consider error handling at each layer
```

### 使用例

```
Based on requirements.md for user-account-management, create design.md:

Include:
- PostgreSQL schema for users table (email, password_hash, profile data)
- API endpoints: POST /auth/register, POST /auth/login, PATCH /users/{id}, DELETE /users/{id}
- JWT token handling and validation middleware
- Password hashing with bcrypt
- React components: RegisterForm, LoginForm, ProfileEditor
- Zustand store for auth state
- React Query hooks for API calls

Make sure to show how JWT is validated on protected routes and how errors (duplicate email, invalid password, etc.) are handled at each layer.
```

---

## ✅ タスク生成

### テンプレート

```
Based on the design.md in .kiro/specs/[feature-slug]/,
create a detailed tasks.md file that breaks down the feature into implementation tasks.

Feature: [機能名]

File location: .kiro/specs/[feature-slug]/tasks.md

Please create:

1. **Database Tasks**
   - Schema creation
   - Migrations
   - Seed data (if needed)

2. **Backend Tasks**
   - API endpoints
   - Business logic / service layer
   - Repository / data access layer
   - Middleware (auth, validation, etc.)
   - Error handling

3. **Frontend Tasks**
   - UI components
   - API integration (React Query)
   - State management
   - Form validation
   - User feedback (loading, error, success states)

4. **Testing Tasks**
   - Unit tests for services
   - API integration tests
   - Component tests
   - E2E test scenarios

5. **Documentation Tasks**
   - API documentation
   - Component documentation
   - Usage examples

For each task:
- [ ] Clear, actionable task name
- Include what needs to be done
- Include acceptance criteria (how to verify it's done)
- Specify files to create/modify
- Mark dependencies with "Requires: [other task]"
- Estimate complexity: small (1h) / medium (2-4h) / large (4-8h)

Use checkbox format that can be tracked as work progresses.
```

### 使用例

```
Based on design.md for user-account-management, create tasks.md:

Include approximately 12-15 tasks covering:
- DB schema for users and sessions tables
- AuthService with registration, login, password reset logic
- UserRepository with CRUD operations
- AuthController with endpoints
- JWT middleware
- React components (forms, profile page)
- React Query hooks
- Form validation with Zod
- Unit tests for services
- Component tests

Each task should have acceptance criteria and complexity estimate.
```

---

## 💻 単一タスク実装

### テンプレート A: 新機能の実装

```
Implement the following task from .kiro/specs/[feature-slug]/tasks.md:

**Task**: [タスク名]

Context & Requirements:
- Read requirements from: .kiro/specs/[feature-slug]/requirements.md
- Implementation guide: .kiro/specs/[feature-slug]/design.md
- Tech stack: .kiro/steering/tech-stack.md
- Architecture: .kiro/steering/architecture.md

Task Description:
[タスクの詳細説明、または requirements.md から抜粋]

Please:
1. Implement [what needs to be implemented]
2. Create files: [ファイルパス]
3. Include TypeScript types / interfaces
4. Follow error handling from architecture.md
5. Add unit tests with [テストフレームワーク]
6. Include inline comments for complex logic

Important:
- Use existing code patterns from the project
- No changes to tech stack or architecture
- Maintain backward compatibility
- Update .kiro/specs/[feature-slug]/tasks.md to mark this task as completed

Acceptance Criteria (from design.md):
- [基準1]
- [基準2]
- [基準3]
```

### テンプレート B: バックエンド実装（詳細）

```
Implement Task: [タスク名]
From: .kiro/specs/[feature-slug]/

**What to build**: [やることの詳細]

**Files to create/modify**:
- backend/src/services/[service-name].ts (Service layer with business logic)
- backend/src/repositories/[repo-name].ts (Repository interface)
- backend/src/repositories/db/[repo-name].ts (Database implementation with SQL)
- backend/src/handlers/[handler-name].ts (HTTP handler)
- backend/src/types/[type-name].ts (Type definitions)

**Implementation approach** (from design.md):
1. Service layer: [ビジネスロジック]
2. Repository layer: [DB操作]
3. Handler layer: [HTTP入出力]

**Error handling**:
- Error types: [エラータイプ] 
- HTTP status codes: [ステータスコード]
- Follow errorhandler.go pattern

**Database** (if applicable):
- SQL: [SQL文やスキーマの詳細]
- Use Prisma types for [ORM/型生成]

**Tests**:
- Unit test: Service logic with mocked repository
- Integration test: With real database
- Test file: backend/src/[feature]/[name].test.ts

**Verification**:
- npm run test passes for new code
- No TypeScript errors: npm run typecheck
- API works with cURL: [cURL example]
```

### テンプレート C: フロントエンド実装（詳細）

```
Implement Task: [タスク名]
From: .kiro/specs/[feature-slug]/

**What to build**: [やることの詳細]

**Files to create/modify**:
- frontend/src/features/[feature]/pages/[Page].tsx (Page component)
- frontend/src/features/[feature]/components/[Component].tsx (UI components)
- frontend/src/features/[feature]/hooks/use[Hook].ts (Custom hook for API calls)
- frontend/src/features/[feature]/stores/[store].ts (State management)
- frontend/src/features/[feature]/types/[types].ts (Type definitions)
- frontend/src/features/[feature]/[Component].stories.tsx (Storybook stories)

**Design requirements** (from design.md):
- Component hierarchy: [コンポーネント構成]
- User flows: [ユーザーフロー]
- State management: [状態管理方法]

**API integration** (from design.md):
- Endpoint: [エンドポイント]
- Request: [リクエスト形式]
- Response: [レスポンス形式]
- Use React Query for caching/fetching
- Handle loading, error, success states

**Styling**:
- Use Tailwind CSS with theme from tech stack
- Responsive design for mobile/tablet
- Accessibility (ARIA labels, keyboard navigation)

**Form handling** (if applicable):
- Use React Hook Form + Zod for validation
- Show validation errors inline
- Disable submit during submission

**User feedback**:
- Loading spinner while fetching
- Error toast/alert if API fails
- Success message when action completes

**Tests**:
- Component tests: Rendering, user interactions
- Hook tests: Mock API calls
- Test file: frontend/src/[feature]/[Component].test.tsx

**Verification**:
- npm run typecheck - no TypeScript errors
- npm run test - tests pass
- Manual test in browser: [test scenarios]
- Storybook story renders correctly
```

---

## 🧪 テスト追加

### テンプレート

```
Add comprehensive tests for the [feature-name] feature implemented in Task [X].

Context:
- Feature spec: .kiro/specs/[feature-slug]/
- Implementation: [ファイルパス]
- Existing tests: [テストファイルパス]

Please create tests for:

**Backend**:
1. Service layer unit tests
   - Mock repository
   - Test business logic
   - Test error cases
   - Test edge cases: null, empty, boundary values

2. Repository integration tests
   - Use test database
   - Test SQL correctness
   - Test constraints (unique, foreign key, etc.)

3. API endpoint tests
   - Mock service
   - Test request validation
   - Test response format
   - Test error responses (400, 401, 404, 500)

**Frontend**:
1. Component unit tests
   - Test rendering with props
   - Test user interactions (clicks, form input)
   - Test loading states
   - Test error states
   - Mock API calls

2. Hook tests
   - Test data fetching
   - Test error handling
   - Test caching behavior

3. Integration tests
   - Test full user flow
   - Mock API responses

Test file locations:
- Backend: [backend/src/__tests__/feature.test.ts]
- Frontend: [frontend/src/features/[feature]/__tests__/[Component].test.tsx]

Use [テストフレームワーク] and follow existing test patterns.

Include:
- Clear test descriptions
- Arrange-Act-Assert pattern
- Meaningful assertions with custom messages
```

---

## 🐛 バグ修正

### テンプレート

```
There's a bug in the [feature-name] feature.

**Problem Description**:
[バグの詳細説明]

**Expected Behavior**:
[期待される動作]

**Actual Behavior**:
[実際の動作]

**Steps to Reproduce**:
1. [ステップ1]
2. [ステップ2]
3. [ステップ3]

**Context**:
- Feature spec: .kiro/specs/[feature-slug]/
- Relevant code: [ファイルパス]
- Existing tests: [テストファイル]

**Investigation**:
Please:
1. Identify the root cause
2. Trace through the code path (frontend → API → backend → DB)
3. Check if this violates the design in .kiro/specs/[feature-slug]/design.md
4. Look for similar issues elsewhere in codebase

**Fix Requirements**:
1. Provide a minimal code fix
2. Write a test case that fails with current code, passes with fix
3. Check for related edge cases
4. Verify no regressions in existing tests
5. Update .kiro/specs/[feature-slug]/tasks.md if needed

Before providing code, explain:
- What went wrong
- Why it went wrong
- How the fix works
```

### 使用例

```
There's a bug in the user registration feature.

Problem: When registering with an email that already exists, 
the API returns a 500 error instead of a 400 Bad Request.

Expected: 400 status with message "Email already exists"
Actual: 500 Internal Server Error

Steps to Reproduce:
1. Register with email: test@example.com
2. Try to register again with same email
3. Get 500 error

Context:
- Feature: .kiro/specs/user-auth/
- Backend code: backend/src/services/auth-service.ts, repositories/user-repository.ts
- Handler: backend/src/handlers/auth-handler.ts

Please:
1. Find why duplicate email check isn't working
2. Verify error is caught and converted to 400 in handler
3. Add test for this case
```

---

## ♻️ リファクタリング

### テンプレート

```
The code for [feature-name] needs refactoring (no feature changes).

**Current Issues**:
- [問題1: 例えば複製されたコード、読みにくい関数など]
- [問題2]
- [問題3]

**Goals**:
- [改善ゴール1]
- [改善ゴール2]

**Files to Refactor**:
- [ファイルパス1]
- [ファイルパス2]

**Constraints**:
- No feature changes - behavior must remain identical
- All existing tests must pass
- No changes to API contracts
- Follow architecture principles from .kiro/steering/

**Please**:
1. Identify what's causing the issues
2. Propose refactoring approach
3. Implement the refactoring
4. Ensure all tests pass
5. Provide before/after comparison if helpful

Test Verification:
- npm run test passes
- npm run typecheck passes
- Manual testing of feature still works
```

---

## 📚 ドキュメント生成

### テンプレート A: README

```
Create a README.md for the [feature-name] feature.

Context:
- Feature spec: .kiro/specs/[feature-slug]/
- Implementation files: [ファイルパス]

The README should help new developers (or future you) understand:

1. **What is this feature?**
   - Simple explanation of what it does
   - Why it exists

2. **How to Use It** (Frontend)
   - Link to feature entry point
   - Key user actions
   - Screenshots or usage example (if applicable)

3. **How It Works** (Technical)
   - Architecture overview (diagram if helpful)
   - Key files and their responsibilities
   - Data flow

4. **API Endpoints** (if backend feature)
   - List all endpoints
   - Request/response examples
   - Error cases

5. **Database Schema** (if applicable)
   - Entity diagrams
   - Key relationships

6. **How to Test It**
   - Unit tests: where they are, what they cover
   - Integration tests: how to run them
   - Manual testing steps

7. **Known Limitations or Future Improvements**
   - Any TODOs
   - Scalability concerns
   - Potential enhancements

File location: docs/[feature-slug]-README.md or feature README.md
```

### テンプレート B: API ドキュメント

```
Create API documentation for the [feature-name] feature.

Include:

1. **Overview**
   - What this API does
   - Who uses it

2. **Authentication**
   - How to authenticate (JWT, API key, etc.)
   - Where to include auth (header, body, etc.)

3. **Endpoints**

For each endpoint:
```
### [METHOD] /path

**Description**: What this does

**Authentication**: Required / Not required

**Request Body**:
\`\`\`json
{
  "field1": "type and description",
  "field2": "type and description"
}
\`\`\`

**Success Response** (200):
\`\`\`json
{
  "success": true,
  "data": { ... }
}
\`\`\`

**Error Responses**:
- 400: Bad Request - [理由]
- 401: Unauthorized - [理由]
- 404: Not Found - [理由]
- 500: Server Error - [理由]

**Example**:
\`\`\`bash
curl -X POST http://localhost:3000/api/endpoint \\
  -H "Authorization: Bearer TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"field": "value"}'
\`\`\`
\`\`\`

4. **Rate Limiting** (if applicable)
5. **Versioning** (if applicable)

File location: docs/api/[feature-slug].md
```

---

## 📊 複合的なプロンプト（複数タスク同時実行）

### テンプレート: 要件から実装まで

```
I want to implement a new feature end-to-end using the Kiro framework.

**Project Context**:
- Project location: [プロジェクトパス]
- Tech stack: .kiro/steering/tech-stack.md
- Architecture: .kiro/steering/architecture.md

**Feature**: [機能名]
**Description**: [機能の説明]
**User Story**: As a [role], I want to [action] so that [benefit]

Please create a complete feature package:

1. **requirements.md**
   - Background
   - 3-5 functional requirements
   - Acceptance criteria
   - Constraints

2. **design.md**
   - Architecture
   - Database schema
   - API contracts
   - Component hierarchy
   - Implementation strategy

3. **tasks.md**
   - Break down into 10-15 concrete tasks
   - Include test tasks
   - Add complexity estimates

4. **Implementation**
   - Implement all backend logic
   - Implement all frontend components
   - Write tests
   - Update .kiro/specs/[feature]/tasks.md with completed checkmarks

Locations:
- .kiro/specs/[feature-slug]/requirements.md
- .kiro/specs/[feature-slug]/design.md
- .kiro/specs/[feature-slug]/tasks.md

Timeline: [推定時間]
```

---

## 💡 プロンプト最適化のコツ

### ✅ 効果的な指示

```
Context:
- I have a .kiro/ structure with steering/ and specs/
- Tech stack is [スタック]
- Architecture pattern is [パターン]

Task:
- Create/implement [何をするか]
- File location: [パス]
- Reference: [参考ファイル]

Please:
1. [具体的にやること1]
2. [具体的にやること2]
3. [具体的にやること3]

Constraints:
- Follow patterns in [既存ファイル]
- Use technology from steering/tech-stack.md
- Include tests and error handling
```

### ❌ 避けるべき指示

```
❌ "Build a user auth system" (曖昧)
✅ "Implement Task 2 from .kiro/specs/user-auth/tasks.md" (明確)

❌ "Make it better" (抽象的)
✅ "Refactor to reduce duplication and improve readability following [パターン]" (具体的)

❌ "Add tests" (不十分)
✅ "Add unit tests for Service layer mocking Repository, and integration tests with real DB" (詳細)
```

---

## 🎯 プロンプト作成チェックリスト

各プロンプトを送る前に確認:

- [ ] プロジェクトコンテキストは明確か（tech-stack, architecture 参照）
- [ ] タスクの目的は明確か
- [ ] ファイルパスは指定されているか
- [ ] 参考資料（既存仕様、コード）は指定されているか
- [ ] 期待される成果物（ファイル、コード、テスト）は明記されているか
- [ ] 制約条件は記載されているか（既存パターンに従う、エラーハンドリングなど）
- [ ] テスト要件は明記されているか
- [ ] 検証方法は明記されているか

---

## 🔗 テンプレートの組み合わせ例

### シナリオ1: 新機能を 1 週間で完成

```
Week 1 - Monday:
→ Steering 初期化
→ 要件生成

Week 1 - Tuesday:
→ 設計書生成
→ タスク生成

Week 1 - Wednesday-Friday:
→ 単一タスク実装 (複数回)
→ テスト追加
→ ドキュメント生成
```

### シナリオ2: バグ修正と改善

```
Day 1:
→ バグ修正

Day 2:
→ テスト追加 (regression test)

Day 3:
→ リファクタリング
→ テスト確認
```

---

## 📝 テンプレート継承の例

```
Step 1: 要件生成を実行
結果: .kiro/specs/user-dashboard/requirements.md

Step 2: 要件の内容を含めて設計書生成を実行
プロンプトに含める: 
"Based on the requirements I just created in .kiro/specs/user-dashboard/requirements.md..."

Step 3: 要件と設計書の両方を参照してタスク生成
プロンプトに含める:
"Based on requirements.md and design.md in .kiro/specs/user-dashboard/..."

Step 4: タスクを参照して実装
プロンプトに含める:
"Implement Task 3 from .kiro/specs/user-dashboard/tasks.md..."
```

---

## 🎓 推奨される使用順序

```
1. 最初のプロジェクト立ち上げ時
   → Steering 初期化

2. 新機能の開発開始時（各機能で繰り返し）
   → 要件生成
   → 設計書生成
   → タスク生成
   → 単一タスク実装 (ループ)
   → テスト追加
   → ドキュメント生成

3. 既存機能の改善時
   → バグ修正 (if needed)
   → リファクタリング
   → テスト追加
   → ドキュメント更新
```

---

## 最後に

これらのテンプレートは **開始点** です。
- プロジェクトに合わせてカスタマイズ
- 効果的だったプロンプトは保存・再利用
- AI が生成した内容は必ず確認・編集
- チームで使う場合は共有して統一性を保つ
