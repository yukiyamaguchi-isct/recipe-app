# Handoff: 料理レシピアプリ デザインシステム（MVP / Web）

## Overview
料理本のレシピ写真を撮ると、AIが材料と作り方を読み取り、材料を「野菜 / 調味料 / その他」に自動分類して表示・保存するアプリの**見た目**の仕様。画面構成・遷移は既に確定しており、本ハンドオフはトークン・コンポーネント・6画面の視覚仕様のみを扱う。**構成の再設計・新機能の追加はスコープ外。**

主な利用環境（すべての設計判断の根拠）:
- 場所はキッチン。スマホを台に立てかけ 30〜50cm の距離から見る
- 手が濡れている／汚れている。タップは雑になり、回数を減らしたい
- 買い物中にも材料一覧を見る（歩きながら片手）
- 明るい場所での利用が中心（**ダークモードはMVPでは不要**）

→ 文字は大きめ、タップ領域は広め、コントラストは高め。情報密度より「離れて読めること」を優先。

## About the Design Files
同梱の `Recipe Design System v2.dc.html` は **HTMLで作成したデザインリファレンス**（意図した見た目を示すプロトタイプ）であり、本番コードとしてコピーするものではない。作業内容は、このHTMLデザインを **対象コードベースの既存環境（Tailwind CSS v4 + React 19）で、その規約・ライブラリに沿って再現すること**。環境が未整備の場合は指定スタックで新規に構築する。

同梱ファイル:
- `Recipe Design System v2.dc.html` — 確定版（本ハンドオフの正）
- `Recipe Design System.dc.html` — 初期の緑基調版。**参照不要（履歴として同梱）**

## Fidelity
**High-fidelity (hifi)**。色・タイポグラフィ・余白・角丸・影・状態はすべて確定値。ピクセル精度で再現すること。写真部分のみ縞模様プレースホルダ（実画像は実装時にAPIから取得）。

## 制約
- **Tailwind CSS v4 + React 19**。トークンは `@theme` で定義（下記コードをそのまま使用可）
- **モバイルファースト**。将来 React Native へ移植する可能性があるため、Web固有の装飾（複雑なグラデーション、backdrop-filter、CSS擬似要素依存の装飾など）に依存しない。実装済みの表現は border / border-radius / box-shadow / flex / grid のみ
- 日本語UI。材料名・分量は長さがまちまち（「しょうゆ 大さじ2」「にんじん（中）1本」）。折り返しと揃えは下記の規則に従う
- **アイコンは有料素材を使わない**。現状はテキストグリフ（← ↓ ✎ ＋ ✓ ×）のみで構成。差し替える場合は Lucide / Material Symbols などのOSSアイコンを使用
- コントラスト比 **4.5:1 以上**（実測値は下記コントラスト表参照。全て 5.6:1 以上）

---

## Design Tokens

