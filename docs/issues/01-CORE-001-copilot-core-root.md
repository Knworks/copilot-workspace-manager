---
id: `CORE-001`
title: `Copilot CLI Core ルートと設定導線へ移行する`
status: Reviewing
---

# 🧾 `CORE-001 Copilot CLI Core ルートと設定導線へ移行する`

## 🎯 背景/目的

- 旧Codex CLI前提の `~/.codex/config.toml` ではなく、GitHub Copilot CLI の `COPILOT_HOME` / `~/.copilot` を拡張の基準ルートにする。
- Core Explorer と同期導線を Copilot Core の設定・Instructions 管理に合わせる。

## 📌 要件

- `specification-changes.md` 全体方針: 主設定ルートは `~/.copilot`、設定形式は JSON / Markdown / YAML frontmatter。
- `specification-changes.md` Copilot Core Explore: `config.json`、`mcp-config.json`、`permissions-config.json`、instructions、logs、session-state、installed-plugins を扱う。
- `specification-changes.md` Core同期: `.github/copilot-instructions.md` ↔ `~/.copilot/copilot-instructions.md` の1対1固定。

## 🛠️ スコープ / 作業内容

- `workspaceStatus` と関連呼び出しを Copilot CLI ルート解決へ移行する。
- `package.json` の同期設定名を `copilotFolder` へ移行し、Core同期メニュー条件を更新する。
- Core Explorer の表示対象とフォルダを開くコマンドを Copilot Core 向けに変更する。
- Core同期処理を repository/user instructions の固定ペアへ変更する。
- 対応する単体テストを更新する。

## ✅ AC（受け入れ基準）

- [x] [機能] `COPILOT_HOME` が設定されている場合、そのパスを Copilot CLI 設定ルートとして使う。
- [x] [機能] `COPILOT_HOME` 未設定時は `~/.copilot` を設定ルートとして使う。
- [x] [UI/UX] Core Explorer に Copilot Core の対象ファイル/フォルダだけが表示される。
- [x] [状態/エラー] Core修復導線は `config.json` の parse/read エラー時も残る。
- [x] [テスト] path resolver、Core Explorer、Core同期の単体テストが更新されている。

## 🔗 依存関係

- DependsOn: `なし`

## 🧪 テスト観点

- ユニット: `COPILOT_HOME` / default home のパス解決。
- ユニット: Core Explorer の表示対象。
- ユニット: `.github/copilot-instructions.md` と `~/.copilot/copilot-instructions.md` の同期。
- 検証方法: `npm run check-types`、`npm run lint`、関連テスト。
