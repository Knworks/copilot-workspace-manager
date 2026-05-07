import * as vscode from 'vscode';
import fs from 'fs';
import path from 'path';

type MessageBundle = Record<string, string>;

let cachedBundle: MessageBundle | null = null;

function loadBundle(): MessageBundle {
	if (cachedBundle) {
		return cachedBundle;
	}

	const language = (vscode.env.language ?? 'en').toLowerCase();
	const extensionRoot = path.resolve(__dirname, '..');
	const candidates = language.startsWith('ja')
		? ['package.nls.ja.json', 'package.nls.json']
		: ['package.nls.json'];

	for (const fileName of candidates) {
		try {
			const bundlePath = path.join(extensionRoot, fileName);
			const contents = fs.readFileSync(bundlePath, 'utf8');
			cachedBundle = JSON.parse(contents) as MessageBundle;
			return cachedBundle;
		} catch {
			// ignore and try next candidate
		}
	}

	cachedBundle = {};
	return cachedBundle;
}

function localize(
	key: string,
	fallback: string,
	...args: string[]
): string {
	const bundle = loadBundle();
	const template = bundle[key] ?? fallback;
	if (args.length === 0) {
		return template;
	}
	return template.replace(/\{(\d+)\}/g, (match, index) => {
		const argIndex = Number(index);
		if (Number.isNaN(argIndex) || args[argIndex] === undefined) {
			return match;
		}
		return args[argIndex];
	});
}