### @theme（Tailwind v4）
```css
@import "tailwindcss";

@theme {
  --font-sans: "Noto Sans JP", "Hiragino Sans", "BIZ UDPGothic", "Yu Gothic", system-ui, sans-serif;

  /* 面と文字 */
  --color-bg: #FFFFFF;             /* 画面本体の背景 */
  --color-header: #E9F7F8;         /* 固定ヘッダー・上部の帯 */
  --color-surface: #FFFFFF;        /* カード・ダイアログ */
  --color-ink: #0B2D39;            /* 本文 */
  --color-ink-sub: #4A6570;        /* 補助情報（作成日など） */
  --color-border: #C8E4E8;
  --color-border-strong: #9CC3CA;  /* 入力欄の枠 */

  /* 操作色 */
  --color-primary: #0B2D39;        /* 主要ボタンの面・選択中タブ。白文字 14.5:1 */
  --color-primary-dark: #123E4D;   /* 押下 */
  --color-primary-soft: #D8F3F6;   /* 手順番号の丸など */
  --color-link: #0E6E7D;           /* テキストリンク・枠線ボタン。派生色 5.9:1 */

  /* アクセント（非文字要素専用） */
  --color-accent: #00C6D7;         /* 進捗バー・完了マーク・ブランドマーク */
  --color-accent-light: #7AE7F2;   /* フォーカスリング・淡面 */
  --color-attention: #F7B267;      /* 確認バナー・注意表示の枠 */

  /* 状態 */
  --color-danger: #B3261E;
  --color-danger-soft: #FDECEA;
  --color-warn-soft: #FDEEDA;

  /* カテゴリ = 同色相シアンの明度3段（必ず文字ラベル併記） */
  --color-cat-veg: #E4F8FA;      --color-cat-veg-ink: #0B4A55;
  --color-cat-season: #B8EDF4;   --color-cat-season-ink: #093B45;
  --color-cat-other: #7AE7F2;    --color-cat-other-ink: #08323B;

  /* タイポグラフィ */
  --text-micro: 0.8125rem;  --text-micro--line-height: 1.5;   /* 13px */
  --text-meta: 0.9375rem;   --text-meta--line-height: 1.6;    /* 15px */
  --text-body: 1.0625rem;   --text-body--line-height: 1.8;    /* 17px 本文下限 */
  --text-lead: 1.1875rem;   --text-lead--line-height: 1.7;    /* 19px 材料名・ボタン */
  --text-title: 1.375rem;   --text-title--line-height: 1.5;   /* 22px セクション見出し */
  --text-display: 1.75rem;  --text-display--line-height: 1.4; /* 28px 画面タイトル */

  --radius-sm: 8px;  --radius-md: 12px;  --radius-full: 999px;
  --shadow-e1: 0 1px 2px rgba(11,45,57,.08);   /* カード・固定ヘッダー */
  --shadow-e2: 0 4px 12px rgba(11,45,57,.12);  /* FAB・ダイアログ */

  --spacing: 4px;              /* 1=4 2=8 3=12 4=16 6=24 8=32 12=48 */
  --size-tap: 48px;            /* 最小タップ領域 */
  --size-tap-lg: 56px;         /* 主要ボタン高さ */
}
```

### 配色の使用ルール（重要）
1. **#00C6D7 の上に文字を置かない**（白文字 2.1:1／濃色 4.2:1 でいずれも不足）。進捗バー、完了の丸、ブランドマークなど非文字要素専用。
2. 文字を伴う操作面は **#0B2D39**（白文字 14.5:1）。テキストリンク・枠線ボタンは **#0E6E7D**（5.9:1、パレット由来の派生色）。
3. **#F7B267 は注意・確認バナー専用**。動作ボタンには使わない。
4. カテゴリ色は**必ず文字ラベルと併用**（色だけに意味を持たせない）。行そのものには着色せず、見出し帯だけで所属を示す。
5. 背景色は白と #E9F7F8（ヘッダー）の2色のみ。それ以外の背景色を追加しない。

### タップ領域
- 最小 **48×48px**、隣接要素との間隔 8px 以上
- 主要ボタン高さ **56px**、補助ボタン・チップ **48px**
- 破壊的動作（削除）は縦並びの下側に配置し、間隔 10px 以上（濡れた手の誤タップ対策）

### コントラスト実測値
| 組み合わせ | 比率 | 判定 |
|---|---|---|
| ink #0B2D39 / header #E9F7F8 | 13.2:1 | AAA |
| ink #0B2D39 / bg #FFFFFF | 14.5:1 | AAA |
| ink-sub #4A6570 / #FFFFFF | 6.3:1 | AA |
| link #0E6E7D / #FFFFFF | 5.9:1 | AA |
| #FFFFFF / 操作面 #0B2D39 | 14.5:1 | AAA |
| danger #B3261E / #FFFFFF | 5.6:1 | AA |
| 野菜 #0B4A55 / #E4F8FA | 10.4:1 | AAA |
| 調味料 #093B45 / #B8EDF4 | 9.9:1 | AAA |
| その他 #08323B / #7AE7F2 | 9.5:1 | AAA |
| 注意 #7A4A12 / #FDEEDA | 6.6:1 | AAA |

---

## 「移動」と「絞り込み」の描き分け（本デザインの中核ルール）
役割ごとに**面の有無**で3層に分ける。この3種以外の見た目をヘッダー・タブに追加しないこと。

