# 🧾 Copilot Workspace Manager 要件定義書

## 1. 🎯 背景と目的

- GitHub Copilot CLI / GitHub Copilot IDE まわりの設定ファイル、instructions、commands、skills、agents、MCP 設定、plugin 情報を VS Code 内から確認・編集しやすくする。
- `~/.copilot`、ワークスペース配下の `.github` / `.claude` / `.agents`、installed plugin 配下に分散するファイルの参照導線をまとめる。
- 特に Explore と Manager View で、Workspace / User / Plugin のスコープ差、readonly 状態、enabled 状態、競合診断を視覚的に確認できるようにする。

---

## 2. 👥 利用者とステークホルダー

- 利用者
  - GitHub Copilot CLI / IDE の設定や instructions、commands、skills、agents、MCP を編集する開発者
  - installed plugin が提供する commands / skills / agents / hooks / MCP / LSP を確認したい開発者
- ステークホルダー
  - 拡張機能開発者
  - GitHub Copilot CLI / IDE を運用する利用者

---

## 3. 📚 用語・ドメイン定義

| 用語 | 定義 | 備考 |
| --- | --- | --- |
| `~/.copilot` | GitHub Copilot のユーザースコープ設定ルート | `COPILOT_HOME` が設定されている場合はその値を優先する |
| `config.json` | ユーザースコープの Copilot 設定ファイル | installed plugin 情報の一次情報でもある |
| `settings.json` | ユーザースコープ設定ファイル | `disabledSkills`、`enabledPlugins` などの上書き状態を保持する |
| `mcp-config.json` | 有効な MCP 定義を保持する JSON | `mcpServers` または `servers` を読む |
| `.copilot-workspace-manager/mcp-config.disabled.json` | 無効な MCP 定義を保持する JSON | ON/OFF 切替時に `mcp-config.json` と相互移送する |
| `.copilot-workspace-manager/templates/` | Templates Explorer の保存先 | `~/.copilot/.copilot-workspace-manager/templates/` |
| `.copilot-workspace-manager/orchestrations/` | Orchestration Editor の保存先 | orchestration 定義 JSON を保持する |
| `.copilot-workspace-manager/copilot-workspace-sync.json` | 相互同期用の状態ファイル | Core / Skills / Templates / Agents 同期の削除判定に使用する |
| `.claude/commands/` | `Commands` View が扱う workspace command ルートの 1 つ | `*.md` を command file として扱う |
| `.github/prompts/` | `Commands` View が扱う workspace prompt ルートの 1 つ | `*.prompt.md` を prompt file として扱う |
| `.github/skills/` | workspace skills の代表ルート | `.agents/skills/`、`.claude/skills/` も併読する |
| `.github/agents/` | workspace agents の代表ルート | `.claude/agents/` も併読する |
| installed plugin | `config.json.installedPlugins` に列挙された plugin | `settings.json.enabledPlugins` による有効状態上書きを受ける |
| plugin manifest | plugin の定義ファイル | 探索順は `.plugin/plugin.json` → `plugin.json` → `.github/plugin/plugin.json` → `.claude-plugin/plugin.json` |
| Core Explorer | Core 設定ファイル群を開く Tree View | `config.json`、`settings.json`、workspace settings、`mcp-config.json`、instruction files を表示する |
| Core View | エディタ領域に開く WebviewPanel | タブは `History` / `Instructions Chain` / `Trusted` / `Hooks` / `Plugins` |
| Skill Manager | skills 一覧と有効状態を確認する WebviewPanel | `settings.json.disabledSkills` を編集する |
| Agent Manager | agents 一覧と Orchestration Editor を持つ WebviewPanel | agents タブと orchestration タブを持つ |
| MCP Manager | MCP 一覧と詳細編集フォームを提供する WebviewPanel | local / stdio / http / sse を扱う |
| `session-state/<session>/events.jsonl` | History タブが読む会話履歴ファイル | `~/.copilot/session-state/` 配下を新しい順に走査する |

---

