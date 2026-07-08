import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentEvent } from '@/lib/agent-adapters/types';
import type { SkillRecord } from '@/lib/skill-registry';
import type { WorkflowRecord } from '@/lib/workflow-registry';

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
  getSkill: vi.fn(),
  findWorkflowAttachment: vi.fn(),
  materializeNodeWorkspace: vi.fn(),
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

vi.mock('@/lib/workflow-registry', () => ({
  getWorkflow: mocks.getWorkflow,
  upsertWorkflow: mocks.upsertWorkflow,
}));

vi.mock('@/lib/workflow-skill-draft', () => ({
  cleanExecutableSkillText: (value: string) => value,
}));

import { POST } from './route';

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
    .map((chunk) => JSON.parse(chunk.replace(/^data:\s*/, '')) as Record<string, unknown>);
}

beforeEach(() => {
  vi.clearAllMocks();

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
    expect(events).toContainEqual(expect.objectContaining({ content: '这是一段' }));
    expect(events).toContainEqual(expect.objectContaining({ content: '产品规划。' }));
    expect(events).toContainEqual(expect.objectContaining({
      event: 'assistant_final',
      content: '最终输出：关键风险。',
      replace: true,
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
    };
    expect(agentInput.cwd).toBe('/tmp/battleflow-runtime/org-1/workflow-1/nodes/step-1');
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
});