| 役割 | 見た目 | 例 |
|---|---|---|
| **移動**（押しても状態が残らない） | 面なし・枠なし。文字色 #0E6E7D＋方向記号 | `← 一覧` `材料 ↓` `作り方 ↓` |
| **操作**（モードが変わる） | 枠線 1.5px #0E6E7D、角丸8px、面は白 | `編集` `✎ 改題` |
| **絞り込み**（現在の状態を表す） | 塗りピル（角丸999px）。選択中= #0B2D39＋白文字／非選択= 白＋枠 #C8E4E8 | `全体``野菜``調味料``その他` |

配置でも区別する: 移動はヘッダー内の横一列、絞り込みは材料セクション見出しの直下（所属を位置で示す）。絞り込みは**常にどれか1つが必ず点灯**（既定は「全体」）。

---

## Components

### ボタン
| 種類 | 面 | 文字 | 枠 | 高さ | 角丸 |
|---|---|---|---|---|---|
| 主要 | #0B2D39（hover #123E4D） | #FFFFFF / 19px / 700 | なし | 56px | 12px |
| 副次 | #FFFFFF（hover #D8F3F6） | #0E6E7D / 19px / 500 | 1.5px #0E6E7D | 56px | 12px |
| 危険 | #FFFFFF（hover #FDECEA） | #B3261E / 19px / 500 | 1.5px #E3AEAA | 56px | 12px |
| 無効 | #DFF1F3 | #8AA3AB / 17px / 500 | なし | 48px | 12px |
| 押下 | #123E4D | #FFFFFF / 17px | なし | 48px | 12px |

横padding 24px（主要）/ 20px（補助）。ラベルは**体言止め・最大8文字**（例: 「この内容で決定」「編集する」「撮り直す」「削除する」「やめる」「行を追加」）。

### レシピカード
- 面 #FFFFFF、枠 1px #C8E4E8、角丸 12px、影 e1、overflow hidden
- サムネイル: aspect-ratio 16/10（スマホ実装では高さ150px）、下に padding 16px
- タイトル: 19px / 700 / line-height 1.5、**2行まで**（以降省略）
- 作成日: 15px / #4A6570、上マージン 4px、形式「2026年8月12日」
- **カード全面がタップ領域**

### 空状態
- 枠 1.5px dashed #9CC3CA、角丸12px、padding 40px 24px、面 #E9F7F8、中央揃え、gap 14px
- 56px角の枠付きアイコン（＋）／見出し「レシピなし」19px 700／説明 17px line-height1.8 max-width 26ch／主要ボタン「写真を撮る」

### 固定ヘッダー（レシピ表示）
面 #E9F7F8、下境界 1px #C8E4E8、影 e1。3段構成:
1. 上段: 左 `← 一覧`（面なし・48px）／右 `編集`（枠線・48px）、padding 6px 12px
2. 中段: タイトル 22px/700/line-height1.4 ＋ `✎`（#0E6E7D 17px）、padding 0 16px 8px
3. 下段: `材料 ↓` `作り方 ↓`（面なし・48px、ページ内ジャンプ）、padding 0 12px 6px

### セクション切替タブ（絞り込み）
横並び flex gap 8px、wrap 可。各ピル: 高さ48px、padding 11px 18px、角丸999px、17px。選択中 #0B2D39＋白＋500 / 非選択 白＋#23505C＋枠1px #C8E4E8。

### 材料の1行表示
```
[  数量 ] [材料名          ]
   右揃え    左揃え・可変
```
- flex、align-items: baseline、gap 16px（モックでは14px）、padding 16px 18px、下境界 1px #DFF1F3
- **数量**: width 5.5em / flex none / text-align right / 19px / 700 / font-feature-settings 'tnum'
- **材料名**: flex 1 / 19px / line-height 1.6 / text-wrap: pretty
- 買い物中に数量だけを縦に追えるようにするため、数量が左。長い数量は折り返し、材料名の1行目に揃う

### カテゴリ見出し
高さ可変の帯: flex / gap 10px / 角丸8px / padding 10px 16px。左に 10px の丸（ink色）、ラベル 17px/700（ink色）、右端に件数 15px（ink色、margin-left auto）。面/文字は `--color-cat-*` を使用。