## 4. 🎭 ユースケース / ユーザーストーリー

- ユーザーは Core Explorer から `config.json`、`settings.json`、workspace settings、`mcp-config.json`、instructions を開ける。
- ユーザーは `Commands` View から workspace command files、workspace prompt files、plugin commands を一覧し、workspace 配下の command / prompt files を編集できる。
- ユーザーは Skills Explorer から Workspace / User / Plugin の skills を一覧し、Skill Manager で有効状態を確認・切替できる。
- ユーザーは Agents Explorer から Workspace / User / Plugin の agents を一覧し、Agent Manager で frontmatter の主要項目を確認できる。
- ユーザーは Agent Manager の Orchestration Editor で orchestration を作成・保存・読込・削除し、サブエージェント委譲用 prompt を生成できる。
- ユーザーは MCP Explorer から enabled / disabled / plugin MCP を一覧し、MCP Manager で追加・更新・削除・有効化切替を行える。
- ユーザーは Core View で会話履歴、instruction chain、trusted folders、hooks、plugins を横断確認できる。
- ユーザーは plugin が提供する commands / skills / agents / hooks / MCP / LSP の取得元と readonly 状態、既存定義との競合診断を確認できる。
- ユーザーは Core / Skills / Templates / Agents について、設定済み同期フォルダとの相互同期を行える。

---

## 5. ✅ 機能要件

### 5.1 ビュー構成

- Activity Bar 配下に次の Tree View を提供する。
  - `Core`
  - `Agents`
  - `Skills`
  - `Commands`
  - `MCP`
  - `Templates`
- 追加の Manager View / Panel として次を提供する。
  - `Core View`
  - `Skill Manager`
  - `Agent Manager`
  - `MCP Manager`
- `Commands Manager` と `Template Manager` は現実装では提供しない。
- `Orchestration Editor` は独立 Panel ではなく `Agent Manager` 内タブとして提供する。

### 5.2 利用可否判定と設定破損時の扱い

- `getWorkspaceStatus()` と `getCoreWorkspaceStatus()` は現実装では常に利用可を返す。
- そのため、`config.json` が不正でも拡張全体を停止しない。
- `config.json` の存在確認・JSON 妥当性確認は `getCopilotConfigStatus()` で別途行い、Core Explorer の `config.json` 項目に warning 表示を付ける。
- `Core View` は `openCoreManager` コマンドから常に開ける。
- `Skill Manager`、`Agent Manager`、`MCP Manager`、各 Tree View コマンドは現実装の availability guard を持つが、guard 自体は常に通る。

### 5.3 Core Explorer

- 表示対象は、存在するファイルのみとする。
- データ取得元は次のとおり。

| 項目 | 取得元 | 備考 |
| --- | --- | --- |
| `config.json` | `~/.copilot/config.json` | 不正 JSON の場合は warning 表示 |
| `settings.json` | `~/.copilot/settings.json` | user scope settings |
| `settings.json` | `<workspace>/.github/copilot/settings.json` | workspace settings |
| `settings.local.json` | `<workspace>/.github/copilot/settings.local.json` | workspace local settings |
| `mcp-config.json` | `~/.copilot/mcp-config.json` | user MCP |
| `copilot-instructions.md` | `~/.copilot/copilot-instructions.md` | user instructions |
| `copilot-instructions.md` | `<workspace>/.github/copilot-instructions.md` | workspace instructions |
| `*.instructions.md` | `<workspace>/.github/instructions/` 以下 | path instructions |
| `AGENTS.md` | `<workspace>/AGENTS.md` | workspace agent instructions |
| `AGENTS.md` | `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` 各ディレクトリ | custom agent instructions |

- `openCopilotFolder` は選択中ファイルの親、未選択時は `~/.copilot` を OS のファイラーで開く。

### 5.4 Core View

- タブは次の 5 つとする。
  - `History`
  - `Instructions Chain`
  - `Trusted`
  - `Hooks`
  - `Plugins`
- タブごとの再読込は現在タブのみを対象にする。

