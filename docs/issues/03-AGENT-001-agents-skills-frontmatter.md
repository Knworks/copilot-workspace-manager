---
id: `AGENT-001`
title: `Agents / Skills を frontmatter ベースの Copilot仕様へ移行する`
status: Reviewing
---

# 🧾 `AGENT-001 Agents / Skills を frontmatter ベースの Copilot仕様へ移行する`

## 🎯 背景/目的

- Codex TOMLサブエージェントと `config.toml` 連携を廃止し、Copilot CLI Custom Agents の `.agent.md` 管理へ移行する。
- Skills は `SKILL.md` frontmatter を表示し、同期対象を `.github/skills` と `~/.copilot/skills` に固定する。

## 📌 要件

- `specification-changes.md` AGENTS: `.github/agents/` と `~/.copilot/agents/` の `.agent.md` を扱う。
- `specification-changes.md` AGENTS廃止操作: `[agents.<name>]`、`agents-disabled.json`、ON/OFFトグルを廃止する。
- `specification-changes.md` Skills: `.github/skills/` ↔ `~/.copilot/skills/` を同期対象とする。

## 🛠️ スコープ / 作業内容

- Agent location、Explorer、作成・編集・削除、Manager表示を `.agent.md` + frontmatter に変更する。
- Agent有効/無効トグルと disabled store 連携を削除する。
- Skill location と同期対象を Copilot 公式代表パスへ変更する。
- 対応する単体テストを更新する。

## ✅ AC（受け入れ基準）

- [x] [機能] `.github/agents/*.agent.md` と `~/.copilot/agents/*.agent.md` を検出できる。
- [x] [機能] Agent frontmatter の `name` / `description` / `model` / `tools` を Manager View に表示できる。
- [x] [UI/UX] Agent追加時に `.agent.md` 拡張子へ補正される。
- [x] [状態/エラー] ON/OFFトグル、`agents-disabled.json`、`config_file` 解決は使われない。
- [x] [テスト] Agent/Skill location、作成、Manager表示、同期がテストされている。

## 🔗 依存関係

- DependsOn: `#1`

## 🧪 テスト観点

- ユニット: `.agent.md` 拡張子補正。
- ユニット: frontmatter抽出。
- ユニット: `.github/skills` ↔ `~/.copilot/skills` 固定同期。
- 検証方法: `npm run check-types`、`npm run lint`、関連テスト。
