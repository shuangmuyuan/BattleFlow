export type AgentProvider = 'claude-code-cli' | 'claude-cli' | 'coze-sdk';

export type AgentChatRole = 'user' | 'assistant' | 'system';

export interface AgentChatMessage {
  role: AgentChatRole;
  content: string;
}

export type AgentSessionStatus = 'starting' | 'requesting' | 'running' | 'done' | 'aborted' | 'error';

export type AgentEvent =
  | { type: 'session_status'; status: AgentSessionStatus; sessionId?: string }
  | { type: 'assistant_message'; text: string }
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
  mode: 'structured-cli';
  outputFormat: 'stream-json';
  toolsEnabled: boolean;
  auth: {
    anthropicBaseUrlConfigured: boolean;
    anthropicTokenConfigured: boolean;
  };
  error?: string;
}

export interface AgentTurnInput {
  messages: AgentChatMessage[];
  systemPrompt: string;
  signal?: AbortSignal;
}
