import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentEvent, AgentHumanInputRequest } from '@/lib/agent-adapters/types';
import type { SkillRecord } from '@/lib/skill-registry';
import type { WorkflowChatToolCallRecord, WorkflowRecord } from '@/lib/workflow-registry';

type MockChatRunStatus = 'running' | 'waiting_human' | 'succeeded' | 'failed' | 'canceled';

interface MockChatRunRecord {
  id: string;
  organizationId: string;
  workflowId: string;
  stepId: string;
  status: MockChatRunStatus;
  userMessage: string;
  assistantContent: string;
  toolCalls: WorkflowChatToolCallRecord[];
  error: string | null;
  sessionId: string | null;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MockChatRunEventRecord {
  runId: string;
  sequence: number;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

const mocks = vi.hoisted(() => ({
  streamClaudeAgentSdkTurn: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requirePermission: vi.fn(),
  normalizeChatKnowledgeBaseContexts: vi.fn(),
  selectKnowledgeBaseIdsFromChatBody: vi.fn(),
  isKnowledgeDatabaseConfigured: vi.fn(),
  listKnowledgeBases: vi.fn(),
  searchKnowledgeDocuments: vi.fn(),
  requireSkillIdAccess: vi.fn(),
  requireWorkflowAccess: vi.fn(),
  chatRunStore: new Map<string, MockChatRunRecord>(),
  chatRunEventStore: new Map<string, MockChatRunEventRecord[]>(),
  createChatRun: vi.fn(async (input: {
    id: string;
    organizationId: string;
    workflowId: string;
    stepId: string;
    userMessage: string;
    createdBy?: string | null;
    metadata?: Record<string, unknown>;
  }) => {
    const now = new Date().toISOString();
    const run: MockChatRunRecord = {
      id: input.id,
      organizationId: input.organizationId,
      workflowId: input.workflowId,
      stepId: input.stepId,
      status: 'running',
      userMessage: input.userMessage,
      assistantContent: '',
      toolCalls: [],
      error: null,
      sessionId: null,
      metadata: input.metadata || {},
      createdBy: input.createdBy || null,
      startedAt: now,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    mocks.chatRunStore.set(run.id, run);
    return run;
  }),
  getChatRun: vi.fn(async (runId: string) => mocks.chatRunStore.get(runId) || null),
  listChatRuns: vi.fn(async (input: {
    organizationId: string;
    workflowId: string;
    stepId?: string;
    limit?: number;
  }) => [...mocks.chatRunStore.values()]
    .filter((run) => (
      run.organizationId === input.organizationId
      && run.workflowId === input.workflowId
      && (!input.stepId || run.stepId === input.stepId)
    ))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, input.limit || 50)),
  updateChatRun: vi.fn(async (input: {
    runId: string;
    status?: MockChatRunStatus;
    assistantContent?: string;
    toolCalls?: WorkflowChatToolCallRecord[];
    error?: string | null;
    sessionId?: string | null;
    metadata?: Record<string, unknown>;
    completedAt?: string | null;
  }) => {
    const current = mocks.chatRunStore.get(input.runId);
    if (!current) return null;
    const updated: MockChatRunRecord = {
      ...current,
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.assistantContent !== undefined ? { assistantContent: input.assistantContent } : {}),
      ...(input.toolCalls !== undefined ? { toolCalls: input.toolCalls } : {}),
      ...(input.error !== undefined ? { error: input.error } : {}),
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      ...(input.completedAt !== undefined ? { completedAt: input.completedAt } : {}),
      updatedAt: new Date().toISOString(),
    };
    mocks.chatRunStore.set(updated.id, updated);
    return updated;
  }),
  appendChatRunEvent: vi.fn(async (input: {
    runId: string;
    eventType: string;
    payload: Record<string, unknown>;
    createdAt?: string;
  }) => {
    const events = mocks.chatRunEventStore.get(input.runId) || [];
    const event: MockChatRunEventRecord = {
      runId: input.runId,
      sequence: events.length + 1,
      eventType: input.eventType,
      payload: input.payload,
      createdAt: input.createdAt || new Date().toISOString(),
    };
    events.push(event);
    mocks.chatRunEventStore.set(input.runId, events);
    return event;
  }),
  listChatRunEvents: vi.fn(async (input: {
    runId: string;
    afterSequence?: number;
    limit?: number;
  }) => (mocks.chatRunEventStore.get(input.runId) || [])
    .filter((event) => event.sequence > (input.afterSequence || 0))
    .slice(0, input.limit || 500)),
  getSkill: vi.fn(),
  findWorkflowAttachment: vi.fn(),
  materializeNodeWorkspace: vi.fn(),
  getWorkflowArtifactsDirectory: vi.fn(),
  getWorkflow: vi.fn(),
  upsertWorkflow: vi.fn(),
}));

vi.mock('@/lib/agent-adapters/claude-agent-sdk', () => ({
  streamClaudeAgentSdkTurn: mocks.streamClaudeAgentSdkTurn,
}));

vi.mock('@/lib/auth/server', () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requirePermission: mocks.requirePermission,
}));

vi.mock('@/lib/auth/types', () => {
  class AuthError extends Error {
    status: number;

    constructor(message = 'Authentication required', status = 401) {
      super(message);
      this.name = 'AuthError';
      this.status = status;
    }
  }

  class ForbiddenError extends AuthError {
    constructor(message = 'Forbidden') {
      super(message, 403);
      this.name = 'ForbiddenError';
    }
  }

  return { AuthError, ForbiddenError };
});

vi.mock('@/lib/chat-knowledge-context', () => ({
  normalizeChatKnowledgeBaseContexts: mocks.normalizeChatKnowledgeBaseContexts,
  selectKnowledgeBaseIdsFromChatBody: mocks.selectKnowledgeBaseIdsFromChatBody,
}));

vi.mock('@/lib/chat-run-repository', () => ({
  createChatRun: mocks.createChatRun,
  getChatRun: mocks.getChatRun,
  listChatRuns: mocks.listChatRuns,
  updateChatRun: mocks.updateChatRun,
  appendChatRunEvent: mocks.appendChatRunEvent,
  listChatRunEvents: mocks.listChatRunEvents,
}));

vi.mock('@/lib/chat-human-input', async () => vi.importActual('../../../lib/chat-human-input'));