#### 5.4.1 History

- データ取得元は `~/.copilot/session-state/<session>/events.jsonl` とする。
- `session-state` 直下のディレクトリを走査し、`logs` ディレクトリは除外する。
- 履歴一覧は新しい順に並べる。
- 1 ターンは `user_message` を起点に、assistant message と tool usage を紐付けて表示する。
- 検索対象はユーザーメッセージ全文で、部分一致・大文字小文字非区別とする。
- 表示件数上限は設定 `copilot-workspace-manager.maxSessionHistoryCount` に従い、既定値は `100` とする。
- reasoning 表示を切り替える設定は現実装には存在しない。

#### 5.4.2 Instructions Chain

- データ取得元は次の instruction sources とする。
  - `~/.copilot/copilot-instructions.md`
  - `<workspace>/.github/copilot-instructions.md`
  - `<workspace>/.github/instructions/*.instructions.md`
  - `<workspace>/AGENTS.md`
  - `COPILOT_CUSTOM_INSTRUCTIONS_DIRS/*/AGENTS.md`
- path instructions は `applyTo` とアクティブファイルの一致判定を行う。
- 表示は kind ごとに `user` / `workspace` / `path` / `agent` / `customAgent` を識別する。

#### 5.4.3 Trusted

- データ取得元は次の `settings.json` とする。
  - `~/.copilot/settings.json`
  - `<workspace>/.github/copilot/settings.json`
- trusted folders は各 settings の trusted folder 配列から読む。
- 一覧には source と path を表示し、削除ボタンを提供する。

#### 5.4.4 Hooks

- データ取得元は次の 2 系統とする。
  - workspace hooks: `<workspace>/.github/hooks/*.json`
  - plugin hooks: installed plugin 配下の `hooks.json`
- user hooks や inline hooks は現実装では扱わない。
- 表示は左ペインに source、右ペインに source ごとの entries を出す。
- source ごとに `Workspace Hooks` / `Plugin Hooks` を区別する。

#### 5.4.5 Plugins

- 一次情報は `~/.copilot/config.json` の `installedPlugins` とする。
- enabled 状態の上書きは `~/.copilot/settings.json` の `enabledPlugins` から読む。
- plugin manifest 探索順は次のとおり。
  1. `.plugin/plugin.json`
  2. `plugin.json`
  3. `.github/plugin/plugin.json`
  4. `.claude-plugin/plugin.json`
- 表示対象は plugin metadata と次の component blocks とする。
  - `Agents`
  - `Skills`
  - `Commands`
  - `Hooks`
  - `MCP Servers`
  - `LSP Servers`
  - `Diagnostics`
- 表示仕様は次のとおり。
  - plugin ごとに enabled / disabled、install kind、manifest path、plugin root、各 component 件数を表示する
  - component は readonly として表示する
  - 既存 Workspace / User 定義との競合は diagnostics に反映する
  - plugin enabled 切替は `settings.json.enabledPlugins` を更新し、再起動案内を表示する
- 仕様変更が入りやすい箇所として、`installedPlugins` の shape、`enabledPlugins` の key、manifest 内 component の配置を明記して追跡する。

### 5.5 Commands View

- データ取得元は次のとおり。

| 種別 | 取得元 | 表示ラベル |
| --- | --- | --- |
| Workspace Commands | `<workspace>/.claude/commands` | `Workspace Command` |
| Workspace Prompts | `<workspace>/.github/prompts` | `Workspace Command` |
| Plugin Commands | installed plugin 配下の commands roots | `Plugin Commands` |

- user scope prompts と IDE prompts は現実装では扱わない。
- `openPromptsFolder` は選択中項目の親フォルダを開き、未選択時はエラーを表示する。
- `Commands` View 直下は root 自体ではなく、その配下の項目を表示する。
- plugin commands は取得元として表示するが、編集対象としては readonly 扱いを前提にする。
- `addPromptsFile` は `Commands` View の root から追加する場合、QuickPick で `.claude/commands` と `.github/prompts` の保存先を選ばせる。
- `.claude/commands` に追加するファイル名は `*.md`、`.github/prompts` に追加するファイル名は `*.prompt.md` に正規化する。