### 手順リスト
- 各項目: flex / gap 16px / align-items flex-start、項目間 20〜24px
- 番号: 40px角の丸、面 #D8F3F6、文字 #0E6E7D 19px 700、中央揃え
- 本文: 17px / line-height **1.9** / padding-top 6px / text-wrap pretty

### フォーム入力
- ラベル 15px/500 #23505C、gap 8px（縦）
- 入力欄: 19px、padding 14px 16px、min-height 56px、枠 1.5px #9CC3CA、角丸12px、面 #FFFFFF
- focus: border-color #0E6E7D ＋ outline 3px #7AE7F2
- エラー時: 枠 #B3261E、ラベルと補助文 #B3261E（「未入力」）
- プルダウン（カテゴリ）は同寸法。選択肢は 野菜 / 調味料 / その他

### 進捗表示（3段階・最大30秒）
段階: アップロード中 → 文字を読み取り中 → 材料を仕分け中
- 完了: 32px丸 面 #00C6D7 ＋ 白の ✓、ラベル 17px #4A6570
- 進行中: 32px丸 枠3px #00C6D7（透明の面）、ラベル **19px/700 #0B2D39**、`opacity .55→1` の1.4s ease-in-out 無限アニメーション
- 未着手: 32px丸 枠2px #C8E4E8、ラベル 17px #8AA3AB
- 下部にバー: 高さ8px、角丸999px、トラック #DFF1F3、フィル #00C6D7（幅=進捗%）
- 縦 gap 18〜20px

### エラー表示
- 失敗: 面 #FDECEA / 枠 1px #E3AEAA / 角丸12px / padding 18px 20px。見出し 19px 700 #8C1D18、本文 17px line-height1.8 #5F1B16、危険ボタン（面 #B3261E ＋白文字 17px 700、48px）
- 警告（軽微）: 面 #FDEEDA / 枠 1px #F7B267 / 17px line-height1.8 #7A4A12

### 確認ダイアログ
- 面 #FFFFFF / 角丸12px / 影 e2 / padding 24px / max-width 340px / gap 12px
- 見出し 22px 700、本文 17px line-height1.8 #23505C
- ボタンは**縦並び**（gap 10px、各56px）。破壊的動作を上に置かない

---

## Screens / Views

### 1. ログイン
- 目的: Googleでログイン
- レイアウト: 縦中央寄せ、padding 32px 24px、gap 20px、背景 #FFFFFF
- 構成: ブランドマーク（64px角/角丸16px/面 #00C6D7/文字 #0B2D39 28px 700）→ タイトル「レシピを撮る」28px 700 中央 → 説明 17px line-height1.9 中央 max-width 28ch（2行）→ 主要ボタン「Googleでログイン」（幅100%、56px、上マージン12px）

### 2. レシピ一覧
- ヘッダー（面 #E9F7F8、padding 20px、下境界）: 左「レシピ」22px 700、右 件数 15px #4A6570
- 本文: padding 16px、カード縦積み gap 16px。**PCは3列グリッド gap 20px**（コンテナ padding 24px 28px、ヘッダー右に「＋ 新規」ボタン）
- **FAB**: position absolute（実装は fixed）right 20px / bottom 24px、64px円、面 #0E6E7D、白の ＋ 32px、影 e2
- 空状態は上記コンポーネント参照

### 3. アップロード / 解析中
- padding 24px、gap 28px、背景 #FFFFFF
- 上部 `← 中止`（面なし48px）→ 撮影写真プレビュー（aspect 4/3、角丸12px）→ 見出し「読み取り中（最大30秒）」22px 700 → 3段階の進捗 → 最下部にバー（margin-top auto）

### 4. レシピ表示（中心画面）
- 固定ヘッダー（上記3段構成）
- 本文 padding 20px 16px、gap 16px:
  「材料（4人分）」22px 700 → 絞り込みタブ（既定「全体」）→ カテゴリ見出し（野菜）→ 材料行×n → カテゴリ見出し（調味料）→ 材料行×n → 「作り方」22px 700 → 手順リスト
- 「材料」「作り方」はページ内ジャンプ（アンカー）

