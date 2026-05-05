# 🧾 GitHub Copilot CLI移植向け変更仕様

Codex Workspace拡張機能は、**GitHub Copilot CLI向けの設定・カスタマイズ管理拡張として移植する**方針にします。

廃止対象は最小限にし、Codex Workspace独自の価値である **Explore / Manager View / Template / 相互同期** は、GitHub Copilot CLIの公式ディレクトリ構成に寄せて継続します。

## ✅ 完了条件

- [x] GitHub Copilot CLI向けに全体仕様を再整理する
- [x] PROMPTSを廃止せず、CLI Commands / IDE Prompt Filesとして再定義する
- [x] Template Exploreを廃止せず、Codex Workspace独自機能として踏襲する
- [x] 各Exploreの同期を廃止せず、1対1固定にする
- [x] 各Exploreと対応するManager View単位で仕様を整理する

## 🧭 全体方針

| 項目 | Codex Workspace現行 | GitHub Copilot CLI移植後 |
| --- | --- | --- |
| 対象CLI | Codex CLI | GitHub Copilot CLI |
| 主設定ルート | `~/.codex` | `~/.copilot` |
| Workspace設定 | `.codex` | `.github`、`.claude`、`.copilot` |
| 設定形式 | TOML中心 | JSON / Markdown / YAML frontmatter中心 |
| PROMPTS | `.codex/prompts` | CLI Commands / IDE Prompt Files |
| Skills | `SKILL.md` + `config.toml` | `SKILL.md` + YAML frontmatter |
| AGENTS | TOMLサブエージェント | `.agent.md` custom agents |
| MCP | `config.toml` | `mcp-config.json` / `.github/mcp.json` |
| Template | `.codex/codex-templates` | `.copilot/templates` / `~/.copilot/templates` |
| Core | `config.toml`、`AGENTS.md` | `config.json`、instructions、permissions、logs |

## 🔄 同期の共通方針

同期は相互同期のため、**各Exploreにつき1対1固定**とします。

同期先のQuickPickは提供しません。同期対象の選択ミスによる上書き・削除同期事故を防ぐためです。

| Explore | 固定同期ペア | 備考 |
| --- | --- | --- |
| PROMPTS / CLI Commands | `.copilot/prompts/commands/` ↔ `.claude/commands/` | CLIスラッシュコマンド |
| PROMPTS / IDE Prompts | `.copilot/prompts/ide/` ↔ `.github/prompts/` | IDE Prompt Files |
| Skills | `.github/skills/` ↔ `~/.copilot/skills/` | 公式代表パス |
| AGENTS | `.github/agents/` ↔ `~/.copilot/agents/` | 公式代表パス |
| MCP | `.github/mcp.json` ↔ `~/.copilot/mcp-config.json` | JSONファイル同期 |
| Template | `.copilot/templates/` ↔ `~/.copilot/templates/` | 拡張独自機能 |
| Core | `.github/copilot-instructions.md` ↔ `~/.copilot/copilot-instructions.md` | Custom Instructions |

## 💬 PROMPTS Explore / Prompts Manager View

### 🏷️ 判定

PROMPTSは**廃止しません**。

GitHub Copilot CLI向けには **CLI Commands**、GitHub Copilot IDE向けには **IDE Prompt Files** として扱います。

### 🗂️ 対象保存場所

| 種別 | 表示名 | パス | 利用環境 | 編集 |
| --- | --- | --- | --- | --- |
| Workspace CLI Command | Workspace CLI Command | `.claude/commands/` | Copilot CLI | 可 |
| Workspace IDE Prompt | Workspace IDE Prompt | `.github/prompts/` | VS Code / Visual Studio / JetBrains | 可 |
| Workspace Command Library | Workspace Command Library | `.copilot/prompts/commands/` | 同期元 | 可 |
| Workspace Prompt Library | Workspace Prompt Library | `.copilot/prompts/ide/` | 同期元 | 可 |
| Plugin Command | Plugin Command | `~/.copilot/installed-plugins/**/commands/` | Copilot CLI | 不可 |
| System Command | System Command | Copilot CLI組み込み | Copilot CLI | 不可 |