### 5.6 Skills Explorer と Skill Manager

- Skills Explorer の root 候補は次の順序で収集する。
  1. `<workspace>/.github/skills`
  2. `<workspace>/.agents/skills`
  3. `<workspace>/.claude/skills`
  4. `~/.copilot/skills`
  5. `~/.agents/skills`
  6. `~/.claude/skills`
  7. installed plugin 配下の skill roots
- 表示優先は `project` → `user` → `plugin` とする。
- `SKILL.md` の frontmatter から `name` と `description` を読む。
- skill の enabled 状態は `~/.copilot/settings.json` の `disabledSkills` 配列で表現する。
- Skill Manager の表示項目は次のとおり。
  - skill 名
  - 説明
  - 絶対パス
  - location label
  - enabled / disabled switch
  - open action
- Skill Manager の toggle は `disabledSkills` を更新し、Tree View を再読込する。

### 5.7 Agents Explorer と Agent Manager

- Agents Explorer の root 候補は次の順序で収集する。
  1. `<workspace>/.github/agents`
  2. `<workspace>/.claude/agents`
  3. `~/.copilot/agents`
  4. installed plugin 配下の agent roots
- plugin agents は readonly とする。
- Agents Explorer では `.agent.md` と `.md` の両方を表示対象にし、一覧は `ThemeIcon('hubot')` を用いる。
- Agent Manager は `Agents` タブと `Orchestration Editor` タブを持つ。
- Agent Manager の表示項目は次のとおり。
  - 名前
  - 説明
  - model
  - tools
  - mcp-servers
  - `user-invocable`
  - `disable-model-invocation`
  - preview 本文
  - 絶対パス
  - location label
  - readonly 状態
- `user-invocable` と `disable-model-invocation` の toggle は frontmatter を直接更新する。
- Explorer の enable / disable コマンドは現実装で残っているが、実際には frontmatter 管理メッセージを表示するのみで、状態保存は行わない。

#### 5.7.1 Orchestration Editor

- orchestration 定義の保存先は `~/.copilot/.copilot-workspace-manager/orchestrations/*.json` とする。
- orchestration の構成要素は次の 3 種類とする。
  - `Orchestration` card
  - `Agent` card
  - `Loop` card
- orchestration 定義には少なくとも次を保持する。
  - `version`
  - `workflowId`
  - `name`
  - `description`
  - `constraints`
  - `finalOutputFormat`
  - `nodes`
  - `edges`
  - `createdAt`
  - `updatedAt`
- Editor では次の操作を提供する。
  - 新規 orchestration 作成
  - 保存済み orchestration 一覧の読込
  - orchestration の保存
  - orchestration の読込
  - orchestration の削除
  - 保存フォルダを開く
  - validation 実行
  - prompt 生成
  - 生成 prompt の clipboard コピー
  - Agents Manager を離れて戻ったあとも未保存 draft を復元する
- Orchestration インスペクタでは次の入力項目を編集できる。
  - `name`
  - `description`
  - `constraints`
  - `finalOutputFormat`
- validation は少なくとも次の条件を確認する。
  - orchestration 名が空でないこと
  - `Orchestration` card が 1 つだけ存在すること
  - `Agent` card の `order` が正で重複しないこと
  - `Agent` card の `agentName` が空でないこと
  - `Loop` card の `maxAttempts` が正であること
  - `Loop` card の `acceptanceCriteria` が空でないこと
  - `Orchestration` card に入力 edge がないこと
  - `Orchestration` card の接続先が `Agent` card のみであること
  - `Loop` card に入力元 `Agent` と出力先 `Agent` が存在すること
  - 到達不能 node と cycle を検出すること