export const messages = {
	selectionRequired: localize(
		'message.selectionRequired',
		'Please select a target.',
	),
	unavailablePrefix: localize(
		'message.unavailablePrefix',
		'? Unable to open Copilot Workspace Manager: ',
	),
	unavailableUnknown: localize(
		'message.unavailableUnknown',
		'Unknown reason.',
	),
	reasonCopilotMissing: localize(
		'message.reason.copilotMissing',
		'.copilot does not exist.',
	),
	reasonConfigMissing: localize(
		'message.reason.configMissing',
		'config.json does not exist.',
	),
	reasonConfigUnreadable: localize(
		'message.reason.configUnreadable',
		'config.json cannot be read.',
	),
	reasonConfigInvalid: localize(
		'message.reason.configInvalid',
		'config.json cannot be parsed.',
	),
	openFolderMissing: localize(
		'message.openFolderMissing',
		'Target folder does not exist.',
	),
	unexpectedError: localize(
		'message.unexpectedError',
		'An unexpected error occurred.',
	),
	mcpToggleUpdated: localize(
		'message.mcpToggleUpdated',
		'Settings updated. Reload Copilot CLI or the extension to apply changes.',
	),
	configTomlOrganized: (backupPath: string) =>
		localize(
			'message.configTomlOrganized',
			'config.toml was organized. Backup saved to {0}.',
			backupPath,
		),
	configTomlAlreadyOrganized: (backupPath: string) =>
		localize(
			'message.configTomlAlreadyOrganized',
			'config.toml was already organized. Backup saved to {0}.',
			backupPath,
		),
	configTomlOrganizeBackupFailed: localize(
		'message.configTomlOrganizeBackupFailed',
		'Could not create a config.toml backup, so the organize operation was cancelled.',
	),
	commandRefresh: localize('command.refresh', 'Refresh'),
	syncConfirm: (targetPath: string) =>
		localize(
			'message.syncConfirm',
			'Sync files with "{0}"?',
			targetPath,
		),
	syncSkipped: (count: number) =>
		localize(
			'message.syncSkipped',
			'Skipped {0} files due to sync errors.',
			String(count),
		),
	historyPanelTitle: localize(
		'message.historyPanelTitle',
		'Session History',
	),
	coreViewPanelTitle: localize(
		'message.coreViewPanelTitle',
		'Copilot Manager',
	),
	coreViewConversationHistoryTab: localize(
		'message.coreViewConversationHistoryTab',
		'Session History',
	),
	coreViewHooksTab: localize(
		'message.coreViewHooksTab',
		'Hooks',
	),
	skillManagerTitle: localize(
		'message.skillManagerTitle',
		'Skill Manager',
	),
	skillManagerSearchPlaceholder: localize(
		'message.skillManagerSearchPlaceholder',
		'Search skills',
	),
	skillManagerOpen: localize('message.skillManagerOpen', 'Open'),
	skillManagerNoResult: localize(
		'message.skillManagerNoResult',
		'No skills found.',
	),
	coreExplorerEmpty: localize(
		'message.coreExplorerEmpty',
		'No Copilot Manager files to display.',
	),
	promptsExplorerEmpty: localize(
		'message.promptsExplorerEmpty',
		'No commands to display.',
	),
	skillsExplorerEmpty: localize(
		'message.skillsExplorerEmpty',
		'No skills to display.',
	),
	templatesExplorerEmpty: localize(
		'message.templatesExplorerEmpty',
		'No templates to display.',
	),
	mcpExplorerEmpty: localize(
		'message.mcpExplorerEmpty',
		'No MCP servers to display.',
	),
	agentExplorerEmpty: localize(
		'message.agentExplorerEmpty',
		'No Sub Agents to display.',
	),
	agentManagerTitle: localize(
		'message.agentManagerTitle',
		'Sub Agents Manager',
	),
	agentManagerSearchPlaceholder: localize(
		'message.agentManagerSearchPlaceholder',
		'Search agents',
	),
	agentManagerOpen: localize('message.agentManagerOpen', 'Open'),
	agentManagerNoResult: localize(
		'message.agentManagerNoResult',
		'No agents found.',
	),
	agentManagerModelLabel: localize('message.agentManagerModelLabel', 'model:'),
	agentManagerToolsLabel: localize('message.agentManagerToolsLabel', 'tools:'),
	agentManagerMcpServersLabel: localize(
		'message.agentManagerMcpServersLabel',
		'mcpServers:',
	),
	agentManagerUserInvocableLabel: localize(
		'message.agentManagerUserInvocableLabel',
		'Whether users can select this agent manually',
	),
	agentManagerDisableModelInvocationLabel: localize(
		'message.agentManagerDisableModelInvocationLabel',
		'Prevent the model from invoking this agent automatically',
	),
	agentManagerPreviewLabel: localize(
		'message.agentManagerPreviewLabel',
		'File preview',
	),
	agentManagerPreviewEmpty: localize(
		'message.agentManagerPreviewEmpty',
		'No preview is available.',
	),
	agentManagerOverwritten: (agentName: string) =>
		localize(
			'message.agentManagerOverwritten',
			'[agents.{0}] was overwritten with the disabled definition.',
			agentName,
		),
	mcpManagerTitle: localize('message.mcpManagerTitle', 'MCP Manager'),
	mcpManagerSearchPlaceholder: localize(
		'message.mcpManagerSearchPlaceholder',
		'Search MCP servers',
	),
	mcpManagerAdd: localize('message.mcpManagerAdd', 'Add'),
	mcpManagerDelete: localize('message.mcpManagerDelete', 'Delete'),
	mcpManagerSave: localize('message.mcpManagerSave', 'Save'),
	mcpManagerCancel: localize('message.mcpManagerCancel', 'Cancel'),
	mcpManagerServerName: localize(
		'message.mcpManagerServerName',
		'Server name',
	),
	mcpManagerTypeLabel: localize('message.mcpManagerTypeLabel', 'Type'),
	mcpManagerCommandLabel: localize(
		'message.mcpManagerCommandLabel',
		'Command',
	),
	mcpManagerArgsLabel: localize('message.mcpManagerArgsLabel', 'Args'),
	mcpManagerArgPlaceholder: localize(
		'message.mcpManagerArgPlaceholder',
		'argument',
	),
	mcpManagerToolsLabel: localize('message.mcpManagerToolsLabel', 'Tools'),
	mcpManagerToolPlaceholder: localize(
		'message.mcpManagerToolPlaceholder',
		'tool name or *',
	),
	mcpManagerUrlLabel: localize('message.mcpManagerUrlLabel', 'URL'),
	mcpManagerEnvLabel: localize('message.mcpManagerEnvLabel', 'Env'),
	mcpManagerHeadersLabel: localize('message.mcpManagerHeadersLabel', 'Headers'),
	mcpManagerCwdLabel: localize('message.mcpManagerCwdLabel', 'CWD'),
	mcpManagerTimeoutLabel: localize('message.mcpManagerTimeoutLabel', 'Timeout'),
	mcpManagerOAuthClientIdLabel: localize(
		'message.mcpManagerOAuthClientIdLabel',
		'OAuth Client ID',
	),
	mcpManagerOAuthPublicClientLabel: localize(
		'message.mcpManagerOAuthPublicClientLabel',
		'OAuth Public Client',
	),
	mcpManagerOidcLabel: localize('message.mcpManagerOidcLabel', 'OIDC'),
	mcpManagerFilterMappingLabel: localize(
		'message.mcpManagerFilterMappingLabel',
		'Filter Mapping',
	),
	mcpManagerLocalSection: localize('message.mcpManagerLocalSection', 'Local / STDIO'),
	mcpManagerRemoteSection: localize('message.mcpManagerRemoteSection', 'HTTP / SSE'),
	mcpManagerCommonSection: localize('message.mcpManagerCommonSection', 'Common'),
	mcpManagerAddArg: localize('message.mcpManagerAddArg', 'Add arg'),
	mcpManagerRemoveArg: localize('message.mcpManagerRemoveArg', 'Remove arg'),
	mcpManagerAddTool: localize('message.mcpManagerAddTool', 'Add tool'),
	mcpManagerRemoveTool: localize('message.mcpManagerRemoveTool', 'Remove tool'),
	mcpManagerAddEnv: localize('message.mcpManagerAddEnv', 'Add env'),
	mcpManagerRemoveEnv: localize(
		'message.mcpManagerRemoveEnv',
		'Remove env',
	),
	mcpManagerAddHeader: localize('message.mcpManagerAddHeader', 'Add header'),
	mcpManagerRemoveHeader: localize(
		'message.mcpManagerRemoveHeader',
		'Remove header',
	),
	mcpManagerEnvKeyPlaceholder: localize(
		'message.mcpManagerEnvKeyPlaceholder',
		'KEY',
	),
	mcpManagerEnvValuePlaceholder: localize(
		'message.mcpManagerEnvValuePlaceholder',
		'value',
	),
	mcpManagerHeaderKeyPlaceholder: localize(
		'message.mcpManagerHeaderKeyPlaceholder',
		'HEADER',
	),
	mcpManagerHeaderValuePlaceholder: localize(
		'message.mcpManagerHeaderValuePlaceholder',
		'value',
	),
	mcpManagerToggle: localize('message.mcpManagerToggle', 'Toggle'),
	mcpManagerDescriptionServerName: localize(
		'message.mcpManagerDescriptionServerName',
		'Unique server name stored as the mcpServers.<name> key.',
	),
	mcpManagerDescriptionType: localize(
		'message.mcpManagerDescriptionType',
		'Server transport type. Choose local, stdio, http, or sse.',
	),
	mcpManagerDescriptionCommand: localize(
		'message.mcpManagerDescriptionCommand',
		'Command used to launch local or stdio MCP servers.',
	),
	mcpManagerDescriptionArgs: localize(
		'message.mcpManagerDescriptionArgs',
		'Arguments passed to local or stdio servers. Add one argument per row.',
	),
	mcpManagerDescriptionTools: localize(
		'message.mcpManagerDescriptionTools',
		'Tools saved as a list of entries. When left empty, ["*"] is stored automatically.',
	),
	mcpManagerDescriptionUrl: localize(
		'message.mcpManagerDescriptionUrl',
		'URL for http or sse MCP servers.',
	),
	mcpManagerDescriptionEnv: localize(
		'message.mcpManagerDescriptionEnv',
		'Environment variables passed to local or stdio servers as key and value pairs.',
	),
	mcpManagerDescriptionHeaders: localize(
		'message.mcpManagerDescriptionHeaders',
		'HTTP or SSE request headers stored as key and value pairs.',
	),
	mcpManagerDescriptionCwd: localize(
		'message.mcpManagerDescriptionCwd',
		'Working directory for local or stdio MCP servers.',
	),
	mcpManagerDescriptionTimeout: localize(
		'message.mcpManagerDescriptionTimeout',
		'Timeout in milliseconds. Use a non-negative number.',
	),
	mcpManagerDescriptionOAuthClientId: localize(
		'message.mcpManagerDescriptionOAuthClientId',
		'Static OAuth client identifier for remote MCP servers.',
	),
	mcpManagerDescriptionOAuthPublicClient: localize(
		'message.mcpManagerDescriptionOAuthPublicClient',
		'Whether the remote MCP server should use public-client OAuth behavior.',
	),
	mcpManagerDescriptionOidc: localize(
		'message.mcpManagerDescriptionOidc',
		'Inject an OIDC token when supported.',
	),
	mcpManagerDescriptionFilterMapping: localize(
		'message.mcpManagerDescriptionFilterMapping',
		'Tool output filter mapping. Use none, markdown, or hidden_characters.',
	),
	mcpManagerDeleteConfirm: (serverId: string) =>
		localize(
			'message.mcpManagerDeleteConfirm',
			'Delete MCP server [mcp_servers.{0}]?',
			serverId,
		),
	mcpToggleAction: localize('message.mcpToggleAction', 'Toggle MCP'),
	mcpValidationServerNameRequired: localize(
		'message.mcpValidationServerNameRequired',
		'Server name is required.',
	),
	mcpValidationServerNameDuplicate: localize(
		'message.mcpValidationServerNameDuplicate',
		'An MCP server with the same name already exists.',
	),
	mcpValidationTypeInvalid: localize(
		'message.mcpValidationTypeInvalid',
		'Type must be local, stdio, http, or sse.',
	),
	mcpValidationCommandRequired: localize(
		'message.mcpValidationCommandRequired',
		'Command is required for local or stdio servers.',
	),
	mcpValidationUrlRequired: localize(
		'message.mcpValidationUrlRequired',
		'URL is required for http or sse servers.',
	),
	mcpValidationTimeoutInvalid: localize(
		'message.mcpValidationTimeoutInvalid',
		'Timeout must be a non-negative number.',
	),
	mcpValidationHeadersKeyRequired: localize(
		'message.mcpValidationHeadersKeyRequired',
		'Header rows with a value must also have a key.',
	),
	mcpValidationEnvKeyRequired: localize(
		'message.mcpValidationEnvKeyRequired',
		'Env rows with a value must also have a key.',
	),
	mcpValidationFilterMappingInvalid: localize(
		'message.mcpValidationFilterMappingInvalid',
		'Filter Mapping must be none, markdown, or hidden_characters.',
	),
	coreViewAgentsChainTab: localize(
		'message.coreViewAgentsChainTab',
		'Instructions Chain',
	),
	chainCurrentSection: localize(
		'message.chainCurrentSection',
		'Current',
	),
	chainIgnoredSection: localize(
		'message.chainIgnoredSection',
		'Ignored',
	),
	chainProblemsSection: localize(
		'message.chainProblemsSection',
		'Needs attention',
	),
	chainDetailsSection: localize(
		'message.chainDetailsSection',
		'Detailed candidates',
	),
	chainToggleDetails: localize(
		'message.chainToggleDetails',
		'Show detailed candidates',
	),
	chainSummaryCurrent: localize(
		'message.chainSummaryCurrent',
		'Using',
	),
	chainSummaryIgnored: localize(
		'message.chainSummaryIgnored',
		'Ignored',
	),
	chainSummaryProblems: localize(
		'message.chainSummaryProblems',
		'Problems',
	),
	chainSummaryHidden: localize(
		'message.chainSummaryHidden',
		'Hidden candidates',
	),
	chainWorkspaceRootLabel: localize(
		'message.chainWorkspaceRootLabel',
		'Workspace root',
	),
	coreViewTabsAriaLabel: localize(
		'message.coreViewTabsAriaLabel',
		'Copilot Manager tabs',
	),
	chainNoWorkspace: localize(
		'message.chainNoWorkspace',
		'Open a workspace folder to view the instructions chain.',
	),
	chainPreviewEmpty: localize(
		'message.chainPreviewEmpty',
		'Select an item on the left to view details.',
	),
	chainStatusCurrent: localize(
		'message.chainStatusCurrent',
		'Using',
	),
	chainStatusIgnored: localize(
		'message.chainStatusIgnored',
		'Ignored',
	),
	chainStatusProblem: localize(
		'message.chainStatusProblem',
		'Problem',
	),
	chainStatusMissing: localize(
		'message.chainStatusMissing',
		'Missing',
	),
	chainDetailStatus: localize(
		'message.chainDetailStatus',
		'Status',
	),
	chainDetailClassification: localize(
		'message.chainDetailClassification',
		'Classification',
	),
	chainDetailPath: localize(
		'message.chainDetailPath',
		'Path',
	),
	chainDetailExplanation: localize(
		'message.chainDetailExplanation',
		'Explanation',
	),
	chainExplainCurrent: (layer: string, fileName: string) =>
		localize(
			'message.chainExplainCurrent',
			'{0} layer is currently using {1}.',
			layer,
			fileName,
		),
	chainExplainIgnoredPreferred: (preferred: string) =>
		localize(
			'message.chainExplainIgnoredPreferred',
			'{0} has higher priority, so this file is not used.',
			preferred,
		),
	chainExplainIgnoredGeneric: localize(
		'message.chainExplainIgnoredGeneric',
		'A higher-priority candidate exists, so this file is not used.',
	),
	chainExplainProblem: (reason: string) =>
		localize(
			'message.chainExplainProblem',
			'The file exists but could not be read. {0}',
			reason,
		),
	chainExplainMissingFallback: localize(
		'message.chainExplainMissingFallback',
		'This fallback candidate is configured but the file does not exist.',
	),
	chainExplainMissingGeneric: localize(
		'message.chainExplainMissingGeneric',
		'This candidate was checked, but the file does not exist.',
	),
	coreViewTrustedDirectoriesTab: localize(
		'message.coreViewTrustedDirectoriesTab',
		'Trusted Directory',
	),
	hooksEnableFeature: localize(
		'message.hooksEnableFeature',
		'Enable hooks feature',
	),
	hooksLayerUser: localize('message.hooksLayerUser', 'User'),
	hooksLayerProject: localize('message.hooksLayerProject', 'Project'),
	hooksActive: localize('message.hooksActive', 'Active'),
	hooksInactive: localize('message.hooksInactive', 'Inactive'),
	hooksEntryCount: (count: number) =>
		localize('message.hooksEntryCount', '{0} entries', count.toString()),
	hooksOpenSource: localize('message.hooksOpenSource', 'Open source'),
	hooksAddFile: localize('message.hooksAddFile', 'Add hooks file'),
	hooksFileNamePlaceholder: localize(
		'message.hooksFileNamePlaceholder',
		'Enter hook file name',
	),
	hooksDuplicateFileError: localize(
		'message.hooksDuplicateFileError',
		'A file with the same name already exists.',
	),
	hooksCreateFile: localize('message.hooksCreateFile', 'Create hooks.json'),
	hooksCreateConfigFile: localize(
		'message.hooksCreateConfigFile',
		'Create config.toml',
	),
	hooksNoCommand: localize(
		'message.hooksNoCommand',
		'No command is configured for this handler.',
	),
	hooksMatcherLabel: localize('message.hooksMatcherLabel', 'Matcher'),
	hooksMatcherNotUsed: localize(
		'message.hooksMatcherNotUsed',
		'Not specified',
	),
	hooksTypeLabel: localize('message.hooksTypeLabel', 'Type'),
	hooksTimeoutLabel: localize('message.hooksTimeoutLabel', 'Timeout'),
	hooksStatusMessageLabel: localize(
		'message.hooksStatusMessageLabel',
		'Status message',
	),
	hooksFeatureStatus: (status: string) =>
		localize('message.hooksFeatureStatus', 'Hooks feature: {0}', status),
	hooksProjectTrustLabel: localize(
		'message.hooksProjectTrustLabel',
		'Project hooks',
	),
	hooksSourcesHeading: localize(
		'message.hooksSourcesHeading',
		'Hook sources',
	),
	hooksEntriesHeading: localize(
		'message.hooksEntriesHeading',
		'Hook entries',
	),
	hooksNoEntries: localize(
		'message.hooksNoEntries',
		'No hook entries were found in the active layers.',
	),
	hooksWarningMergedSources: (layer: string) =>
		localize(
			'message.hooksWarningMergedSources',
			'{0} layer has both hooks.json and inline hooks. Codex merges them and warns at startup.',
			layer,
		),
	hooksWarningFeatureDisabled: localize(
		'message.hooksWarningFeatureDisabled',
		'Hooks are disabled because features.codex_hooks is false.',
	),
	hooksWarningProjectUntrusted: localize(
		'message.hooksWarningProjectUntrusted',
		'Project-local hooks are inactive until this workspace is trusted.',
	),
	hooksWarningUnsupportedHandler: localize(
		'message.hooksWarningUnsupportedHandler',
		'Only command hook handlers are currently executed by Codex.',
	),
	trustedDirectoryDeleteConfirm: (targetPath: string) =>
		localize(
			'message.trustedDirectoryDeleteConfirm',
			'Remove trusted directory [{0}]?',
			targetPath,
		),
	historyPanelPlaceholder: localize(
		'message.historyPanelPlaceholder',
		'Conversation history view is ready.',
	),
	historySearchPlaceholder: localize(
		'message.historySearchPlaceholder',
		'Search',
	),
	historySearch: localize('message.historySearch', 'Search'),
	historyClear: localize('message.historyClear', 'Clear'),
	historyNoResult: localize(
		'message.historyNoResult',
		'No sessions found.',
	),
	historyNoPreview: localize(
		'message.historyNoPreview',
		'Select a session card to preview the conversation.',
	),
	historyCopy: localize('message.historyCopy', 'Copy'),
	historyCopied: localize('message.historyCopied', 'Copied to clipboard.'),
	historyUserLabel: localize('message.historyUserLabel', 'User'),
	historyAssistantLabel: localize(
		'message.historyAssistantLabel',
		'Assistant',
	),
	historySessionIdLabel: localize(
		'message.historySessionIdLabel',
		'Session',
	),
	historyEventsFileLabel: localize(
		'message.historyEventsFileLabel',
		'Events File',
	),
	historyAgentResponsesLabel: localize(
		'message.historyAgentResponsesLabel',
		'Agent Responses',
	),
	historyNoAgentResponses: localize(
		'message.historyNoAgentResponses',
		'No agent responses were extracted.',
	),
	historyToolUsageLabel: localize(
		'message.historyToolUsageLabel',
		'Tool Usage',
	),
	historyNoToolUsage: localize(
		'message.historyNoToolUsage',
		'No tool usage was extracted.',
	),
	historyIssuesLabel: localize(
		'message.historyIssuesLabel',
		'Issues',
	),
	historyRawEventsLabel: localize(
		'message.historyRawEventsLabel',
		'Raw Events',
	),
	historyRawEventsHelp: localize(
		'message.historyRawEventsHelp',
		'Shown only as fallback details when parsing was incomplete.',
	),
	helloWorld: localize(
		'message.helloWorld',
		'Hello World from Copilot Workspace Manager!',
	),
	dialogOk: localize('message.dialogOk', 'OK'),
	file: {
		inputFileName: localize('message.inputFileName', 'Enter a file name.'),
		inputCommandFileName: localize(
			'message.inputCommandFileName',
			'Enter a Command name.',
		),
		inputSkillFileName: localize(
			'message.inputSkillFileName',
			'Enter a file name. Leave empty to create SKILL.md.',
		),
		inputFolderName: localize(
			'message.inputFolderName',
			'Enter a folder name.',
		),
		inputSkillFolderName: localize(
			'message.inputSkillFolderName',
			'Enter a Skill name.',
		),
		inputSkillDescription: localize(
			'message.inputSkillDescription',
			'Enter a description.',
		),
		inputRenameName: localize(
			'message.inputRenameName',
			'Enter a new name.',
		),
		invalidName: localize(
			'message.invalidName',
			'Please enter a valid name.',
		),
		renameRootNotAllowed: localize(
			'message.renameRootNotAllowed',
			'Root folders cannot be renamed.',
		),
		renameFolderExists: localize(
			'message.renameFolderExists',
			'A folder with the same name already exists.',
		),
		deleteFileConfirm: localize(
			'message.deleteFileConfirm',
			'Are you sure you want to delete this file?',
		),
		deleteFolderConfirm: localize(
			'message.deleteFolderConfirm',
			'Are you sure you want to delete this folder and its contents?',
		),
		deleteRootNotAllowed: localize(
			'message.deleteRootNotAllowed',
			'Root folders cannot be deleted.',
		),
		overwriteFileConfirm: localize(
			'message.overwriteFileConfirm',
			'Overwrite the file? The existing file will be deleted.',
		),
		overwrite: localize('message.overwrite', 'Overwrite'),
		fileExistsUseDifferentName: (originalName: string, suggestedName: string) =>
			localize(
				'message.fileExistsUseDifferentName',
				'A file named "{0}" already exists here. Rename "{0}" to "{1}"?',
				originalName,
				suggestedName,
			),
		useDifferentName: localize(
			'message.useDifferentName',
			'Use a different name (_1)',
		),
		cancel: localize('message.cancel', 'Cancel'),
		templateNone: localize('message.templateNone', 'Empty file'),
		templatePickPlaceholder: localize(
			'message.templatePickPlaceholder',
			'Select a template.',
		),
		skillLocationPickPlaceholder: localize(
			'message.skillLocationPickPlaceholder',
			'Select a Skill location.',
		),
		skillSubfolderPickPlaceholder: localize(
			'message.skillSubfolderPickPlaceholder',
			'Select a Skill subfolder to create.',
		),
		skillFileFolderRequired: localize(
			'message.skillFileFolderRequired',
			'Select a folder in Skills before adding a file.',
		),
		userSkillsDeleteWarning: localize(
			'message.userSkillsDeleteWarning',
			'Deleting User Skills may affect other projects.',
		),
		selectionNotSupported: localize(
			'message.selectionNotSupported',
			'Select a target in prompts, skills, or templates.',
		),
	},
	agent: {
		inputName: localize(
			'message.agent.inputName',
			'Enter a Sub Agent name.',
		),
		inputDescription: localize(
			'message.agent.inputDescription',
			'Enter an agent description.',
		),
		invalidName: localize(
			'message.agent.invalidName',
			'Please enter a valid agent name.',
		),
		fileExists: (agentName: string) =>
			localize(
				'message.agent.fileExists',
				'An agent named "{0}" already exists.',
				agentName,
			),
		configExists: (agentName: string) =>
			localize(
				'message.agent.configExists',
				'config.toml already has [agents.{0}].',
				agentName,
			),
		notEnabled: (agentName: string) =>
			localize(
				'message.agent.notEnabled',
				'Agent "{0}" is already disabled or missing in config.toml.',
				agentName,
			),
		toggleUpdated: localize(
			'message.agent.toggleUpdated',
			'Agent settings updated. Please restart Codex to apply changes.',
		),
		frontmatterManaged: localize(
			'message.agent.frontmatterManaged',
			'Copilot agents are managed by editing .agent.md frontmatter.',
		),
		deleteConfirm: (agentName: string) =>
			localize(
				'message.agent.deleteConfirm',
				'Are you sure you want to delete agent "{0}"?',
				agentName,
			),
		locationPickPlaceholder: localize(
			'message.agent.locationPickPlaceholder',
			'Select an Agent location.',
		),
		userAgentsDeleteWarning: localize(
			'message.agent.userAgentsDeleteWarning',
			'Deleting User Agents may affect other projects.',
		),
		selectionNotSupported: localize(
			'message.agent.selectionNotSupported',
			'Select an agent file in the Agents view.',
		),
	},
};