vi.mock('@/lib/knowledge-repository', () => ({
  isKnowledgeDatabaseConfigured: mocks.isKnowledgeDatabaseConfigured,
  KnowledgeDatabaseConfigError: class KnowledgeDatabaseConfigError extends Error {},
  listKnowledgeBases: mocks.listKnowledgeBases,
  searchKnowledgeDocuments: mocks.searchKnowledgeDocuments,
}));

vi.mock('@/lib/resource-metadata-repository', () => ({
  requireSkillIdAccess: mocks.requireSkillIdAccess,
  requireWorkflowAccess: mocks.requireWorkflowAccess,
}));

vi.mock('@/lib/simplified-chinese', async () => vi.importActual('../../../lib/simplified-chinese'));

vi.mock('@/lib/skill-registry', () => ({
  getSkill: mocks.getSkill,
}));

vi.mock('@/lib/workflow-attachments', () => ({
  findWorkflowAttachment: mocks.findWorkflowAttachment,
}));

vi.mock('@/lib/workflow-node-workspace', () => ({
  materializeNodeWorkspace: mocks.materializeNodeWorkspace,
}));

vi.mock('@/lib/workflow-runtime-paths', () => ({
  getWorkflowArtifactsDirectory: mocks.getWorkflowArtifactsDirectory,
}));

vi.mock('@/lib/workflow-registry', () => ({
  getWorkflow: mocks.getWorkflow,
  upsertWorkflow: mocks.upsertWorkflow,
}));

vi.mock('@/lib/workflow-skill-draft', () => ({
  cleanExecutableSkillText: (value: string) => value,
}));

import { DELETE, GET, POST } from './route';

const authContext = {
  user: { id: 'user-1' },
  activeOrganization: { id: 'org-1' },
};

function skillRecord(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: 'skill-1',
    skill_id: 'user-needs-breakdown',
    display_name: '用户需求拆解',
    name: 'User Needs Breakdown',
    description: 'Break down user needs into scenarios, stories, and acceptance criteria.',
    version: '1.0.0',
    author: 'BattleFlow',
    tags: [],
    source_type: 'local',
    scope: 'official',
    status: 'published',
    methodology: 'SERVER_METHODOLOGY_SHOULD_NOT_BE_IN_PROMPT',
    tools: ['knowledge_query'],
    outputs: {},
    checklist: ['SERVER_CHECKLIST_SHOULD_NOT_BE_IN_PROMPT'],
    prompt_template: 'SERVER_PROMPT_TEMPLATE_SHOULD_NOT_BE_IN_PROMPT',
    skill_md: 'SERVER_SKILL_MD_SHOULD_NOT_BE_IN_PROMPT',
    meta_json: {},
    changelog: '',
    attachments: [],
    package_assets: [],
    created_at: '2026-07-08T00:00:00.000Z',
    updated_at: '2026-07-08T00:00:00.000Z',
    versions: [{
      version: '1.0.0',
      updated_at: '2026-07-08T00:00:00.000Z',
      changelog: '',
      package_path: '/tmp/battleflow-skill-package',
    }],
    is_active: true,
    ...overrides,
  };
}

function workflow(overrides: Partial<WorkflowRecord> = {}): WorkflowRecord {
  return {
    id: 'workflow-1',
    workspaceId: 'workspace-1',
    name: 'Language normalization workflow',
    description: '',
    status: 'in_progress',
    agentValidationEnabled: false,
    steps: [{
      id: 'step-1',
      skill_id: 'skill-1',
      step_index: 0,
      runMode: 'serial',
      name: 'Market analysis',
      status: 'in_progress',
      output: '',
      created_at: '2026-07-04T00:00:00.000Z',
      updated_at: '2026-07-04T00:00:00.000Z',
    }],
    contextFiles: [],
    reviewedOutputFiles: [],
    artifacts: [],
    reviewComments: {},
    archivedReviewStepIds: [],
    contextSelections: {},
    stepSnapshots: [],
    stepChats: {},
    skillDrafts: {},
    validationAttempts: [],
    demoHandoffs: [],
    created_at: '2026-07-04T00:00:00.000Z',
    updated_at: '2026-07-04T00:00:00.000Z',
    ...overrides,
  };
}

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function streamAgentEvents(events: AgentEvent[]) {
  return new ReadableStream<AgentEvent>({
    start(controller) {
      for (const event of events) controller.enqueue(event);
      controller.close();
    },
  });
}

function parseSse(text: string) {
  return text
    .trim()
    .split('\n\n')
    .filter(Boolean)
    .map((chunk) => {
      const dataLine = chunk.split(/\r?\n/).find((line) => line.startsWith('data: '));
      if (!dataLine) throw new Error(`SSE data line missing: ${chunk}`);
      return JSON.parse(dataLine.slice(6)) as Record<string, unknown>;
    });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.chatRunStore.clear();
  mocks.chatRunEventStore.clear();

  mocks.requireOrganizationContext.mockResolvedValue(authContext);
  mocks.requirePermission.mockReturnValue(undefined);
  mocks.requireWorkflowAccess.mockResolvedValue(undefined);
  mocks.requireSkillIdAccess.mockResolvedValue(undefined);
  mocks.normalizeChatKnowledgeBaseContexts.mockReturnValue([]);
  mocks.selectKnowledgeBaseIdsFromChatBody.mockReturnValue([]);
  mocks.isKnowledgeDatabaseConfigured.mockReturnValue(false);
  mocks.listKnowledgeBases.mockResolvedValue([]);
  mocks.searchKnowledgeDocuments.mockResolvedValue([]);
  mocks.getSkill.mockResolvedValue(skillRecord());
  mocks.findWorkflowAttachment.mockReturnValue(null);
  mocks.getWorkflowArtifactsDirectory.mockReturnValue('/tmp/battleflow-runtime/org-1/workflow-1/artifacts');
  mocks.materializeNodeWorkspace.mockResolvedValue({
    cwd: '/tmp/battleflow-runtime/org-1/workflow-1/nodes/step-1',
    skillsRoot: '/tmp/battleflow-runtime/org-1/workflow-1/nodes/step-1/.claude/skills',
    skillName: 'user-needs-breakdown',
    skillDirectory: '/tmp/battleflow-runtime/org-1/workflow-1/nodes/step-1/.claude/skills/user-needs-breakdown',
    skillFilePath: '/tmp/battleflow-runtime/org-1/workflow-1/nodes/step-1/.claude/skills/user-needs-breakdown/SKILL.md',
    metadataPath: '/tmp/battleflow-runtime/org-1/workflow-1/nodes/step-1/.battleflow-node-workspace.json',
  });
  mocks.getWorkflow.mockResolvedValue(workflow());
  mocks.upsertWorkflow.mockImplementation(async (record: WorkflowRecord) => record);
});

