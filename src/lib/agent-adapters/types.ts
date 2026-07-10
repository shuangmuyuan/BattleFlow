export type AgentProvider = 'claude-agent-sdk';

export type AgentChatRole = 'user' | 'assistant' | 'system';

export interface AgentChatMessage {
  role: AgentChatRole;
  content: string;
}

export interface AgentInputAttachment {
  name: string;
  mimeType: string;
  dataUrl: string;
}

export type AgentSessionStatus = 'starting' | 'requesting' | 'running' | 'done' | 'aborted' | 'error';
export type AgentToolCallStatus = 'running' | 'completed' | 'failed' | 'canceled';
export type AgentHumanInputKind = 'ask_user_question' | 'tool_permission';

export interface AgentHumanInputOption {
  label: string;
  description: string;
  preview?: string;
}

export interface AgentHumanInputQuestion {
  question: string;
  header: string;
  options: AgentHumanInputOption[];
  multiSelect?: boolean;
}

export interface AgentHumanInputRequest {
  id: string;
  kind: AgentHumanInputKind;
  prompt: string;
  title?: string;
  description?: string;
  toolName?: string;
  toolUseId?: string;
  dialogKind?: string;
  payload?: Record<string, unknown>;
  questions?: AgentHumanInputQuestion[];
  input?: Record<string, unknown>;
}

export type AgentHumanInputResponse =
  | { behavior: 'completed'; result: unknown }
  | { behavior: 'cancelled'; message?: string }
  | { behavior: 'allow'; message?: string }
  | { behavior: 'deny'; message?: string };

export interface AgentToolCallEvent {
  type: 'tool_call';
  id: string;
  name: string;
  status: AgentToolCallStatus;
  input?: Record<string, unknown>;
  inputText?: string;
  inputJsonDelta?: string;
  result?: unknown;
  resultPreview?: string;
  error?: string;
  parentId?: string;
  timestamp?: string;
}

export type AgentEvent =
  | { type: 'session_status'; status: AgentSessionStatus; sessionId?: string }
  | { type: 'assistant_message'; text: string }
  | { type: 'assistant_final'; text: string }
  | AgentToolCallEvent
  | { type: 'human_input_request'; request: AgentHumanInputRequest }
  | { type: 'human_input_resolved'; requestId: string; response?: AgentHumanInputResponse }
  | { type: 'terminal_output'; stream: 'stdout' | 'stderr'; text: string }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number; costUsd?: number; model?: string }
  | { type: 'error'; error: string };

export interface AgentRuntimeStatus {
  provider: AgentProvider;
  available: boolean;
  command: string;
  version?: string;
  model?: string;
  cwd?: string;
  readableDirectories?: string[];
  mode: 'agent-sdk';
  outputFormat: 'sdk-message';
  toolsEnabled: boolean;
  tools?: string[];
  disallowedTools?: string[];
  writeToolsEnabled?: boolean;
  writeTools?: string[];
  readGuardEnabled?: boolean;
  strictMcpConfig?: boolean;
  toolGuardEnabled?: boolean;
  writeGuardEnabled?: boolean;
  auth: {
    anthropicBaseUrlConfigured: boolean;
    anthropicTokenConfigured: boolean;
  };
  error?: string;
}

export interface AgentTurnInput {
  messages: AgentChatMessage[];
  systemPrompt: string;
  resumeSessionId?: string;
  cwd?: string;
  skills?: string[];
  attachments?: AgentInputAttachment[];
  readableDirectories?: string[];
  writableRoot?: string;
  tools?: string[];
  persistSession?: boolean;
  onHumanInputRequest?: (
    request: AgentHumanInputRequest,
    options: { signal: AbortSignal },
  ) => Promise<AgentHumanInputResponse>;
  signal?: AbortSignal;
}

export interface AgentRunResult {
  text: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
    model?: string;
  };
}