### 📄 新規ファイル

PROMPTS Exploreで新規ファイルを追加する場合、QuickPickで作成先を選択します。

| QuickPick表示名 | 保存先 | 保存形式 |
| --- | --- | --- |
| Workspace CLI Command | `.claude/commands/` | `xxx.md` |
| Workspace IDE Prompt | `.github/prompts/` | `xxx.prompt.md` |

入力名の補正は以下とします。

| 選択 | 入力例 | 保存名 |
| --- | --- | --- |
| Workspace CLI Command | `review` | `review.md` |
| Workspace CLI Command | `review.md` | `review.md` |
| Workspace IDE Prompt | `review` | `review.prompt.md` |
| Workspace IDE Prompt | `review.md` | `review.prompt.md` |
| Workspace IDE Prompt | `review.prompt.md` | `review.prompt.md` |

### 📋 一覧項目

| 表示項目 | 内容 |
| --- | --- |
| 名前 | コマンド名またはPrompt名 |
| 種別 | `CLI Command` / `IDE Prompt` / `Library` / `Plugin` / `System` |
| スコープ | `Workspace` / `User` / `Plugin` / `System` |
| 利用環境 | `Copilot CLI` / `IDE` |
| 説明 | frontmatterの `description` |
| パス | 実体パス |
| 編集可否 | 読み取り専用かどうか |

### 🔄 同期

PROMPTS同期は、同期ボタン押下後にカテゴリを選択させず、対象カテゴリごとに固定します。

| 同期種別 | 固定同期ペア |
| --- | --- |
| CLI Commands Sync | `.copilot/prompts/commands/` ↔ `.claude/commands/` |
| IDE Prompts Sync | `.copilot/prompts/ide/` ↔ `.github/prompts/` |

### 🖥️ Prompts Manager View

Prompts Manager Viewは追加対象とします。

| 表示項目 | 内容 |
| --- | --- |
| 名前 | frontmatterの `name` またはファイル名 |
| 説明 | `description` |
| 種別 | CLI Command / IDE Prompt |
| 利用環境 | CLI / IDE |
| 保存場所 | Workspace / Library / Plugin / System |
| ファイルパス | 絶対パス |
| 開く | 対象Markdownを開く |

### 🚫 提供しない操作

- System Commandの編集
- Plugin Commandの編集
- `.copilot/prompts` を公式読込対象として表示すること
- 同期先の任意選択

## 🧠 Skills Explore / Skill Manager View

### 🏷️ 判定

Skillsは継続します。

### 🗂️ 対象保存場所

| 種別 | 表示名 | パス | 編集 | 同期対象 |
| --- | --- | --- | --- | --- |
| Workspace Skill | Workspace Skill | `.github/skills/` | 可 | 対象 |
| Workspace Skill Compatible | Workspace Compatible Skill | `.agents/skills/` | 可 | 対象外 |
| Workspace Skill Compatible | Workspace Claude-compatible Skill | `.claude/skills/` | 可 | 対象外 |
| User Skill | User Skill | `~/.copilot/skills/` | 可 | 対象 |
| User Skill Compatible | User Compatible Skill | `~/.agents/skills/` | 可 | 対象外 |
| User Skill Compatible | User Claude-compatible Skill | `~/.claude/skills/` | 可 | 対象外 |
| Plugin Skill | Plugin Skill | `~/.copilot/installed-plugins/**/skills/` | 不可 | 対象外 |

### 📋 Skill Manager View一覧項目

| 表示項目 | 取得元 |
| --- | --- |
| Skill名 | `SKILL.md` frontmatterの `name` |
| 説明 | `description` |
| 保存場所 | Workspace / User / Plugin / Compatible |
| ファイルパス | `SKILL.md` の絶対パス |
| 許可ツール | `allowed-tools` |
| 手動呼び出し可否 | `user-invocable` |
| 自動呼び出し抑止 | `disable-model-invocation` |
| 開く | `SKILL.md` |

### 🔄 同期

Skills同期は以下の1対1固定とします。

| Workspace側 | User側 |
| --- | --- |
| `.github/skills/` | `~/.copilot/skills/` |