describe('Chat API route', () => {
  it('normalizes streamed assistant output and persisted messages to Simplified Chinese', async () => {
    mocks.streamClaudeAgentSdkTurn.mockReturnValue(streamAgentEvents([
      { type: 'assistant_message', text: '這是一段' },
      { type: 'assistant_message', text: '產品規劃。' },
      { type: 'assistant_final', text: '最終輸出：關鍵風險。' },
      { type: 'session_status', status: 'done' },
    ]));

    const response = await POST(postRequest({
      workflowId: 'workflow-1',
      workflow_step_id: 'step-1',
      messages: [{ role: 'user', content: '請輸出繁體字' }],
    }));
    const events = parseSse(await response.text());

    expect(response.status).toBe(200);
    expect(mocks.createChatRun).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      workflowId: 'workflow-1',
      stepId: 'step-1',
      createdBy: 'user-1',
    }));
    expect(events[0]).toEqual(expect.objectContaining({
      event: 'chat_run',
      workflow_id: 'workflow-1',
      step_id: 'step-1',
      status: 'running',
    }));
    expect(events).toContainEqual(expect.objectContaining({ content: '这是一段' }));
    expect(events).toContainEqual(expect.objectContaining({ content: '产品规划。' }));
    expect(events).toContainEqual(expect.objectContaining({
      event: 'assistant_final',
      content: '最终输出：关键风险。',
      replace: true,
    }));
    const runId = events[0]?.run_id as string;
    expect(mocks.chatRunStore.get(runId)).toEqual(expect.objectContaining({
      status: 'succeeded',
      assistantContent: '最终输出：关键风险。',
    }));

    const agentInput = mocks.streamClaudeAgentSdkTurn.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
      systemPrompt: string;
    };
    expect(agentInput.messages.at(-1)?.content).toBe('請輸出繁體字');
    expect(agentInput.systemPrompt).toContain('所有面向用户的 AI 生成内容必须使用简体中文');

    const persistedWorkflow = mocks.upsertWorkflow.mock.calls.at(-1)?.[0] as WorkflowRecord;
    expect(persistedWorkflow.stepChats['step-1']).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: '最终输出：关键风险。',
      }),
    ]);
  });

  it('streams and persists structured tool results beyond the short preview', async () => {
    const fullContent = [
      '1|export function first() {',
      '2|  return "完整工具结果";',
      '3|}',
      '4|',
      '5|export function second() {',
      '6|  return "preview 之外的内容";',
      '7|}',
    ].join('\n');
    const toolResult = {
      content: fullContent,
      file: {
        filePath: '/tmp/battleflow/src/example.ts',
        numLines: 7,
      },
    };

    mocks.streamClaudeAgentSdkTurn.mockReturnValue(streamAgentEvents([
      {
        type: 'tool_call',
        id: 'tool-read-1',
        name: 'Read',
        status: 'running',
        input: { file_path: '/tmp/battleflow/src/example.ts' },
        timestamp: '2026-07-06T02:00:00.000Z',
      },
      {
        type: 'tool_call',
        id: 'tool-read-1',
        name: 'Read',
        status: 'completed',
        result: toolResult,
        resultPreview: 'export function first() {',
        timestamp: '2026-07-06T02:00:01.000Z',
      },
      { type: 'assistant_final', text: '已读取文件。' },
      { type: 'session_status', status: 'done' },
    ]));

    const response = await POST(postRequest({
      workflowId: 'workflow-1',
      workflow_step_id: 'step-1',
      messages: [{ role: 'user', content: '读取文件' }],
    }));
    const events = parseSse(await response.text());

    expect(response.status).toBe(200);
    expect(events).toContainEqual(expect.objectContaining({
      event: 'tool_call',
      tool_call: expect.objectContaining({
        id: 'tool-read-1',
        name: 'Read',
        status: 'completed',
        result: toolResult,
        resultPreview: 'export function first() {',
      }),
    }));

    const persistedWorkflow = mocks.upsertWorkflow.mock.calls.at(-1)?.[0] as WorkflowRecord;
    expect(persistedWorkflow.stepChats['step-1']).toEqual([
      expect.objectContaining({
        role: 'assistant',
        toolCalls: [
          expect.objectContaining({
            id: 'tool-read-1',
            name: 'Read',
            status: 'completed',
            result: toolResult,
            resultPreview: 'export function first() {',
          }),
        ],
      }),
    ]);
  });

  it('replays persisted run events after the requested sequence', async () => {
    mocks.streamClaudeAgentSdkTurn.mockReturnValue(streamAgentEvents([
      { type: 'assistant_message', text: '第一段' },
      { type: 'assistant_final', text: '最终段落' },
      { type: 'session_status', status: 'done' },
    ]));

    const postResponse = await POST(postRequest({
      workflowId: 'workflow-1',
      workflow_step_id: 'step-1',
      messages: [{ role: 'user', content: '生成内容' }],
    }));
    const postEvents = parseSse(await postResponse.text());
    const runId = postEvents[0]?.run_id as string;

    const replayResponse = await GET(new NextRequest(`http://localhost/api/chat?run_id=${runId}&after=1`, {
      method: 'GET',
    }));
    const replayEvents = parseSse(await replayResponse.text());

    expect(replayResponse.status).toBe(200);
    expect(replayEvents).not.toContainEqual(expect.objectContaining({ event: 'chat_run' }));
    expect(replayEvents).toContainEqual(expect.objectContaining({ content: '第一段' }));
    expect(replayEvents).toContainEqual(expect.objectContaining({
      event: 'assistant_final',
      content: '最终段落',
      replace: true,
    }));
    expect(replayEvents).toContainEqual(expect.objectContaining({ done: true }));
  });

  it('persists and streams human input pending and resolved events', async () => {
    const humanInputRequest: AgentHumanInputRequest = {
      id: 'prompt-1',
      kind: 'ask_user_question',
      prompt: '请选择输出格式？',
      dialogKind: 'ask_user_question',
      questions: [{
        question: '请选择输出格式？',
        header: '格式',
        options: [
          { label: 'Markdown', description: '生成 Markdown' },
          { label: 'DOCX', description: '生成 DOCX' },
        ],
      }],
    };
    mocks.streamClaudeAgentSdkTurn.mockReturnValue(streamAgentEvents([
      { type: 'human_input_request', request: humanInputRequest },
      {
        type: 'human_input_resolved',
        requestId: 'prompt-1',
        response: { behavior: 'completed', result: { answers: { '请选择输出格式？': 'Markdown' } } },
      },
      { type: 'assistant_final', text: '继续生成。' },
      { type: 'session_status', status: 'done' },
    ]));

    const response = await POST(postRequest({
      workflowId: 'workflow-1',
      workflow_step_id: 'step-1',
      messages: [{ role: 'user', content: '生成前先问我。' }],
    }));
    const events = parseSse(await response.text());

    expect(response.status).toBe(200);
    expect(events).toContainEqual(expect.objectContaining({
      event: 'human_input_request',
      status: 'waiting_human',
      human_input_request: humanInputRequest,
    }));
    expect(events).toContainEqual(expect.objectContaining({
      event: 'human_input_result',
      status: 'running',
      request_id: 'prompt-1',
      response_behavior: 'completed',
    }));
    const runId = events[0]?.run_id as string;
    expect(mocks.chatRunStore.get(runId)).toEqual(expect.objectContaining({
      status: 'succeeded',
      metadata: expect.not.objectContaining({
        pending_human_input: expect.anything(),
      }),
    }));

    const agentInput = mocks.streamClaudeAgentSdkTurn.mock.calls[0][0] as {
      onHumanInputRequest?: unknown;
    };
    expect(agentInput.onHumanInputRequest).toEqual(expect.any(Function));
  });

  it('includes pending human input in run lists for refresh recovery', async () => {
    const humanInputRequest: AgentHumanInputRequest = {
      id: 'prompt-list',
      kind: 'tool_permission',
      prompt: 'Write requires approval.',
      toolName: 'Write',
      input: { file_path: 'draft.md' },
    };
    const now = new Date().toISOString();
    mocks.chatRunStore.set('run-waiting', {
      id: 'run-waiting',
      organizationId: 'org-1',
      workflowId: 'workflow-1',
      stepId: 'step-1',
      status: 'waiting_human',
      userMessage: 'Create a draft',
      assistantContent: '',
      toolCalls: [],
      error: null,
      sessionId: null,
      metadata: { pending_human_input: humanInputRequest },
      createdBy: 'user-1',
      startedAt: now,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const response = await GET(new NextRequest('http://localhost/api/chat?workflow_id=workflow-1', {
      method: 'GET',
    }));
    const json = await response.json() as { runs: Array<Record<string, unknown>> };

    expect(response.status).toBe(200);
    expect(json.runs).toEqual([
      expect.objectContaining({
        id: 'run-waiting',
        status: 'waiting_human',
        pending_human_input: humanInputRequest,
      }),
    ]);
  });

  it('cancels waiting human runs and clears pending metadata', async () => {
    const humanInputRequest: AgentHumanInputRequest = {
      id: 'prompt-cancel',
      kind: 'ask_user_question',
      prompt: 'Continue?',
    };
    const now = new Date().toISOString();
    mocks.chatRunStore.set('run-cancel', {
      id: 'run-cancel',
      organizationId: 'org-1',
      workflowId: 'workflow-1',
      stepId: 'step-1',
      status: 'waiting_human',
      userMessage: 'Create a draft',
      assistantContent: '',
      toolCalls: [],
      error: null,
      sessionId: null,
      metadata: { pending_human_input: humanInputRequest },
      createdBy: 'user-1',
      startedAt: now,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const response = await DELETE(new NextRequest('http://localhost/api/chat?run_id=run-cancel', {
      method: 'DELETE',
    }));
    const json = await response.json() as { run: Record<string, unknown> };

    expect(response.status).toBe(200);
    expect(json.run).toEqual(expect.objectContaining({
      id: 'run-cancel',
      status: 'canceled',
    }));
    expect(mocks.chatRunStore.get('run-cancel')).toEqual(expect.objectContaining({
      status: 'canceled',
      metadata: expect.not.objectContaining({
        pending_human_input: expect.anything(),
      }),
    }));
    expect(mocks.chatRunEventStore.get('run-cancel')).toEqual([
      expect.objectContaining({
        eventType: 'chat_done',
        payload: expect.objectContaining({ done: true }),
      }),
    ]);
  });

  it('hides the node cwd from streamed and persisted tool calls', async () => {
    const nodeCwd = `${process.cwd()}/data/workflows/org-1/workflow-1/nodes/step-1`;
    const repoRelativeNodeCwd = 'data/workflows/org-1/workflow-1/nodes/step-1';
    const relativeSkillPath = '.claude/skills/user-needs-breakdown/SKILL.md';
    const absoluteSkillPath = `${nodeCwd}/${relativeSkillPath}`;
    const repoRelativeSkillPath = `${repoRelativeNodeCwd}/${relativeSkillPath}`;
    mocks.materializeNodeWorkspace.mockResolvedValue({
      cwd: nodeCwd,
      skillsRoot: `${nodeCwd}/.claude/skills`,
      skillName: 'user-needs-breakdown',
      skillDirectory: `${nodeCwd}/.claude/skills/user-needs-breakdown`,
      skillFilePath: absoluteSkillPath,
      metadataPath: `${nodeCwd}/.battleflow-node-workspace.json`,
    });
    mocks.streamClaudeAgentSdkTurn.mockReturnValue(streamAgentEvents([
      {
        type: 'tool_call',
        id: 'tool-read-cwd',
        name: 'Read',
        status: 'running',
        input: { file_path: absoluteSkillPath },
        timestamp: '2026-07-06T02:00:00.000Z',
      },
      {
        type: 'tool_call',
        id: 'tool-read-cwd',
        name: 'Read',
        status: 'completed',
        result: {
          content: `1|---\n2|path ${absoluteSkillPath}`,
          file: { filePath: absoluteSkillPath, numLines: 2 },
        },
        resultPreview: `file=${absoluteSkillPath}`,
        timestamp: '2026-07-06T02:00:01.000Z',
      },
      { type: 'assistant_message', text: `已读取 ${absoluteSkillPath}。` },
      { type: 'assistant_final', text: `最终读取 ${repoRelativeSkillPath} 和 ${absoluteSkillPath}。` },
      { type: 'session_status', status: 'done' },
    ]));

    const response = await POST(postRequest({
      workflowId: 'workflow-1',
      workflow_step_id: 'step-1',
      messages: [{ role: 'user', content: '读取当前 Skill 文件' }],
    }));
    const responseText = await response.text();
    const events = parseSse(responseText);

    expect(response.status).toBe(200);
    expect(responseText).not.toContain(nodeCwd);
    expect(responseText).not.toContain(repoRelativeNodeCwd);
    expect(responseText).toContain(relativeSkillPath);

    const completedToolEvent = events.find((event) => (
      event.event === 'tool_call'
      && (event.tool_call as { status?: string } | undefined)?.status === 'completed'
    )) as { tool_call: {
      input: { file_path: string };
      result: { file: { filePath: string }; content: string };
      resultPreview: string;
    } };
    expect(completedToolEvent.tool_call.input.file_path).toBe(relativeSkillPath);
    expect(completedToolEvent.tool_call.result.file.filePath).toBe(relativeSkillPath);
    expect(completedToolEvent.tool_call.result.content).toContain(`path ${relativeSkillPath}`);
    expect(completedToolEvent.tool_call.resultPreview).toBe(`file=${relativeSkillPath}`);

    const persistedWorkflow = mocks.upsertWorkflow.mock.calls.at(-1)?.[0] as WorkflowRecord;
    expect(JSON.stringify(persistedWorkflow.stepChats['step-1'])).not.toContain(nodeCwd);
    expect(JSON.stringify(persistedWorkflow.stepChats['step-1'])).not.toContain(repoRelativeNodeCwd);
    expect(persistedWorkflow.stepChats['step-1']).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: `最终读取 ${relativeSkillPath} 和 ${relativeSkillPath}。`,
        toolCalls: [
          expect.objectContaining({
            input: { file_path: relativeSkillPath },
            resultPreview: `file=${relativeSkillPath}`,
          }),
        ],
      }),
    ]);
  });

  it('hides app-root absolute paths attempted outside the node cwd', async () => {
    const nodeCwd = `${process.cwd()}/data/workflow-runtime/org-1/workflow-1/nodes/step-1`;
    const relativeSkillPath = '.claude/skills/user-needs-breakdown/SKILL.md';
    const appRootSkillPath = `${process.cwd()}/${relativeSkillPath}`;
    mocks.materializeNodeWorkspace.mockResolvedValue({
      cwd: nodeCwd,
      skillsRoot: `${nodeCwd}/.claude/skills`,
      skillName: 'user-needs-breakdown',
      skillDirectory: `${nodeCwd}/.claude/skills/user-needs-breakdown`,
      skillFilePath: `${nodeCwd}/${relativeSkillPath}`,
      metadataPath: `${nodeCwd}/.battleflow-node-workspace.json`,
    });
    mocks.streamClaudeAgentSdkTurn.mockReturnValue(streamAgentEvents([
      {
        type: 'tool_call',
        id: 'tool-read-app-root',
        name: 'Read',
        status: 'running',
        input: { file_path: appRootSkillPath },
        timestamp: '2026-07-06T02:00:00.000Z',
      },
      {
        type: 'tool_call',
        id: 'tool-read-app-root',
        name: 'Read',
        status: 'failed',
        input: { file_path: appRootSkillPath },
        resultPreview: `File does not exist: ${appRootSkillPath}`,
        error: `File does not exist: ${appRootSkillPath}`,
        timestamp: '2026-07-06T02:00:01.000Z',
      },
      { type: 'assistant_final', text: `读取失败：${appRootSkillPath}` },
      { type: 'session_status', status: 'done' },
    ]));

    const response = await POST(postRequest({
      workflowId: 'workflow-1',
      workflow_step_id: 'step-1',
      messages: [{ role: 'user', content: '读取当前 Skill 文件' }],
    }));
    const responseText = await response.text();
    const events = parseSse(responseText);

    expect(response.status).toBe(200);
    expect(responseText).not.toContain(process.cwd());
    expect(responseText).toContain(relativeSkillPath);

    const failedToolEvent = events.find((event) => (
      event.event === 'tool_call'
      && (event.tool_call as { status?: string } | undefined)?.status === 'failed'
    )) as { tool_call: {
      input: { file_path: string };
      resultPreview: string;
      error: string;
    } };
    expect(failedToolEvent.tool_call.input.file_path).toBe(relativeSkillPath);
    expect(failedToolEvent.tool_call.resultPreview).toBe(`File does not exist: ${relativeSkillPath}`);
    expect(failedToolEvent.tool_call.error).toBe(`File does not exist: ${relativeSkillPath}`);

    const persistedWorkflow = mocks.upsertWorkflow.mock.calls.at(-1)?.[0] as WorkflowRecord;
    expect(JSON.stringify(persistedWorkflow.stepChats['step-1'])).not.toContain(process.cwd());
    expect(persistedWorkflow.stepChats['step-1']).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: `读取失败：${relativeSkillPath}`,
        toolCalls: [
          expect.objectContaining({
            input: { file_path: relativeSkillPath },
            resultPreview: `File does not exist: ${relativeSkillPath}`,
            error: `File does not exist: ${relativeSkillPath}`,
          }),
        ],
      }),
    ]);
  });

  it('passes workflow files as readable references instead of inlining previous-step output', async () => {
    mocks.getWorkflow.mockResolvedValue(workflow({
      steps: [
        {
          id: 'step-1',
          skill_id: 'skill-1',
          step_index: 0,
          runMode: 'serial',
          name: 'Previous step',
          status: 'completed',
          output: 'INLINE_CONTEXT_SHOULD_NOT_APPEAR',
          created_at: '2026-07-04T00:00:00.000Z',
          updated_at: '2026-07-04T00:00:00.000Z',
        },
        {
          id: 'step-2',
          skill_id: 'skill-2',
          step_index: 1,
          runMode: 'serial',
          name: 'Current step',
          status: 'in_progress',
          output: '',
          created_at: '2026-07-04T00:00:00.000Z',
          updated_at: '2026-07-04T00:00:00.000Z',
        },
      ],
      stepChats: {
        'step-1': [{
          role: 'assistant',
          content: '已生成文档附件：Previous step.md',
          kind: 'document',
          created_at: '2026-07-04T00:00:00.000Z',
          attachments: [{
            id: 'attachment-1',
            stepId: 'step-1',
            name: 'Previous step.md',
            type: 'text/markdown',
            size: 128,
            isImage: false,
            contentKind: 'metadata',
            absolutePath: '/tmp/battleflow-attachments/previous-step.md',
            relativePath: 'workspace/workflow/artifacts/previous-step.md',
            contentUrl: '/api/workflows/uploads?workflowId=workflow-1&attachmentId=attachment-1',
            sourceType: 'markdown',
            extension: '.md',
          }],
        }],
      },
    }));
    mocks.streamClaudeAgentSdkTurn.mockReturnValue(streamAgentEvents([
      { type: 'assistant_final', text: 'ok' },
      { type: 'session_status', status: 'done' },
    ]));

    const response = await POST(postRequest({
      workflowId: 'workflow-1',
      workflow_step_id: 'step-2',
      messages: [{ role: 'user', content: '请参考前序产物继续' }],
      step_context: [{
        step_name: 'Previous step',
        step_output: 'INLINE_CONTEXT_SHOULD_NOT_APPEAR',
      }],
    }));
    await response.text();

    expect(response.status).toBe(200);
    const agentInput = mocks.streamClaudeAgentSdkTurn.mock.calls[0][0] as {
      systemPrompt: string;
      readableDirectories: string[];
    };
    expect(agentInput.systemPrompt).toContain('Workflow Attachment Context');
    expect(agentInput.systemPrompt).toContain('absolute_path="/tmp/battleflow-attachments/previous-step.md"');
    expect(agentInput.systemPrompt).toContain('step_id="step-1"');
    expect(agentInput.systemPrompt).not.toContain('INLINE_CONTEXT_SHOULD_NOT_APPEAR');
    expect(agentInput.systemPrompt).not.toContain('Previous Steps Output');
    expect(agentInput.readableDirectories).toContain('/tmp/battleflow-attachments');
  });

  it('passes promoted workflow artifacts as shared read-only context', async () => {
    mocks.getWorkflow.mockResolvedValue(workflow({
      steps: [
        {
          id: 'step-1',
          skill_id: 'skill-1',
          step_index: 0,
          runMode: 'serial',
          name: 'Previous step',
          status: 'completed',
          output: 'PROMOTED_ARTIFACT_BODY_SHOULD_NOT_BE_INLINED',
          created_at: '2026-07-04T00:00:00.000Z',
          updated_at: '2026-07-04T00:00:00.000Z',
        },
        {
          id: 'step-2',
          skill_id: 'skill-2',
          step_index: 1,
          runMode: 'serial',
          name: 'Current step',
          status: 'in_progress',
          output: '',
          created_at: '2026-07-04T00:00:00.000Z',
          updated_at: '2026-07-04T00:00:00.000Z',
        },
      ],
      artifacts: [{
        id: 'artifact-step-1',
        workflowId: 'workflow-1',
        producedByStepId: 'step-1',
        producedByStepName: 'Previous step',
        title: 'Previous Requirements',
        summary: 'Confirmed upstream requirements.',
        fileName: 'step-1-Previous-Requirements.md',
        path: 'artifacts/step-1-Previous-Requirements.md',
        format: 'markdown',
        mimeType: 'text/markdown; charset=utf-8',
        size: 2048,
        checksum: 'sha256-1',
        version: 1,
        created_at: '2026-07-04T00:00:00.000Z',
        updated_at: '2026-07-04T00:00:00.000Z',
      }],
    }));
    mocks.streamClaudeAgentSdkTurn.mockReturnValue(streamAgentEvents([
      { type: 'assistant_final', text: 'ok' },
      { type: 'session_status', status: 'done' },
    ]));

    const response = await POST(postRequest({
      workflowId: 'workflow-1',
      workflow_step_id: 'step-2',
      messages: [{ role: 'user', content: '请参考共享产物继续' }],
    }));
    await response.text();

    expect(response.status).toBe(200);
    expect(mocks.getWorkflowArtifactsDirectory).toHaveBeenCalledWith({
      organizationId: 'org-1',
      workflowId: 'workflow-1',
    });
    const agentInput = mocks.streamClaudeAgentSdkTurn.mock.calls[0][0] as {
      systemPrompt: string;
      readableDirectories: string[];
    };
    expect(agentInput.readableDirectories).toContain('/tmp/battleflow-runtime/org-1/workflow-1/artifacts');
    expect(agentInput.systemPrompt).toContain('Workflow Shared Artifacts');
    expect(agentInput.systemPrompt).toContain('node_relative_path="../../artifacts/step-1-Previous-Requirements.md"');
    expect(agentInput.systemPrompt).toContain('../../artifacts/manifest.json');
    expect(agentInput.systemPrompt).toContain('Previous Requirements');
    expect(agentInput.systemPrompt).not.toContain('PROMOTED_ARTIFACT_BODY_SHOULD_NOT_BE_INLINED');
    expect(agentInput.systemPrompt).not.toContain('/tmp/battleflow-runtime/org-1/workflow-1/artifacts/step-1-Previous-Requirements.md');
  });

  it('passes only the current step artifact as the node workspace seed', async () => {
    const currentArtifact = {
      id: 'artifact-step-1',
      workflowId: 'workflow-1',
      producedByStepId: 'step-1',
      producedByStepName: 'Current step',
      title: 'Current Draft',
      summary: 'Current step draft.',
      fileName: 'step-1-Current-Draft.md',
      path: 'artifacts/step-1-Current-Draft.md',
      format: 'markdown' as const,
      mimeType: 'text/markdown; charset=utf-8',
      size: 1024,
      checksum: 'sha256-current',
      version: 2,
      created_at: '2026-07-04T00:00:00.000Z',
      updated_at: '2026-07-05T00:00:00.000Z',
    };
    const otherArtifact = {
      ...currentArtifact,
      id: 'artifact-step-2',
      producedByStepId: 'step-2',
      producedByStepName: 'Other step',
      title: 'Other Draft',
      fileName: 'step-2-Other-Draft.md',
      path: 'artifacts/step-2-Other-Draft.md',
      checksum: 'sha256-other',
    };
    mocks.getWorkflow.mockResolvedValue(workflow({
      artifacts: [otherArtifact, currentArtifact],
    }));
    mocks.streamClaudeAgentSdkTurn.mockReturnValue(streamAgentEvents([
      { type: 'assistant_final', text: 'ok' },
      { type: 'session_status', status: 'done' },
    ]));

    const response = await POST(postRequest({
      workflowId: 'workflow-1',
      workflow_step_id: 'step-1',
      messages: [{ role: 'user', content: '继续编辑当前节点产物' }],
    }));
    await response.text();

    expect(response.status).toBe(200);
    expect(mocks.materializeNodeWorkspace).toHaveBeenCalledWith({
      organizationId: 'org-1',
      workflowId: 'workflow-1',
      stepId: 'step-1',
      skill: expect.objectContaining({ id: 'skill-1' }),
      artifactSeed: currentArtifact,
    });
  });

  it('only passes enabled prior-step attachments from supplemental context as file references', async () => {
    mocks.getWorkflow.mockResolvedValue(workflow({
      steps: [
        {
          id: 'step-1',
          skill_id: 'skill-1',
          step_index: 0,
          runMode: 'serial',
          name: 'Enabled previous step',
          status: 'completed',
          output: 'ENABLED_PREVIOUS_OUTPUT_SHOULD_NOT_BE_INLINED',
          created_at: '2026-07-04T00:00:00.000Z',
          updated_at: '2026-07-04T00:00:00.000Z',
        },
        {
          id: 'step-2',
          skill_id: 'skill-2',
          step_index: 1,
          runMode: 'serial',
          name: 'Disabled previous step',
          status: 'completed',
          output: 'DISABLED_PREVIOUS_OUTPUT_SHOULD_NOT_APPEAR',
          created_at: '2026-07-04T00:00:00.000Z',
          updated_at: '2026-07-04T00:00:00.000Z',
        },
        {
          id: 'step-3',
          skill_id: 'skill-3',
          step_index: 2,
          runMode: 'serial',
          name: 'Current step',
          status: 'in_progress',
          output: '',
          created_at: '2026-07-04T00:00:00.000Z',
          updated_at: '2026-07-04T00:00:00.000Z',
        },
        {
          id: 'step-4',
          skill_id: 'skill-4',
          step_index: 3,
          runMode: 'serial',
          name: 'Future step',
          status: 'completed',
          output: 'FUTURE_OUTPUT_SHOULD_NOT_APPEAR',
          created_at: '2026-07-04T00:00:00.000Z',
          updated_at: '2026-07-04T00:00:00.000Z',
        },
      ],
      stepChats: {
        'step-1': [{
          role: 'assistant',
          content: '已生成文档附件：Enabled previous step.md',
          kind: 'document',
          created_at: '2026-07-04T00:00:00.000Z',
          attachments: [{
            id: 'attachment-enabled',
            stepId: 'step-1',
            name: 'Enabled previous step.md',
            type: 'text/markdown',
            size: 128,
            isImage: false,
            contentKind: 'metadata',
            absolutePath: '/tmp/battleflow-attachments/enabled-step.md',
            relativePath: 'workspace/workflow/artifacts/enabled-step.md',
            contentUrl: '/api/workflows/uploads?workflowId=workflow-1&attachmentId=attachment-enabled',
            sourceType: 'markdown',
            extension: '.md',
          }],
        }],
        'step-2': [{
          role: 'assistant',
          content: '已生成文档附件：Disabled previous step.md',
          kind: 'document',
          created_at: '2026-07-04T00:00:00.000Z',
          attachments: [{
            id: 'attachment-disabled',
            stepId: 'step-2',
            name: 'Disabled previous step.md',
            type: 'text/markdown',
            size: 128,
            isImage: false,
            contentKind: 'metadata',
            absolutePath: '/tmp/battleflow-attachments/disabled-step.md',
            relativePath: 'workspace/workflow/artifacts/disabled-step.md',
            contentUrl: '/api/workflows/uploads?workflowId=workflow-1&attachmentId=attachment-disabled',
            sourceType: 'markdown',
            extension: '.md',
          }],
        }],
        'step-4': [{
          role: 'assistant',
          content: '已生成文档附件：Future step.md',
          kind: 'document',
          created_at: '2026-07-04T00:00:00.000Z',
          attachments: [{
            id: 'attachment-future',
            stepId: 'step-4',
            name: 'Future step.md',
            type: 'text/markdown',
            size: 128,
            isImage: false,
            contentKind: 'metadata',
            absolutePath: '/tmp/battleflow-attachments/future-step.md',
            relativePath: 'workspace/workflow/artifacts/future-step.md',
            contentUrl: '/api/workflows/uploads?workflowId=workflow-1&attachmentId=attachment-future',
            sourceType: 'markdown',
            extension: '.md',
          }],
        }],
      },
    }));
    mocks.streamClaudeAgentSdkTurn.mockReturnValue(streamAgentEvents([
      { type: 'assistant_final', text: 'ok' },
      { type: 'session_status', status: 'done' },
    ]));

    const response = await POST(postRequest({
      workflowId: 'workflow-1',
      workflow_step_id: 'step-3',
      messages: [{ role: 'user', content: '请按勾选的前序产物继续' }],
      disabled_auto_injected_step_ids: ['step-2'],
    }));
    await response.text();

    expect(response.status).toBe(200);
    const agentInput = mocks.streamClaudeAgentSdkTurn.mock.calls[0][0] as {
      systemPrompt: string;
      readableDirectories: string[];
    };
    expect(agentInput.systemPrompt).toContain('absolute_path="/tmp/battleflow-attachments/enabled-step.md"');
    expect(agentInput.systemPrompt).not.toContain('/tmp/battleflow-attachments/disabled-step.md');
    expect(agentInput.systemPrompt).not.toContain('/tmp/battleflow-attachments/future-step.md');
    expect(agentInput.systemPrompt).not.toContain('ENABLED_PREVIOUS_OUTPUT_SHOULD_NOT_BE_INLINED');
    expect(agentInput.systemPrompt).not.toContain('DISABLED_PREVIOUS_OUTPUT_SHOULD_NOT_APPEAR');
    expect(agentInput.systemPrompt).not.toContain('FUTURE_OUTPUT_SHOULD_NOT_APPEAR');
    expect(agentInput.readableDirectories).toContain('/tmp/battleflow-attachments');
  });

  it('materializes the server-side Skill and passes node cwd with a single Skill filter', async () => {
    const serverSkill = skillRecord({
      package_assets: [{
        path: 'assets/templates/template.md',
        kind: 'template',
        source_folder: 'assets',
        mime_type: 'text/markdown',
        size: 128,
        content_kind: 'text',
        content: 'TEMPLATE_CONTENT_SHOULD_NOT_BE_IN_PROMPT',
        package_path: '/tmp/battleflow-skill-package',
        absolute_path: '/tmp/battleflow-skill-package/assets/templates/template.md',
      }],
    });
    mocks.getSkill.mockResolvedValue(serverSkill);
    mocks.streamClaudeAgentSdkTurn.mockReturnValue(streamAgentEvents([
      { type: 'assistant_final', text: 'ok' },
      { type: 'session_status', status: 'done' },
    ]));

    const response = await POST(postRequest({
      workflowId: 'workflow-1',
      workflow_step_id: 'step-1',
      messages: [{ role: 'user', content: '你这次生成参考的模板是哪个？' }],
      skill_definition: {
        id: 'skill-1',
        name: 'TR1 用户需求说明书生成器',
        skill_md: 'Follow the template files.',
        package_assets: [{
          path: 'assets/templates/template.md',
          kind: 'template',
          content_kind: 'text',
          content: 'CLIENT_SUPPLIED_CONTENT_SHOULD_NOT_BE_TRUSTED',
          package_path: '/tmp/malicious',
          absolute_path: '/tmp/malicious/template.md',
        }],
      },
    }));
    await response.text();

    expect(response.status).toBe(200);
    expect(mocks.requireSkillIdAccess).toHaveBeenCalledWith(authContext, 'skill-1', 'skill.run');
    expect(mocks.getSkill).toHaveBeenCalledWith('skill-1');
    expect(mocks.materializeNodeWorkspace).toHaveBeenCalledWith({
      organizationId: 'org-1',
      workflowId: 'workflow-1',
      stepId: 'step-1',
      skill: serverSkill,
    });
    const agentInput = mocks.streamClaudeAgentSdkTurn.mock.calls[0][0] as {
      systemPrompt: string;
      readableDirectories: string[];
      cwd: string;
      skills: string[];
      writableRoot: string;
    };
    expect(agentInput.cwd).toBe('/tmp/battleflow-runtime/org-1/workflow-1/nodes/step-1');
    expect(agentInput.writableRoot).toBe('/tmp/battleflow-runtime/org-1/workflow-1/nodes/step-1');
    expect(agentInput.skills).toEqual(['user-needs-breakdown']);
    expect(agentInput.systemPrompt).toContain('Active BattleFlow Skill: 用户需求拆解');
    expect(agentInput.systemPrompt).toContain('enabled through Claude Agent SDK project Skill discovery');
    expect(agentInput.systemPrompt).not.toContain('Skill Package Asset References');
    expect(agentInput.systemPrompt).not.toContain('path="assets/templates/template.md"');
    expect(agentInput.systemPrompt).not.toContain('package_path="/tmp/battleflow-skill-package"');
    expect(agentInput.systemPrompt).not.toContain('absolute_path="/tmp/battleflow-skill-package/assets/templates/template.md"');
    expect(agentInput.systemPrompt).not.toContain('TEMPLATE_CONTENT_SHOULD_NOT_BE_IN_PROMPT');
    expect(agentInput.systemPrompt).not.toContain('CLIENT_SUPPLIED_CONTENT_SHOULD_NOT_BE_TRUSTED');
    expect(agentInput.systemPrompt).not.toContain('SERVER_SKILL_MD_SHOULD_NOT_BE_IN_PROMPT');
    expect(agentInput.systemPrompt).not.toContain('SERVER_PROMPT_TEMPLATE_SHOULD_NOT_BE_IN_PROMPT');
    expect(agentInput.systemPrompt).not.toContain('SERVER_CHECKLIST_SHOULD_NOT_BE_IN_PROMPT');
    expect(agentInput.readableDirectories).not.toContain('/tmp/battleflow-skill-package');
    expect(agentInput.readableDirectories).not.toContain('/tmp/battleflow-skill-package/assets/templates');
    expect(agentInput.readableDirectories).not.toContain('/tmp/malicious');
  });

  it('uses the workflow step Skill instead of a client-supplied Skill id', async () => {
    mocks.streamClaudeAgentSdkTurn.mockReturnValue(streamAgentEvents([
      { type: 'assistant_final', text: 'ok' },
      { type: 'session_status', status: 'done' },
    ]));

    const response = await POST(postRequest({
      workflowId: 'workflow-1',
      workflow_step_id: 'step-1',
      messages: [{ role: 'user', content: '小需求评审版，读这个模板来生成。' }],
      skill_definition: {
        id: 'malicious-skill',
        name: 'CLIENT_SKILL_NAME_SHOULD_NOT_BE_USED',
        skill_md: 'CLIENT_SKILL_MD_SHOULD_NOT_BE_IN_PROMPT',
        package_path: '/tmp/malicious',
      },
    }));
    await response.text();

    expect(response.status).toBe(200);
    expect(mocks.requireSkillIdAccess).toHaveBeenCalledWith(authContext, 'skill-1', 'skill.run');
    expect(mocks.getSkill).toHaveBeenCalledWith('skill-1');
    const agentInput = mocks.streamClaudeAgentSdkTurn.mock.calls[0][0] as {
      systemPrompt: string;
      readableDirectories: string[];
      skills: string[];
    };
    expect(agentInput.skills).toEqual(['user-needs-breakdown']);
    expect(agentInput.systemPrompt).toContain('Active BattleFlow Skill: 用户需求拆解');
    expect(agentInput.systemPrompt).not.toContain('CLIENT_SKILL_NAME_SHOULD_NOT_BE_USED');
    expect(agentInput.systemPrompt).not.toContain('CLIENT_SKILL_MD_SHOULD_NOT_BE_IN_PROMPT');
    expect(agentInput.systemPrompt).not.toContain('/tmp/malicious');
    expect(agentInput.readableDirectories).not.toContain('/tmp/malicious');
  });

  it('drops stale assistant messages that confuse loaded Skills with Skill tool calls', async () => {
    mocks.streamClaudeAgentSdkTurn.mockReturnValue(streamAgentEvents([
      { type: 'assistant_final', text: 'ok' },
      { type: 'session_status', status: 'done' },
    ]));

    const response = await POST(postRequest({
      workflowId: 'workflow-1',
      workflow_step_id: 'step-1',
      messages: [
        {
          role: 'assistant',
          content: '当前对话中没有加载任何 skill，全程是直接对话完成的，没有调用过 Skill 工具。',
        },
        { role: 'user', content: '当前节点加载的skill是什么？' },
      ],
    }));
    await response.text();

    expect(response.status).toBe(200);
    const agentInput = mocks.streamClaudeAgentSdkTurn.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
      systemPrompt: string;
    };
    expect(agentInput.messages).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        content: expect.stringContaining('没有加载任何 skill'),
      }),
    ]));
    expect(agentInput.systemPrompt).toContain('A loaded BattleFlow Skill is the workflow-step binding above');
    expect(agentInput.systemPrompt).toContain('If an earlier assistant message claimed no Skill was loaded');
  });
});
