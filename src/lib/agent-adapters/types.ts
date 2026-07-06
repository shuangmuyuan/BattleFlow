export type AgentProvider = 'claude-code-cli' | 'claude-cli';

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
  mode: 'structured-cli';
  outputFormat: 'stream-json';
  toolsEnabled: boolean;
  tools?: string[];
  auth: {
    anthropicBaseUrlConfigured: boolean;
    anthropicTokenConfigured: boolean;
  };
  error?: string;
}

export interface AgentTurnInput {
  messages: AgentChatMessage[];
  systemPrompt: string;
  attachments?: AgentInputAttachment[];
  readableDirectories?: string[];
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