### 🚫 廃止・変更する操作

- Codex CLI向けの `[[skills.config]]` 更新は廃止
- Skillの有効/無効トグルは廃止
- 代わりにfrontmatterの編集を提供
- Plugin Skillは読み取り専用

## 🧑‍💻 AGENTS Explore / AGENTS Manager View

### 🏷️ 判定

AGENTSは継続します。

ただし、CodexのTOMLサブエージェントから、Copilot CLIの **Custom Agents** に変更します。

### 🗂️ 対象保存場所

| 種別 | 表示名 | パス | 編集 | 同期対象 |
| --- | --- | --- | --- | --- |
| Workspace Agent | Workspace Agent | `.github/agents/` | 可 | 対象 |
| User Agent | User Agent | `~/.copilot/agents/` | 可 | 対象 |
| Plugin Agent | Plugin Agent | `~/.copilot/installed-plugins/**/agents/` | 不可 | 対象外 |
| System Agent | System Agent | Copilot CLI組み込み | 不可 | 対象外 |

### 📄 新規ファイル

- Workspace作成時は `.github/agents/<name>.agent.md` に保存する。
- User作成時は `~/.copilot/agents/<name>.agent.md` に保存する。
- 拡張子なし入力時は `.agent.md` を付与する。
- `.md` 入力時も `.agent.md` に補正する。

### 📋 AGENTS Manager View一覧項目

| 表示項目 | 取得元 |
| --- | --- |
| Agent ID | ファイル名 |
| 名前 | frontmatterの `name` |
| 説明 | `description` |
| モデル | `model` |
| 利用ツール | `tools` |
| MCPサーバー | `mcp-servers` |
| 手動呼び出し可否 | `user-invocable` |
| 自動推論呼び出し抑止 | `disable-model-invocation` |
| 保存場所 | Workspace / User / Plugin / System |
| 開く | `.agent.md` |

### 🔄 同期

AGENTS同期は以下の1対1固定とします。

| Workspace側 | User側 |
| --- | --- |
| `.github/agents/` | `~/.copilot/agents/` |

### 🚫 廃止・変更する操作

- `config.toml` の `[agents.<name>]` 追加・削除は廃止
- `agents-disabled.json` 退避・復元は廃止
- `config_file` 解決は廃止
- `sandbox_mode` 表示は廃止
- `model_reasoning_effort` 表示は廃止
- ON/OFFトグルは廃止し、frontmatter管理に変更

## 🔌 MCP Explore / MCP Manager View

### 🏷️ 判定

MCPは継続します。

ただし、CodexのTOML設定ではなく、Copilot CLIのJSON設定へ移行します。

### 🗂️ 対象

| 種別 | 表示名 | パス | 編集 | 同期対象 |
| --- | --- | --- | --- | --- |
| Workspace MCP | Workspace MCP | `.github/mcp.json` | 可 | 対象 |
| Workspace MCP Compatible | Workspace MCP Compatible | `.mcp.json` | 可 | 対象外 |
| User MCP | User MCP | `~/.copilot/mcp-config.json` | 可 | 対象 |
| Plugin MCP | Plugin MCP | plugin内MCP設定 | 不可 | 対象外 |
| Session MCP | Session MCP | `--additional-mcp-config` | 表示対象外 | 対象外 |

### 🖥️ MCP Manager View編集項目

| 項目 | 対応 |
| --- | --- |
| サーバー名 | JSONキー |
| Transport | `local` / `stdio` / `http` / `sse` |
| Command | local / stdio時 |
| Args | local / stdio時 |
| URL | http / sse時 |
| Env | `env` |
| Headers | `headers` |
| Tools | `tools` |
| CWD | `cwd` |
| Timeout | `timeout` |
| OAuth Client ID | `oauthClientId` |
| Public Client | `oauthPublicClient` |
| OIDC | `oidc` |
| Filter Mapping | `filterMapping` |

### 🔄 同期

MCP同期は以下の1対1固定とします。

| Workspace側 | User側 |
| --- | --- |
| `.github/mcp.json` | `~/.copilot/mcp-config.json` |

### 🚫 廃止・変更する操作