### 5. レシピ表示（確認モード）
4と同一表示に以下が加わるだけ:
- 上部バナー: 面 #FDEEDA / 下境界 1px #F7B267 / padding 14px 16px / 17px 700 #7A4A12 /「確認画面 — 内容をチェック」
- 最下部固定バー: 面 #FFFFFF、上境界 1px #C8E4E8、影 `0 -4px 12px rgba(11,45,57,.06)`、padding 16px、縦 gap 10px、[この内容で決定]（主要）→[編集する]（副次）

### 6. レシピ編集
- ヘッダー（面 #E9F7F8、padding 6px 12px）: 左 `← 中止`（面なし）／中央「材料を編集」19px 700／右「保存」（面 #0B2D39・白文字・角丸8px・48px）
- 本文 padding 16px、gap 14px。**行カード**（面 #FFFFFF / 枠1px #C8E4E8 / 角丸12px / padding 14px / gap 10px）:
  - 1段目: 材料名入力（flex 1、min-width 0）＋ 分量入力（width 96px、flex none）、gap 10px、各 min-height 52px
  - 2段目: カテゴリselect（flex 1）＋ 削除ボタン（width 96px、危険スタイル）、各 min-height 52px
- 末尾に「＋ 行を追加」（枠1.5px dashed #0E6E7D、文字 #0E6E7D 19px 500、56px、幅100%）

---

## Interactions & Behavior
- **絞り込みタブ**: クリックで材料リストをフィルタ。ページ遷移・スクロール位置変更なし。選択は常に1つ。既定「全体」
- **ヘッダーの材料/作り方**: 同一ページ内アンカースクロール（`scrollIntoView` は使わず、コンテナの scrollTop 操作で実装）
- **← 一覧 / ← 中止**: 戻る遷移。編集中の場合は破棄確認ダイアログ
- **タイトル ✎**: インライン編集（テキスト入力に切り替え）
- **編集**: 画面6へ遷移
- **解析中**: 3段階を順に進行。段階変化のみ再描画。最大30秒でタイムアウト → エラー表示（撮り直す）
- **削除**: 常に確認ダイアログを経由（縦並びボタン）
- hover は面の明度のみ変化（主要 #123E4D、副次 #D8F3F6、危険 #FDECEA）。transition は 120ms ease で十分。**移動系リンクにhover装飾を足さない**
- focus は outline 3px #7AE7F2（キーボード操作時のみ visible）
- レスポンシブ: 一覧のみ 1列（〜767px）/ 3列（768px〜）。他の画面は単一カラムのまま max-width 640px で中央寄せ

## State Management
- `session`: Googleログイン状態
- `recipes[]`: { id, title, thumbnailUrl, createdAt }
- `recipe`: { id, title, servings, ingredients[{ id, name, qty, category }], steps[] }
- `analysis`: { phase: 'uploading' | 'ocr' | 'categorizing' | 'done' | 'error', progress }
- `activeFilter`: 'all' | 'veg' | 'season' | 'other'（既定 'all'）
- `mode`: 'view' | 'confirm' | 'edit'
- `dialog`: 削除確認の対象行 or null
- 遷移: 撮影 → analysis 進行 → done で mode='confirm' → 決定で 'view' / 編集で 'edit'

## Assets
- 画像は縞模様プレースホルダ（`repeating-linear-gradient(135deg, #DFF1F3 0 8px, #D2E8EB 8px 16px)`＋ monospace の説明文）。実装時はAPIのサムネイルURLに差し替え
- アイコンはテキストグリフのみ（← ↓ ✎ ＋ ✓ ×）。有料素材は不使用。OSSアイコンに差し替える場合はサイズ24px、色は文字色に追従
- フォントは Google Fonts の **Noto Sans JP**（400/500/700）。日本語フォールバックは Hiragino Sans → BIZ UDPGothic → Yu Gothic

## Files
- `Recipe Design System v2.dc.html` — **確定版デザインリファレンス**。セクション00（パレット）／00b（カテゴリ色の検討経緯）／01（移動と絞り込み）／02（カラートークン）／03（コントラスト検証）／04（タイポ・余白・角丸）／05（コンポーネント）／06（6画面モック + PC一覧）／07（@theme コード）
- `Recipe Design System.dc.html` — 初期の緑基調版（履歴。実装には使わない）
