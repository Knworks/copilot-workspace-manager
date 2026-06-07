# 🧰 Copilot Workspace Manager

Copilot Workspace Manager は、GitHub Copilot CLI / IDE の設定やカスタマイズ資産を VS Code からまとめて見渡し、すばやく管理できる拡張機能です。`~/.copilot`、ワークスペース配下、installed plugin 配下に散らばりがちな `config.json`、`settings.json`、`copilot-instructions.md`、Commands、Skills、Sub Agents、MCP、Templates、会話履歴、Hooks、Plugin diagnostics を ひとつの導線に集約し、迷わず確認・管理できます。

![alt text](images/view_main.png)

## 🚀 クイックスタート

1. GitHub Copilot が利用可能で、Copilot home ディレクトリが存在することを確認します。  
   - 既定では `~/.copilot` を参照します。  
   - `COPILOT_HOME` が設定されている場合は、そのパスを優先します。
2. ワークスペースを VS Code で開きます。
3. Activity Bar から Copilot Workspace Manager を開きます。
4. 各 Explore のタイトルバーから、次の操作を実行できます。  
   - 対応 View でファイル / フォルダを追加する  
   - 対象フォルダを開く  
   - 表示内容を更新する  
   - 対応 View で同期を実行する  
   - 関連する Manager View を開く
5. Core View または Command Palette から Copilot Manager を開き、次を確認します。  
   - `History`  
   - `Instructions Chain`  
   - `Trusted`  
   - `Hooks`  
   - `Plugins`

## ✨ 主な機能

- `Copilot Manager`、`Sub Agents`、`Skills`、`Commands`、`MCP Server`、`Templates` の専用 Explore View
- `config.json`、`settings.json`、`mcp-config.json`、instruction files へのワンクリック導線
- 対応 View でのファイル / フォルダ追加、リネーム、削除
- Workspace / User / Plugin をまたいだ Skills 一覧
- Workspace / User / Plugin をまたいだ Sub Agents 一覧
- Skills、Sub Agents、MCP Server 用の専用 Manager View
- `AGENTS Manager` 内の視覚的な `Orchestration Editor` で workflow / agent / loop グラフを設計し、バリデーションと prompt 生成を行える
- Session history、Instructions diagnostics、Trusted directories、Hooks、Plugin diagnostics をまとめた `Copilot Manager` Webview
- plugin が提供する `Agents`、`Skills`、`Commands`、`Hooks`、`MCP Servers`、`LSP Servers` の readonly diagnostics
- Core files、Skills、Templates、Sub Agents の双方向同期

## 🧭 Views

### 🧩 Copilot Manager

Core Explore からは、次へアクセスできます。

- `config.json`
- User `settings.json`
- Workspace `settings.json`
- Workspace `settings.local.json`
- `mcp-config.json`
- User / Workspace instruction files
- `.copilot` フォルダ
- `Copilot Manager`
- `copilot-workspace-manager.copilotFolder` を使った Core sync

`Copilot Manager` は editor Webview として開き、現状は次のタブを持ちます。

- `History`  
  - `~/.copilot/session-state/<session>/events.jsonl` から会話履歴を読みます。  
  - 検索、コピー、turn detail の確認に対応しています。  
  - 新しい session から順に表示します。
- `Instructions Chain`  
  - 現在検出されている instruction sources を表示します。  
  - user instructions、workspace instructions、path instructions、workspace `AGENTS.md`、`COPILOT_CUSTOM_INSTRUCTIONS_DIRS` の custom instructions を含みます。  
  - path instructions の `applyTo` を、アクティブファイルに対して評価します。
- `Trusted`  
  - User / Workspace の `settings.json` から trusted folders を一覧表示します。  
  - 追加と削除に対応しています。
- `Hooks`  
  - `.github/hooks/*.json` の workspace hooks を表示します。  
  - plugin hooks の source と entries を表示します。
- `Plugins`  
  - `~/.copilot/config.json` から installed plugins を読みます。  
  - `~/.copilot/settings.json` の enabled state override を反映します。  
  - manifest path、plugin root、install kind、component diagnostics を表示します。  
  - `Agents`、`Skills`、`Commands`、`Hooks`、`MCP Servers`、`LSP Servers`、`Diagnostics` を表示します。

![alt text](images/view_copilot.png)

### 🧑‍💻 Sub Agents

次のロケーションの Sub Agents を扱います。

- Workspace Agents  
  - `<workspace>/.github/agents`  
  - `<workspace>/.claude/agents`
- User Agents  
  - `~/.copilot/agents`
- Plugin Agents  
  - installed plugin manifest から解決した agent roots

`Sub Agents Manager` では、`model`、`tools`、`mcp-servers`、`user-invocable`、`disable-model-invocation` などの frontmatter 項目を確認できます。plugin agents は readonly として表示されます。