- `enabled = true / false` のTOMLパッチは廃止
- MCP Explore上のON/OFFトグルは廃止
- `enabled_tools` / `disabled_tools` の二分管理は廃止
- TOMLコメント保持処理は廃止
- `.mcp.json` は表示対象にできるが、同期対象にはしない

## 📦 Template Explore / Template Manager View

### 🏷️ 判定

Template Exploreは**廃止しません**。

これはGitHub Copilot CLI公式機能ではなく、**Codex Workspace独自のファイル作成支援機能**として踏襲します。

### 🗂️ 対象保存場所

| 種別 | 表示名 | パス | 編集 | 同期対象 |
| --- | --- | --- | --- | --- |
| Workspace Template | Workspace Template | `.copilot/templates/` | 可 | 対象 |
| User Template | User Template | `~/.copilot/templates/` | 可 | 対象 |

### 🔄 同期

Template同期は以下の1対1固定とします。

| Workspace側 | User側 |
| --- | --- |
| `.copilot/templates/` | `~/.copilot/templates/` |

### 🚫 Manager View

Template Manager Viewは追加しません。

### ⚠️ 注意点

- TemplateはCopilot CLIの公式読込対象とは表示しない。
- Templateは拡張機能内のファイル作成支援として扱う。
- Templateの同期は公式準拠ではなく、Codex Workspace互換の独自機能として扱う。

## 🧭 Copilot Core Explore / Copilot Core View

### 🏷️ 判定

Codex Coreは **Copilot Core** に変更します。

### 📂 Copilot Core Explore表示項目

| 表示項目 | パス |
| --- | --- |
| User config | `~/.copilot/config.json` |
| User MCP config | `~/.copilot/mcp-config.json` |
| Permissions config | `~/.copilot/permissions-config.json` |
| User agents | `~/.copilot/agents/` |
| User skills | `~/.copilot/skills/` |
| User hooks | `~/.copilot/hooks/` |
| Logs | `~/.copilot/logs/` |
| Session state | `~/.copilot/session-state/` |
| Installed plugins | `~/.copilot/installed-plugins/` |
| Repository instructions | `.github/copilot-instructions.md` |
| Path instructions | `.github/instructions/**/*.instructions.md` |
| Agent instructions | `AGENTS.md` |
| Workspace MCP | `.github/mcp.json` |
| Workspace prompt files | `.github/prompts/` |
| Workspace CLI commands | `.claude/commands/` |

### 🖥️ Copilot Core Viewタブ

| タブ | 内容 |
| --- | --- |
| Configuration | `config.json` を表示 |
| Custom Instructions | `.github/copilot-instructions.md`、`.github/instructions/**/*.instructions.md`、`AGENTS.md`、`~/.copilot/copilot-instructions.md` |
| Permissions | `permissions-config.json` の確認 |
| Logs / Session State | `logs/`、`session-state/` の一覧とフォルダを開く |
| Plugins | installed pluginsの一覧 |
| Diagnostics | parseエラー、競合、読み取り不可、同期対象外の警告 |

### 🔄 同期

Core同期は以下の1対1固定とします。

| Workspace側 | User側 |
| --- | --- |
| `.github/copilot-instructions.md` | `~/.copilot/copilot-instructions.md` |

### 🚫 廃止・変更する操作

- `config.toml` 表示は廃止
- `AGENTS.override.md` は廃止
- AGENTS Loading Chainは廃止
- 会話履歴プレビューは廃止
- 信頼するディレクトリ追加・削除は廃止
- `permissions-config.json` は原則読み取り中心にする
- `logs/`、`session-state/` は同期対象外にする

## 🧪 テスト観点