- prompt 生成は validation error がある場合はブロックし、warning のみの場合は生成を許可する。
- `constraints` に入力がある場合のみ、生成 prompt の `🧑‍✈️ 基本方針` と `🤖 起動するサブエージェント` の間へ、その内容を生テキストで出力する。
- 旧形式の output node を含む orchestration JSON は、読込時に `finalOutputFormat` へ移行する。

### 5.8 MCP Explorer と MCP Manager

- MCP Explorer のデータ取得元は次の 3 系統とする。
  - `~/.copilot/mcp-config.json` の enabled 定義
  - `~/.copilot/.copilot-workspace-manager/mcp-config.disabled.json` の disabled 定義
  - installed plugin manifest 由来の plugin MCP 定義
- 一覧表示順は通常 MCP を ID 昇順、その後に plugin MCP とする。
- plugin MCP は readonly とする。
- disabled な通常 MCP は `circle-slash` + `disabledForeground` で表示する。
- MCP Manager の編集対象項目は次のとおり。
  - `id`
  - `type`
  - `command`
  - `args`
  - `cwd`
  - `url`
  - `env`
  - `headers`
  - `tools`
  - `timeout`
  - `oauthClientId`
  - `oauthPublicClient`
  - `oidc`
  - `filterMapping`
- `type` は `local` / `stdio` / `http` / `sse` を扱う。
- toggle は enabled/disabled でファイル間移送を行う。
- add / save / delete を提供する。
- plugin MCP は詳細フォームを表示するが編集不可とする。

### 5.9 Templates Explorer

- データ取得元は `~/.copilot/.copilot-workspace-manager/templates/` とする。
- Templates Explorer は user 管理領域のみを表示する。
- `openTemplatesFolder` はこの templates ルートを開く。
- Templates の同期対象も同ルートとする。

### 5.10 ファイル操作

- Commands / Skills / Templates では add file、add folder、rename、delete を提供する。
- ファイル作成・フォルダ作成は選択中フォルダまたは root 配下に行う。
- Skills は複数 root を持つため、作成先は location に依存する。
- Agents は専用コマンドで add / edit / delete を提供する。
- MCP は Tree では編集せず、MCP Manager で add / save / delete / toggle を行う。

### 5.11 同期

- 同期コマンドを提供するのは次の 4 種別のみとする。
  - `syncCore`
  - `syncSkills`
  - `syncTemplates`
  - `syncAgents`
- `syncPrompts` と `syncMcp` は現実装では存在しない。
- 設定キーは次のとおり。
  - `copilot-workspace-manager.copilotFolder`
  - `copilot-workspace-manager.skillsFolder`
  - `copilot-workspace-manager.templatesFolder`
  - `copilot-workspace-manager.agentFolder`
- Core 同期対象は次のファイルとする。
  - `config.json`
  - `settings.json`
  - `mcp-config.json`
  - `copilot-instructions.md`
  - `.copilot-workspace-manager/mcp-config.disabled.json`
- Skills 同期対象は `~/.copilot/skills`
- Templates 同期対象は `~/.copilot/.copilot-workspace-manager/templates`
- Agents 同期対象は `~/.copilot/agents`
- 削除同期判定には `.copilot-workspace-manager/copilot-workspace-sync.json` を使用する。
- hidden path と `.copilot-workspace-manager` 管理領域は通常同期の除外対象とする。

### 5.12 Refresh と多言語対応

- `refreshAll` は `Core / Commands / Skills / Templates / MCP / Agents` の各 Tree View を再読込する。
- ラベルとメッセージは `package.nls.json` / `package.nls.ja.json` と runtime i18n を通じて日本語・英語を提供する。

### 5.13 変動しやすい仕様の明文化

- 次の箇所は GitHub Copilot CLI 側の変更影響を受けやすいため、仕様書側で取得元と探索順を必ず明記する。
  - `config.json.installedPlugins`
  - `settings.json.enabledPlugins`
  - plugin manifest の探索順
  - plugin manifest 内の `agents` / `skills` / `commands` / `hooks` / `mcpServers` / `lspServers`
  - `session-state/<session>/events.jsonl` の履歴イベント形式
  - trusted folders の `settings.json` 表現
