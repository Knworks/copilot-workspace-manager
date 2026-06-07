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
	openFolderSelectionRequired: localize(
		'message.openFolderSelectionRequired',
		'Please select a target folder to open.',
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
	coreViewPluginsTab: localize(
		'message.coreViewPluginsTab',
		'Plugin',
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
	coreInternalConfigDescription: localize(
		'message.coreInternalConfigDescription',
		'Internal Config',
	),
	coreUserSettingsDescription: localize(
		'message.coreUserSettingsDescription',
		'User Settings',
	),
	coreWorkspaceSettingsDescription: localize(
		'message.coreWorkspaceSettingsDescription',
		'Workspace Settings',
	),
	coreWorkspaceLocalSettingsDescription: localize(
		'message.coreWorkspaceLocalSettingsDescription',
		'Workspace Local Settings',
	),
	commandsExplorerEmpty: localize(
		'message.commandsExplorerEmpty',
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
	explorerOpenItem: (label: string) =>
		localize(
			'message.explorerOpenItem',
			'Open {0}',
			label,
		),
	explorerOpenFile: localize('message.explorerOpenFile', 'Open file'),
	explorerOpenAgentFile: localize('message.explorerOpenAgentFile', 'Open agent file'),
	explorerWorkspaceClaudeCommands: localize(
		'message.explorerWorkspaceClaudeCommands',
		'Workspace Command .claude/commands',
	),
	explorerWorkspaceGithubPrompts: localize(
		'message.explorerWorkspaceGithubPrompts',
		'Workspace Command .github/prompts',
	),
	explorerWorkspaceCommands: localize(
		'message.explorerWorkspaceCommands',
		'Workspace Command',
	),
	explorerPluginCommands: localize(
		'message.explorerPluginCommands',
		'Plugin Commands',
	),
	explorerTemplatesRoot: localize(
		'message.explorerTemplatesRoot',
		'Templates',
	),
	agentManagerNoResult: localize(
		'message.agentManagerNoResult',
		'No agents found.',
	),
	agentManagerAgentsTab: localize(
		'message.agentManagerAgentsTab',
		'Agents',
	),
	agentManagerOrchestrationTab: localize(
		'message.agentManagerOrchestrationTab',
		'Orchestration Editor',
	),
	agentManagerWorkflowPlaceholder: localize(
		'message.agentManagerWorkflowPlaceholder',
		'Orchestration name',
	),
	agentManagerWorkflow: localize(
		'message.agentManagerWorkflow',
		'Orchestration',
	),
	agentManagerWorkflowCardDefaultTitle: localize(
		'message.agentManagerWorkflowCardDefaultTitle',
		'New orchestration',
	),
	agentManagerDescription: localize(
		'message.agentManagerDescription',
		'Description',
	),
	agentManagerWorkflowCardDefaultSummary: localize(
		'message.agentManagerWorkflowCardDefaultSummary',
		'Describe the orchestration.',
	),
	agentManagerNoSavedWorkflow: localize(
		'message.agentManagerNoSavedWorkflow',
		'No saved workflows',
	),
	agentManagerSelectWorkflow: localize(
		'message.agentManagerSelectWorkflow',
		'Select orchestration',
	),
	agentManagerPromptPreview: localize(
		'message.agentManagerPromptPreview',
		'Prompt Preview',
	),
	agentManagerHidePreview: localize(
		'message.agentManagerHidePreview',
		'Hide Preview',
	),
	agentManagerShowPreview: localize(
		'message.agentManagerShowPreview',
		'Show Preview',
	),
	agentManagerHideInspector: localize(
		'message.agentManagerHideInspector',
		'Hide Inspector',
	),
	agentManagerShowInspector: localize(
		'message.agentManagerShowInspector',
		'Show Inspector',
	),
	agentManagerNew: localize('message.agentManagerNew', 'New'),
	agentManagerLoad: localize('message.agentManagerLoad', 'Load'),
	agentManagerSave: localize('message.agentManagerSave', 'Save'),
	agentManagerDelete: localize('message.agentManagerDelete', 'Delete'),
	agentManagerOpenFolder: localize(
		'message.agentManagerOpenFolder',
		'Open folder',
	),
	agentManagerGeneratePrompt: localize(
		'message.agentManagerGeneratePrompt',
		'Generate Prompt',
	),
	agentManagerCopy: localize('message.agentManagerCopy', 'Copy'),
	agentManagerAddAgent: localize(
		'message.agentManagerAddAgent',
		'Add Agent',
	),
	agentManagerAddLoop: localize(
		'message.agentManagerAddLoop',
		'Add Loop',
	),
	agentManagerCanvasHint: localize(
		'message.agentManagerCanvasHint',
		'Drag from a port and connect the right port to the left port.',
	),
	agentManagerConnector: localize(
		'message.agentManagerConnector',
		'Connector',
	),
	agentManagerSource: localize('message.agentManagerSource', 'Source'),
	agentManagerTarget: localize('message.agentManagerTarget', 'Target'),
	agentManagerKind: localize('message.agentManagerKind', 'Kind'),
	agentManagerConnectorDescription: localize(
		'message.agentManagerConnectorDescription',
		'Connection details',
	),
	agentManagerDeleteCard: localize(
		'message.agentManagerDeleteCard',
		'Delete card',
	),
	agentManagerDeleteConnector: localize(
		'message.agentManagerDeleteConnector',
		'Delete connector',
	),
	agentManagerAgent: localize('message.agentManagerAgent', 'Agent'),
	agentManagerLoop: localize('message.agentManagerLoop', 'Loop'),
	agentManagerName: localize('message.agentManagerName', 'Name'),
	agentManagerNumber: localize('message.agentManagerNumber', 'No'),
	agentManagerPurpose: localize('message.agentManagerPurpose', 'Purpose'),
	agentManagerInput: localize('message.agentManagerInput', 'Input'),
	agentManagerExpectedOutput: localize(
		'message.agentManagerExpectedOutput',
		'Expected output',
	),
	agentManagerDoneCriteria: localize(
		'message.agentManagerDoneCriteria',
		'Done criteria',
	),
	agentManagerMaxAttempts: localize(
		'message.agentManagerMaxAttempts',
		'Max attempts',
	),
	agentManagerOutputFormat: localize(
		'message.agentManagerOutputFormat',
		'Output format',
	),
	agentManagerSavedIn: localize('message.agentManagerSavedIn', 'Saved in'),
	agentManagerCards: localize('message.agentManagerCards', 'Cards'),
	agentManagerConnectors: localize(
		'message.agentManagerConnectors',
		'Connectors',
	),
	agentManagerErrors: localize('message.agentManagerErrors', 'Errors'),
	agentManagerWarnings: localize('message.agentManagerWarnings', 'Warnings'),
	agentManagerRetryControl: localize(
		'message.agentManagerRetryControl',
		'Retry control',
	),
	agentManagerSubagent: localize(
		'message.agentManagerSubagent',
		'Sub Agent',
	),
	agentManagerAcceptanceCriteriaHint: localize(
		'message.agentManagerAcceptanceCriteriaHint',
		'Describe the acceptance criteria.',
	),
	agentManagerDelegationHint: localize(
		'message.agentManagerDelegationHint',
		'If not set, leave it to the agent-specific behavior.',
	),
	agentManagerNoPromptToCopy: localize(
		'message.agentManagerNoPromptToCopy',
		'There is no prompt available to copy.',
	),
	agentManagerNoSavedWorkflowSelected: localize(
		'message.agentManagerNoSavedWorkflowSelected',
		'No saved workflow is selected.',
	),
	agentManagerCardDeleted: localize(
		'message.agentManagerCardDeleted',
		'Card deleted.',
	),
	agentManagerConnectorDeleted: localize(
		'message.agentManagerConnectorDeleted',
		'Connector deleted.',
	),
	agentManagerCardAdded: localize(
		'message.agentManagerCardAdded',
		'Card added.',
	),
	agentManagerConnectorAdded: localize(
		'message.agentManagerConnectorAdded',
		'Connector added.',
	),
	agentManagerConfirmDeleteWorkflow: localize(
		'message.agentManagerConfirmDeleteWorkflow',
		'Delete the selected workflow?',
	),
	agentManagerConfirmDeleteCard: localize(
		'message.agentManagerConfirmDeleteCard',
		'Delete this card?',
	),
	agentManagerConfirmDeleteConnector: localize(
		'message.agentManagerConfirmDeleteConnector',
		'Delete this connector?',
	),
	agentManagerWorkflowDescriptionPlaceholder: localize(
		'message.agentManagerWorkflowDescriptionPlaceholder',
		'Describe what this workflow is meant to accomplish.',
	),
	agentManagerWorkflowOutputFormatPlaceholder: localize(
		'message.agentManagerWorkflowOutputFormatPlaceholder',
		'If there is a special output format instruction, enter it here.',
	),
	agentManagerAcceptanceCriteriaPlaceholder: localize(
		'message.agentManagerAcceptanceCriteriaPlaceholder',
		'Describe how the loop decides whether it can stop.',
	),
	agentManagerPurposePlaceholder: localize(
		'message.agentManagerPurposePlaceholder',
		'Describe what this agent is responsible for.',
	),
	agentManagerInputPlaceholder: localize(
		'message.agentManagerInputPlaceholder',
		'List the context, files, or inputs this agent should use.',
	),
	agentManagerExpectedOutputPlaceholder: localize(
		'message.agentManagerExpectedOutputPlaceholder',
		'Describe the output this agent should return.',
	),
	agentManagerDoneCriteriaPlaceholder: localize(
		'message.agentManagerDoneCriteriaPlaceholder',
		'Explain how to judge whether this agent is done.',
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
	coreViewInstructionsChainTab: localize(
		'message.coreViewInstructionsChainTab',
		'Instructions Chain',
	),
	chainSummaryFound: localize('message.chainSummaryFound', 'Found'),
	chainSummaryPotentialConflict: localize(
		'message.chainSummaryPotentialConflict',
		'Multiple Instructions may contain conflicting guidance.',
	),
	chainAddInstruction: localize(
		'message.chainAddInstruction',
		'Add instruction file',
	),
	chainAddInstructionTypePlaceholder: localize(
		'message.chainAddInstructionTypePlaceholder',
		'Select an instruction type.',
	),
	chainInstructionAlreadyExists: localize(
		'message.chainInstructionAlreadyExists',
		'A file with the same name already exists.',
	),
	chainPathInstructionFilePrompt: localize(
		'message.chainPathInstructionFilePrompt',
		'Enter a file name. Leave empty to use the folder name.',
	),
	chainPathInstructionAddFolder: localize(
		'message.chainPathInstructionAddFolder',
		'Add Path Instruction folder',
	),
	chainPathInstructionAddFile: localize(
		'message.chainPathInstructionAddFile',
		'Add Path Instruction file',
	),
	chainPathInstructionPreview: (fileName: string) =>
		localize(
			'message.chainPathInstructionPreview',
			'File to create: {0}',
			fileName,
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
	chainStatusFound: localize('message.chainStatusFound', 'Found'),
	chainStatusUsedTogether: localize(
		'message.chainStatusUsedTogether',
		'Used together',
	),
	chainStatusMatched: localize('message.chainStatusMatched', 'Matched'),
	chainStatusNotMatched: localize('message.chainStatusNotMatched', 'Not matched'),
	chainStatusAppliesWhenPathMatches: localize(
		'message.chainStatusAppliesWhenPathMatches',
		'Applies when path matches',
	),
	chainStatusInvalidApplyTo: localize(
		'message.chainStatusInvalidApplyTo',
		'Invalid applyTo',
	),
	chainStatusProblem: localize(
		'message.chainStatusProblem',
		'Problem',
	),
	chainDetailStatus: localize(
		'message.chainDetailStatus',
		'Status',
	),
	chainDetailScope: localize('message.chainDetailScope', 'Scope'),
	chainDetailClassification: localize(
		'message.chainDetailClassification',
		'Classification',
	),
	chainDetailPath: localize(
		'message.chainDetailPath',
		'Path',
	),
	chainDetailApplyTo: localize('message.chainDetailApplyTo', 'Apply condition'),
	chainDetailCurrentFile: localize('message.chainDetailCurrentFile', 'Current file'),
	chainDetailExplanation: localize(
		'message.chainDetailExplanation',
		'Explanation',
	),
	chainClassificationUser: localize(
		'message.chainClassificationUser',
		'User Instructions',
	),
	chainClassificationWorkspace: localize(
		'message.chainClassificationWorkspace',
		'Workspace Instructions',
	),
	chainClassificationPath: localize(
		'message.chainClassificationPath',
		'Path Instructions',
	),
	chainClassificationAgent: localize(
		'message.chainClassificationAgent',
		'Agent Instructions',
	),
	chainClassificationCustomAgent: localize(
		'message.chainClassificationCustomAgent',
		'Custom Agent Instructions',
	),
	chainScopeUser: localize('message.chainScopeUser', 'User / All workspaces'),
	chainScopeWorkspace: localize(
		'message.chainScopeWorkspace',
		'Workspace / Repository',
	),
	chainScopePath: localize('message.chainScopePath', 'Path-specific'),
	chainScopeAgent: localize('message.chainScopeAgent', 'Workspace / Agent'),
	chainScopeCustomAgent: localize(
		'message.chainScopeCustomAgent',
		'Custom / Agent',
	),
	chainExplainUser: localize(
		'message.chainExplainUser',
		'User-wide Copilot CLI instructions. Used together with workspace, path, agent, and custom instructions when those files exist.',
	),
	chainExplainWorkspace: localize(
		'message.chainExplainWorkspace',
		'Workspace-wide Copilot instructions. Used together with user, path, agent, and custom instructions when those files exist.',
	),
	chainExplainPath: localize(
		'message.chainExplainPath',
		'Instructions that apply when the current work matches the applyTo frontmatter glob patterns.',
	),
	chainExplainAgent: localize(
		'message.chainExplainAgent',
		'Agent-oriented instructions defined in AGENTS.md. Used together with other Copilot instructions.',
	),
	chainExplainCustomAgent: localize(
		'message.chainExplainCustomAgent',
		'Custom agent instructions loaded from AGENTS.md in directories specified by COPILOT_CUSTOM_INSTRUCTIONS_DIRS.',
	),
	chainExplainInvalidApplyTo: localize(
		'message.chainExplainInvalidApplyTo',
		'The applyTo frontmatter is missing or invalid.',
	),
	chainExplainProblem: (reason: string) =>
		localize(
			'message.chainExplainProblem',
			'The file exists but could not be read. {0}',
			reason,
		),
	chainReasonAvailable: localize(
		'message.chainReasonAvailable',
		'Instruction file is available.',
	),
	chainReasonReadFailed: localize(
		'message.chainReasonReadFailed',
		'Read failed.',
	),
	chainReasonInvalidApplyTo: localize(
		'message.chainReasonInvalidApplyTo',
		'The applyTo frontmatter is missing or invalid.',
	),
	chainReasonAppliesWhenPathMatches: localize(
		'message.chainReasonAppliesWhenPathMatches',
		'Applies when the current file matches applyTo.',
	),
	chainReasonOutsideWorkspace: localize(
		'message.chainReasonOutsideWorkspace',
		'The current file is outside the workspace.',
	),
	chainReasonCurrentFileMatchesApplyTo: localize(
		'message.chainReasonCurrentFileMatchesApplyTo',
		'The current file matches applyTo.',
	),
	chainReasonCurrentFileDoesNotMatchApplyTo: localize(
		'message.chainReasonCurrentFileDoesNotMatchApplyTo',
		'The current file does not match applyTo.',
	),
	chainEmpty: localize(
		'message.chainEmpty',
		'No instruction files were found.',
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
	hooksSchemaLabel: localize('message.hooksSchemaLabel', 'Schema'),
	hooksCommandLabel: localize('message.hooksCommandLabel', 'Command'),
	hooksTypeLabel: localize('message.hooksTypeLabel', 'Type'),
	hooksBashLabel: localize('message.hooksBashLabel', 'Bash'),
	hooksPowershellLabel: localize('message.hooksPowershellLabel', 'PowerShell'),
	hooksPromptLabel: localize('message.hooksPromptLabel', 'Prompt'),
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
	pluginsEmpty: localize(
		'message.pluginsEmpty',
		'No installed plugins were found.',
	),
	pluginsAgents: localize('message.pluginsAgents', 'Agents'),
	pluginsSkills: localize('message.pluginsSkills', 'Skills'),
	pluginsCommands: localize('message.pluginsCommands', 'Commands'),
	pluginsHooks: localize('message.pluginsHooks', 'Hooks'),
	pluginsMcpServers: localize('message.pluginsMcpServers', 'MCP Servers'),
	pluginsLspServers: localize('message.pluginsLspServers', 'LSP Servers'),
	pluginsDiagnostics: localize('message.pluginsDiagnostics', 'Diagnostics'),
	pluginsState: localize('message.pluginsState', 'State'),
	pluginsToggle: localize('message.pluginsToggle', 'Enable plugin'),
	pluginToggleUpdated: localize(
		'message.plugin.toggleUpdated',
		'Plugin settings updated. Please restart GitHub Copilot CLI to apply changes.',
	),
	pluginsInstallKind: localize('message.pluginsInstallKind', 'Install kind'),
	pluginsPluginRoot: localize('message.pluginsPluginRoot', 'Plugin root'),
	pluginsManifestPath: localize('message.pluginsManifestPath', 'Manifest'),
	pluginsVersion: localize('message.pluginsVersion', 'Version'),
	pluginsAuthor: localize('message.pluginsAuthor', 'Author'),
	pluginsLicense: localize('message.pluginsLicense', 'License'),
	pluginsHomepage: localize('message.pluginsHomepage', 'Homepage'),
	pluginsRepository: localize('message.pluginsRepository', 'Repository'),
	pluginsKeywords: localize('message.pluginsKeywords', 'Keywords'),
	pluginsCategory: localize('message.pluginsCategory', 'Category'),
	pluginsTags: localize('message.pluginsTags', 'Tags'),
	pluginsDescription: localize('message.pluginsDescription', 'Description'),
	pluginsPath: localize('message.pluginsPath', 'Path'),
	pluginsStatus: localize('message.pluginsStatus', 'Status'),
	pluginsSource: localize('message.pluginsSource', 'Source'),
	pluginsCount: localize('message.pluginsCount', 'Count'),
	pluginsType: localize('message.pluginsType', 'Type'),
	pluginsTools: localize('message.pluginsTools', 'Tools'),
	pluginsSeverity: localize('message.pluginsSeverity', 'Severity'),
	pluginsStateEnabled: localize('message.pluginsStateEnabled', 'Enabled'),
	pluginsStateDisabled: localize('message.pluginsStateDisabled', 'Disabled'),
	pluginsStateUnknown: localize('message.pluginsStateUnknown', 'Unknown'),
	pluginsInstallKindMarketplace: localize(
		'message.pluginsInstallKindMarketplace',
		'Marketplace',
	),
	pluginsInstallKindDirect: localize(
		'message.pluginsInstallKindDirect',
		'Direct',
	),
	pluginsInstallKindUnknown: localize(
		'message.pluginsInstallKindUnknown',
		'Unknown',
	),
	pluginsComponentStatusReadonly: localize(
		'message.pluginsComponentStatusReadonly',
		'Readonly',
	),
	pluginsComponentStatusConflict: localize(
		'message.pluginsComponentStatusConflict',
		'Conflict',
	),
	pluginsComponentStatusOverridden: localize(
		'message.pluginsComponentStatusOverridden',
		'Overridden',
	),
	pluginsDiagnosticSeverityInfo: localize(
		'message.pluginsDiagnosticSeverityInfo',
		'Info',
	),
	pluginsDiagnosticSeverityWarning: localize(
		'message.pluginsDiagnosticSeverityWarning',
		'Warning',
	),
	pluginsDiagnosticSeverityError: localize(
		'message.pluginsDiagnosticSeverityError',
		'Error',
	),
	pluginsInlineSource: localize(
		'message.pluginsInlineSource',
		'plugin.json inline',
	),
	pluginsManifestNotFound: localize(
		'message.pluginsManifestNotFound',
		'Manifest not found',
	),
	pluginsManifestParseError: (reason: string) =>
		localize(
			'message.pluginsManifestParseError',
			'Manifest parse error: {0}',
			reason,
		),
	pluginsMissingName: localize(
		'message.pluginsMissingName',
		'Missing plugin name',
	),
	pluginsDirectInstallDetected: localize(
		'message.pluginsDirectInstallDetected',
		'Direct plugin install detected.',
	),
	pluginsReadonlyComponents: localize(
		'message.pluginsReadonlyComponents',
		'Plugin components are read-only.',
	),
	pluginsAgentConflict: (name: string) =>
		localize(
			'message.pluginsAgentConflict',
			'Agent conflict: {0}',
			name,
		),
	pluginsSkillConflict: (name: string) =>
		localize(
			'message.pluginsSkillConflict',
			'Skill conflict: {0}',
			name,
		),
	pluginsMcpOverride: (name: string) =>
		localize(
			'message.pluginsMcpOverride',
			'MCP override: {0}',
			name,
		),
	pluginsSecretMasked: localize(
		'message.pluginsSecretMasked',
		'Secret-like value masked',
	),
	pluginsComponentPathNotFound: (fieldName: string, targetPath: string) =>
		localize(
			'message.pluginsComponentPathNotFound',
			'Component path not found: {0} -> {1}',
			fieldName,
			targetPath,
		),
	pluginsJsonParseError: (fieldName: string, reason: string) =>
		localize(
			'message.pluginsJsonParseError',
			'{0} parse error: {1}',
			fieldName,
			reason,
		),
	pluginsNone: localize('message.pluginsNone', 'None'),
	mcpDisabled: localize('message.mcpDisabled', 'Disabled'),
	trustedSourceUserSettings: localize(
		'message.trustedSourceUserSettings',
		'User Settings',
	),
	trustedSourceWorkspaceSettings: localize(
		'message.trustedSourceWorkspaceSettings',
		'Workspace Settings',
	),
	trustedDirectoryMissing: localize(
		'message.trustedDirectoryMissing',
		'Directory does not exist or cannot be accessed.',
	),
	hooksWarningMergedSources: (layer: string) =>
		localize(
			'message.hooksWarningMergedSources',
			'{0} layer has both hooks.json and inline hooks. GitHub Copilot CLI merges them and warns at startup.',
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
		'Only command hook handlers are currently executed by GitHub Copilot CLI.',
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
	dialogOk: localize('message.dialogOk', 'OK'),
	file: {
		addFileTitle: localize('message.addFileTitle', 'Add file'),
		addCommandFileTitle: localize(
			'message.addCommandFileTitle',
			'Add Command file',
		),
		addSkillFileTitle: localize(
			'message.addSkillFileTitle',
			'Add Skill file',
		),
		addFolderTitle: localize('message.addFolderTitle', 'Add folder'),
		addSkillFolderTitle: localize(
			'message.addSkillFolderTitle',
			'Add Skill folder',
		),
		inputFileName: localize('message.inputFileName', 'Enter a file name.'),
		inputCommandFileName: localize(
			'message.inputCommandFileName',
			'Enter a Command name.',
		),
		commandLocationPickPlaceholder: localize(
			'message.commandLocationPickPlaceholder',
			'Select where to save the prompt file.',
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
		createFilePreview: (fileName: string) =>
			localize(
				'message.createFilePreview',
				'File to create: {0}',
				fileName,
			),
		createFolderPreview: (folderName: string) =>
			localize(
				'message.createFolderPreview',
				'Folder to create: {0}',
				folderName,
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
			'Select a target in commands, skills, or templates.',
		),
	},
	agent: {
		addFileTitle: localize(
			'message.agent.addFileTitle',
			'Add Sub Agent file',
		),
		inputName: localize(
			'message.agent.inputName',
			'Enter a Sub Agent name.',
		),
		inputDescription: localize(
			'message.agent.inputDescription',
			'Enter an agent description.',
		),
		createFilePreview: (fileName: string) =>
			localize(
				'message.agent.createFilePreview',
				'File to create: {0}',
				fileName,
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
			'Agent settings updated. Please restart GitHub Copilot CLI to apply changes.',
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