![alt text](images/view_subagents.png)

### Orchestration Editor

`Orchestration Editor` は `AGENTS Manager` の `Orchestration` タブから利用できます。

- canvas 上で `workflow` / `agent` / `loop` card を使った workflow グラフを作成・編集できます
- Inspector から agent の順序、使用する subagent、委譲目的、入力、期待する出力、完了条件を設定できます
- `maxAttempts` と `acceptanceCriteria` を持つ review / retry loop を設定できます
- workflow JSON を `~/.codex/.codex-workspace/orchestrations` 配下へ保存できます
- 編集中に必須項目不足、不正な接続、未到達 node、重複 ID、循環をバリデーションできます
- 保存前でも現在のグラフから prompt preview を生成し、そのままコピーできます

![alt text](images/view_orchestration.png)

### 🧠 Skills

次の複数ロケーションの Skills を、ひとつの Explore View で扱います。

- Workspace Skills  
  - `<workspace>/.github/skills`  
  - `<workspace>/.agents/skills`  
  - `<workspace>/.claude/skills`
- User Skills  
  - `~/.copilot/skills`  
  - `~/.agents/skills`  
  - `~/.claude/skills`
- Plugin Skills  
  - installed plugin manifest から解決した skill roots

`Skill Manager` では、検索、open、enabled / disabled の切り替えができます。skill の状態は `~/.copilot/settings.json` の `disabledSkills` を使って管理します。

![alt text](images/view_subagents.png)

### 🛰 MCP Server

`MCP Server` は Explore View で一覧を確認し、専用の `MCP Manager` で詳細編集を行えます。

Explore View では、次を統合して表示します。

- `~/.copilot/mcp-config.json` の enabled MCP
- `~/.copilot/.copilot-workspace-manager/mcp-config.disabled.json` の disabled MCP
- plugin manifest 由来の readonly MCP

`MCP Manager` では、次が可能です。

- 検索
- MCP server definition の追加、編集、削除
- enabled / disabled の切り替え
- `local`、`stdio`、`http`、`sse` definition の編集
- `args`、`env`、`headers`、`tools`、`timeout`、OAuth、filter mapping の編集

![alt text](images/view_mcp.png)

### 🧰 Commands

`<workspace>/.claude/commands` の workspace commands と、installed plugin が提供する command roots を、ひとつの Explore View で扱います。

- workspace commands は file actions で編集できます
- plugin commands は source label 付きで表示されます
- 現状、専用の Commands Manager はありません
- 現状、Commands 専用の同期設定はありません

### 🗂 Templates

`~/.copilot/.copilot-workspace-manager/templates` 配下の templates を扱います。

- template content を使った file creation に対応します
- `copilot-workspace-manager.templatesFolder` との同期に対応します
- 現状、専用の Templates Manager はありません

## ⌨️ Commands

| Command | 説明 |
| --- | --- |
| `Copilot Workspace Manager: Open Copilot Manager` | `Copilot Manager` Webview を開きます |
| `Copilot Workspace Manager: Open Skill Manager` | `Skill Manager` Webview を開きます |
| `Copilot Workspace Manager: Open Sub Agents Manager` | `Sub Agents Manager` Webview を開きます |
| `Copilot Workspace Manager: Open MCP Manager` | `MCP Manager` Webview を開きます |
| `Copilot Workspace Manager: Open .copilot Folder` | `.copilot` フォルダを OS のファイラーで開きます |
| `Copilot Workspace Manager: Open Agents Folder` | 現在の選択または workspace context に応じて agents フォルダを開きます |
| `Copilot Workspace Manager: Refresh` | 対応する Explore View を更新します |
| `Copilot Workspace Manager: Sync` | 対応するフォルダ設定がある場合に、タイトルバー操作から同期を実行します |

## ⚙️ Settings

| Key | Type | Default | 説明 |
| --- | --- | --- | --- |
| `copilot-workspace-manager.copilotFolder` | string | `""` | `~/.copilot/config.json`、`~/.copilot/settings.json`、`~/.copilot/mcp-config.json`、`~/.copilot/copilot-instructions.md`、および `.copilot-workspace-manager` 配下の disabled MCP config の同期先 |
| `copilot-workspace-manager.skillsFolder` | string | `""` | `~/.copilot/skills` の同期先 |
| `copilot-workspace-manager.templatesFolder` | string | `""` | `~/.copilot/.copilot-workspace-manager/templates` の同期先 |
| `copilot-workspace-manager.agentFolder` | string | `""` | `~/.copilot/agents` の同期先 |
| `copilot-workspace-manager.maxSessionHistoryCount` | number | `100` | Session History に表示する最大件数。新しいものから表示します |

## 📄 License

MIT
