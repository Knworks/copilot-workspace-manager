---
id: `MCP-001`
title: `MCP JSON管理と旧Codex名称の除去を完了する`
status: Reviewing
---

# 🧾 `MCP-001 MCP JSON管理と旧Codex名称の除去を完了する`

## 🎯 背景/目的

- MCP 管理を Codex TOML の `enabled` パッチから Copilot CLI の JSON 設定管理へ移行する。
- コード・設定・ローカライズに旧Codex拡張由来の名称が残らない状態にする。

## 📌 要件

- `specification-changes.md` MCP: `.github/mcp.json` と `~/.copilot/mcp-config.json` を扱う。
- `specification-changes.md` MCP廃止操作: TOML `enabled` トグル、`enabled_tools` / `disabled_tools` を廃止する。
- `specification-changes.md` 制約事項: 表示対象と同期対象を分離し、Plugin由来は読み取り専用にする。

## 🛠️ スコープ / 作業内容

- MCP service / Explorer / Manager を JSON設定の読み取り・表示へ移行する。
- `.mcp.json` は表示対象に含めるが同期対象外にする。
- パッケージメタデータ、コマンド名、ローカライズ、テスト名から旧Codex前提の表現を除去する。
- 旧名称残存チェックをテストまたは検証コマンドに含める。

## ✅ AC（受け入れ基準）

- [x] [機能] `.github/mcp.json` と `~/.copilot/mcp-config.json` から MCP server を読み取れる。
- [x] [機能] `.mcp.json` は表示対象だが同期対象外として扱われる。
- [x] [UI/UX] MCP Explorer に ON/OFF トグルは表示されない。
- [x] [A11y/I18N] 日本語・英語の表示文言が Copilot CLI 前提へ更新される。
- [x] [テスト] JSON MCP解析と旧名称残存チェックが検証されている。

## 🔗 依存関係

- DependsOn: `#1`

## 🧪 テスト観点

- ユニット: JSON MCP server の抽出。
- ユニット: 旧TOMLトグルコマンドが登録されない。
- 検証: `rg -n "Codex|codex|\\.codex|config\\.toml"` の残存確認。
- 検証方法: `npm run check-types`、`npm run lint`、関連テスト。
