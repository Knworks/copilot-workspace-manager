---
id: `PROMPT-001`
title: `Prompts Explore を CLI Commands / IDE Prompt Files へ移行する`
status: Reviewing
---

# 🧾 `PROMPT-001 Prompts Explore を CLI Commands / IDE Prompt Files へ移行する`

## 🎯 背景/目的

- PROMPTS は廃止せず、Copilot CLI の CLI Commands と VS Code / IDE Prompt Files として扱う。
- 同期は任意選択を廃止し、カテゴリごとの1対1固定にする。

## 📌 要件

- `specification-changes.md` PROMPTS Explore: `.claude/commands/` と `.github/prompts/` を作成・編集対象にする。
- `specification-changes.md` PROMPTS同期: `.copilot/prompts/commands/` ↔ `.claude/commands/`、`.copilot/prompts/ide/` ↔ `.github/prompts/`。
- `specification-changes.md` 提供しない操作: `.copilot/prompts` を公式読込対象として表示しない。

## 🛠️ スコープ / 作業内容

- Prompts Explorer のルートを CLI Commands / IDE Prompt Files / 同期ライブラリに分離する。
- 新規ファイル作成時の保存先QuickPickと拡張子補正を実装する。
- `syncPrompts` を2つの固定ペア同期へ変更する。
- 対応する単体テストを追加・更新する。

## ✅ AC（受け入れ基準）

- [x] [機能] `.claude/commands/*.md` を CLI Command として表示できる。
- [x] [機能] `.github/prompts/*.prompt.md` を IDE Prompt として表示できる。
- [x] [UI/UX] 新規作成時に Workspace CLI Command / Workspace IDE Prompt を選べる。
- [x] [状態/エラー] `.copilot/prompts` は同期ライブラリとして扱われ、公式読込対象として表示されない。
- [x] [テスト] 拡張子補正と固定同期ペアがテストされている。

## 🔗 依存関係

- DependsOn: `#1`

## 🧪 テスト観点

- ユニット: `review`、`review.md`、`review.prompt.md` の保存名補正。
- ユニット: CLI Commands / IDE Prompts の固定ペア同期。
- 検証方法: `npm run check-types`、`npm run lint`、関連テスト。