| 対象 | 確認内容 |
| --- | --- |
| 共通 | `~/.copilot` を検出できる |
| 共通 | `COPILOT_HOME` 指定時に対象ディレクトリを切り替えられる |
| 共通 | JSON parseエラー時に該当操作だけ無効化できる |
| PROMPTS | `.claude/commands/*.md` をCLI Commandとして表示できる |
| PROMPTS | `.github/prompts/*.prompt.md` をIDE Promptとして表示できる |
| PROMPTS | 新規作成時に保存先ごとの拡張子補正ができる |
| PROMPTS | `.copilot/prompts/commands` と `.claude/commands` を1対1同期できる |
| PROMPTS | `.copilot/prompts/ide` と `.github/prompts` を1対1同期できる |
| Skills | `.github/skills` と `~/.copilot/skills` を検出できる |
| Skills | `SKILL.md` frontmatterを表示できる |
| Skills | Plugin Skillを読み取り専用にできる |
| Skills | `.github/skills` と `~/.copilot/skills` を1対1同期できる |
| AGENTS | `.github/agents/*.agent.md` と `~/.copilot/agents/*.agent.md` を検出できる |
| AGENTS | `.agent.md` frontmatterを表示できる |
| AGENTS | `.github/agents` と `~/.copilot/agents` を1対1同期できる |
| MCP | `.github/mcp.json` と `~/.copilot/mcp-config.json` を読み書きできる |
| MCP | `.mcp.json` を同期対象外として表示できる |
| Template | `.copilot/templates` と `~/.copilot/templates` を1対1同期できる |
| Core | `.github/copilot-instructions.md` と `~/.copilot/copilot-instructions.md` を1対1同期できる |
| Core | `permissions-config.json` を読み取り中心で表示できる |
| Core | `logs/` と `session-state/` を同期対象外にできる |

## 🔒 制約事項

- 同期は各Exploreにつき1対1固定とする。
- 同期先選択QuickPickは提供しない。
- 表示対象と同期対象を分離する。
- 公式読込パスが複数ある場合でも、同期対象は代表パスだけにする。
- TemplateはCopilot CLI公式機能ではなく、拡張独自機能として扱う。
- `.copilot/prompts` は公式読込対象ではなく、同期用ライブラリとして扱う。
- Plugin由来のAgents、Skills、Commands、MCPは読み取り専用とする。
- `permissions-config.json`、`logs/`、`session-state/` は同期対象外とする。
- Manager ViewはWebviewPanelで単一インスタンスとする。
- 多言語対応は日本語と英語を維持する。

## ⚠️ 保留事項

- User IDE Promptの実体保存場所はIDEごとに異なるため、初期リリースでは同期対象外とする。
- `.claude/commands/` のUser側公式保存先が明確でないため、CLI Command同期は `.copilot/prompts/commands/` ↔ `.claude/commands/` に固定する。
- `.agents/skills/`、`.claude/skills/`、`~/.agents/skills/`、`~/.claude/skills/` は表示対象に含めるが、同期対象外とする。
- `.mcp.json` は表示対象に含めるが、同期対象外とする。
- 会話履歴プレビューは、Copilot CLIのログ形式が安定仕様として扱える場合のみ将来再検討する。

## ✅ まとめ

移植後の構成は以下とします。

| View | 方針 |
| --- | --- |
| PROMPTS Explore | CLI Commands / IDE Promptsとして継続 |
| Prompts Manager View | 追加 |
| Skills Explore | Copilot Skillsとして継続 |
| Skill Manager View | frontmatter管理へ変更 |
| AGENTS Explore | Copilot Custom Agentsとして継続 |
| AGENTS Manager View | `.agent.md` 管理へ変更 |
| MCP Explore | Copilot MCP設定として継続 |
| MCP Manager View | JSON MCP設定管理へ変更 |
| Template Explore | Codex Workspace独自機能として継続 |
| Template Manager View | 追加しない |
| Copilot Core Explore | Codex Coreから置換 |
| Copilot Core View | 設定・Instructions・Permissions・Logs・Plugins中心へ変更 |

## 🔗 参考資料

- GitHub Copilot CLI configuration directory: <https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference>
- GitHub Copilot CLI plugin reference: <https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference>
- Adding custom instructions for GitHub Copilot CLI: <https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions>
- Creating and using custom agents for GitHub Copilot CLI: <https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli>
- Use prompt files in VS Code: <https://code.visualstudio.com/docs/copilot/customization/prompt-files>
- About customizing GitHub Copilot responses: <https://docs.github.com/en/copilot/concepts/prompting/response-customization>