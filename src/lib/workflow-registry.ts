import { promises as fs } from 'fs';
import path from 'path';
import { cleanExecutableSkillText } from './workflow-skill-draft';

export type WorkflowStatus = 'draft' | 'in_progress' | 'completed';
export type WorkflowStepStatus = 'pending' | 'in_progress' | 'completed';
export type WorkflowRunMode = 'serial' | 'parallel';

export interface WorkspaceRecord {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface WorkflowStepRecord {
  id: string;
  name: string;
  skill_id: string;
  step_index: number;
  runMode: WorkflowRunMode;
  parallelGroupId?: string;
  parallelGroupName?: string;
  isRemoved?: boolean;
  removedAt?: string;
  status: WorkflowStepStatus;
  output: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export type WorkflowFileContentKind = 'text' | 'image_data_url' | 'metadata';

export interface WorkflowContextFileRecord {
  id: string;
  stepId: string;
  name: string;
  type: string;
  size: number;
  isImage: boolean;
  contentKind: WorkflowFileContentKind;
  content?: string;
  note?: string;
  created_at: string;
}

export interface WorkflowReviewedOutputFileRecord {
  id: string;
  stepId: string;
  name: string;
  type: string;
  size: number;
  contentKind: WorkflowFileContentKind;
  content?: string;
  note?: string;
  created_at: string;
}

export interface WorkflowContextSelectionRecord {
  knowledgeBaseIds: string[];
  reviewMaterialIds: string[];
  disabledAutoInjectedStepIds?: string[];
  updated_at?: string;
}

export interface WorkflowStepSnapshotRecord {
  id: string;
  workflowId: string;
  stepId: string;
  stepName: string;
  stepIndex: number;
  output: string;
  contextFiles: string[];
  reviewedMaterials: string[];
  reviewComment?: string;
  created_at: string;
}

export interface WorkflowChatMessageRecord {
  role: 'user' | 'assistant';
  content: string;
}

const CLAUDE_RUNTIME_SKILL_MISFIRE_MARKERS = [
  '/<skill-name>',
  'system-reminder',
  'available-skills',
  '可用 Skill 列表',
  '可用的 Skill',
  '已注册的可用 Skill',
  '没有看到任何已注册',
  '无法猜测或自行发明技能名称',
];

function isClaudeRuntimeSkillMisfireMessage(message: Partial<WorkflowChatMessageRecord>) {
  if (message.role !== 'assistant') return false;
  const content = message.content || '';
  return CLAUDE_RUNTIME_SKILL_MISFIRE_MARKERS.some((marker) => content.includes(marker));
}

export interface WorkflowSkillDraftRecord {
  id: string;
  stepId: string;
  baseSkillId: string;
  baseSkillVersion?: string;
  name: string;
  description: string;
  methodology: string;
  tools: string[];
  outputs: Record<string, unknown>;
  checklist: string[];
  tags: string[];
  prompt_template?: string;
  skill_md: string;
  tuning_request?: string;
  change_summary: string;
  change_items?: string[];
  validation_note?: string;
  quality_gates?: string[];
  source_context_summary?: string;
  generator?: 'claude-code-cli';
  enabled: boolean;
  status: 'draft' | 'submitted';
  submittedSkillId?: string;
  created_at: string;
  updated_at: string;
}

export interface WorkflowRecord {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  status: WorkflowStatus;
  steps: WorkflowStepRecord[];
  contextFiles: WorkflowContextFileRecord[];
  reviewedOutputFiles: WorkflowReviewedOutputFileRecord[];
  reviewComments: Record<string, string>;
  archivedReviewStepIds: string[];
  contextSelections: Record<string, WorkflowContextSelectionRecord>;
  stepSnapshots: WorkflowStepSnapshotRecord[];
  stepChats: Record<string, WorkflowChatMessageRecord[]>;
  skillDrafts: Record<string, WorkflowSkillDraftRecord>;
  created_at: string;
  updated_at: string;
}

interface WorkflowStore {
  workspaces: WorkspaceRecord[];
  workflows: WorkflowRecord[];
}

interface CreateWorkflowStepInput {
  name: string;
  skill_id: string;
  step_index?: number;
  runMode?: WorkflowRunMode;
  parallelGroupId?: string;
  parallelGroupName?: string;
}

interface CreateWorkflowInput {
  workspaceId: string;
  name: string;
  description?: string;
  steps: CreateWorkflowStepInput[];
}

const cwd = process.cwd();
const registryRoot = process.env.WORKFLOW_REGISTRY_DIR || path.join(cwd, 'data', 'workflows');
const storePath = path.join(registryRoot, 'store.json');

function nowIso() {
  return new Date().toISOString();
}

function slugify(value: string, fallback: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || fallback;
}

function uniqueId(prefix: string, label = '') {
  const slug = slugify(label, prefix);
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
  return `${prefix}-${slug}-${suffix}`;
}

async function ensureStoreDir() {
  await fs.mkdir(registryRoot, { recursive: true });
}

async function readStore(): Promise<WorkflowStore> {
  await ensureStoreDir();
  try {
    const raw = await fs.readFile(storePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<WorkflowStore>;
    return {
      workspaces: Array.isArray(parsed.workspaces) ? parsed.workspaces : [],
      workflows: Array.isArray(parsed.workflows) ? parsed.workflows : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { workspaces: [], workflows: [] };
    }
    throw error;
  }
}

async function writeStore(store: WorkflowStore) {
  await ensureStoreDir();
  const tempPath = `${storePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(store, null, 2), 'utf8');
  await fs.rename(tempPath, storePath);
}

function normalizeStep(step: Partial<WorkflowStepRecord>, index: number): WorkflowStepRecord {
  const now = nowIso();
  return {
    id: step.id || uniqueId('step', step.name || `step-${index + 1}`),
    name: step.name || `步骤 ${index + 1}`,
    skill_id: step.skill_id || '',
    step_index: typeof step.step_index === 'number' ? step.step_index : index,
    runMode: step.runMode === 'parallel' ? 'parallel' : 'serial',
    parallelGroupId: step.parallelGroupId,
    parallelGroupName: step.parallelGroupName,
    isRemoved: Boolean(step.isRemoved),
    removedAt: step.removedAt,
    status: step.status === 'completed' || step.status === 'in_progress' ? step.status : 'pending',
    output: typeof step.output === 'string' ? step.output : null,
    created_at: step.created_at || now,
    updated_at: step.updated_at || now,
    completed_at: step.completed_at,
  };
}

function normalizeFileContentKind(value: unknown): WorkflowFileContentKind {
  return value === 'text' || value === 'image_data_url' ? value : 'metadata';
}

function normalizeContextFile(file: Partial<WorkflowContextFileRecord>, index: number): WorkflowContextFileRecord {
  const now = nowIso();
  return {
    id: file.id || uniqueId('context-file', file.name || `context-${index + 1}`),
    stepId: file.stepId || '',
    name: file.name || `上下文文件 ${index + 1}`,
    type: file.type || 'unknown',
    size: typeof file.size === 'number' ? file.size : 0,
    isImage: Boolean(file.isImage),
    contentKind: normalizeFileContentKind(file.contentKind),
    content: typeof file.content === 'string' ? file.content : undefined,
    note: typeof file.note === 'string' ? file.note : undefined,
    created_at: file.created_at || now,
  };
}

function normalizeReviewedOutputFile(
  file: Partial<WorkflowReviewedOutputFileRecord>,
  index: number,
): WorkflowReviewedOutputFileRecord {
  const now = nowIso();
  return {
    id: file.id || uniqueId('reviewed-output', file.name || `reviewed-${index + 1}`),
    stepId: file.stepId || '',
    name: file.name || `已审核产物 ${index + 1}`,
    type: file.type || 'unknown',
    size: typeof file.size === 'number' ? file.size : 0,
    contentKind: normalizeFileContentKind(file.contentKind),
    content: typeof file.content === 'string' ? file.content : undefined,
    note: typeof file.note === 'string' ? file.note : undefined,
    created_at: file.created_at || now,
  };
}

function normalizeReviewComments(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, comment]) => typeof comment === 'string')
      .map(([stepId, comment]) => [stepId, comment as string]),
  );
}

function normalizeContextSelections(value: unknown): Record<string, WorkflowContextSelectionRecord> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, Partial<WorkflowContextSelectionRecord>>).map(([stepId, selection]) => [
      stepId,
      {
        knowledgeBaseIds: Array.isArray(selection?.knowledgeBaseIds)
          ? selection.knowledgeBaseIds.filter((id): id is string => typeof id === 'string')
          : [],
        reviewMaterialIds: Array.isArray(selection?.reviewMaterialIds)
          ? selection.reviewMaterialIds.filter((id): id is string => typeof id === 'string')
          : [],
        disabledAutoInjectedStepIds: Array.isArray(selection?.disabledAutoInjectedStepIds)
          ? selection.disabledAutoInjectedStepIds.filter((id): id is string => typeof id === 'string')
          : [],
        updated_at: typeof selection?.updated_at === 'string' ? selection.updated_at : undefined,
      },
    ]),
  );
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeStepSnapshot(
  snapshot: Partial<WorkflowStepSnapshotRecord>,
  index: number,
  workflowId: string,
): WorkflowStepSnapshotRecord {
  const now = nowIso();
  return {
    id: snapshot.id || uniqueId('snapshot', snapshot.stepName || `snapshot-${index + 1}`),
    workflowId: snapshot.workflowId || workflowId,
    stepId: snapshot.stepId || '',
    stepName: snapshot.stepName || `步骤 ${index + 1}`,
    stepIndex: typeof snapshot.stepIndex === 'number' ? snapshot.stepIndex : index,
    output: typeof snapshot.output === 'string' ? snapshot.output : '',
    contextFiles: normalizeStringArray(snapshot.contextFiles),
    reviewedMaterials: normalizeStringArray(snapshot.reviewedMaterials),
    reviewComment: typeof snapshot.reviewComment === 'string' ? snapshot.reviewComment : undefined,
    created_at: snapshot.created_at || now,
  };
}

function normalizeStepChats(value: unknown): Record<string, WorkflowChatMessageRecord[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([stepId, messages]) => [
      stepId,
      Array.isArray(messages)
        ? messages
          .filter((message): message is Partial<WorkflowChatMessageRecord> => (
            Boolean(message)
            && typeof message === 'object'
            && !Array.isArray(message)
            && (message as Partial<WorkflowChatMessageRecord>).role !== undefined
            && typeof (message as Partial<WorkflowChatMessageRecord>).content === 'string'
          ))
          .filter((message) => !isClaudeRuntimeSkillMisfireMessage(message))
          .map((message) => ({
            role: message.role === 'assistant' ? 'assistant' : 'user',
            content: message.content || '',
          }))
        : [],
    ]).filter(([, messages]) => messages.length > 0),
  );
}

function normalizeUnknownRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeSkillDrafts(value: unknown): Record<string, WorkflowSkillDraftRecord> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const now = nowIso();

  return Object.fromEntries(
    Object.entries(value as Record<string, Partial<WorkflowSkillDraftRecord>>)
      .filter(([, draft]) => Boolean(draft) && typeof draft === 'object' && !Array.isArray(draft))
      .map(([stepId, draft]) => [
        stepId,
        {
          id: draft.id || uniqueId('skill-draft', draft.name || stepId),
          stepId: draft.stepId || stepId,
          baseSkillId: draft.baseSkillId || '',
          baseSkillVersion: typeof draft.baseSkillVersion === 'string' ? draft.baseSkillVersion : undefined,
          name: draft.name || '未命名 Skill 草稿',
          description: draft.description || '',
          methodology: cleanExecutableSkillText(draft.methodology, '', draft.tuning_request),
          tools: normalizeStringArray(draft.tools),
          outputs: normalizeUnknownRecord(draft.outputs),
          checklist: normalizeStringArray(draft.checklist),
          tags: normalizeStringArray(draft.tags),
          prompt_template: typeof draft.prompt_template === 'string'
            ? cleanExecutableSkillText(draft.prompt_template, '', draft.tuning_request)
            : undefined,
          skill_md: cleanExecutableSkillText(draft.skill_md, '', draft.tuning_request),
          tuning_request: typeof draft.tuning_request === 'string' ? draft.tuning_request : undefined,
          change_summary: draft.change_summary || '工作流内调优草稿。',
          change_items: normalizeStringArray(draft.change_items),
          validation_note: typeof draft.validation_note === 'string' ? draft.validation_note : undefined,
          quality_gates: normalizeStringArray(draft.quality_gates),
          source_context_summary: typeof draft.source_context_summary === 'string' ? draft.source_context_summary : undefined,
          generator: draft.generator === 'claude-code-cli' ? 'claude-code-cli' : undefined,
          enabled: Boolean(draft.enabled),
          status: draft.status === 'submitted' ? 'submitted' : 'draft',
          submittedSkillId: typeof draft.submittedSkillId === 'string' ? draft.submittedSkillId : undefined,
          created_at: draft.created_at || now,
          updated_at: draft.updated_at || now,
        },
      ]),
  );
}

function deriveWorkflowStatus(workflow: WorkflowRecord): WorkflowStatus {
  const activeSteps = workflow.steps.filter((step) => !step.isRemoved);
  if (activeSteps.length === 0) return 'draft';
  if (activeSteps.every((step) => step.status === 'completed')) return 'completed';
  if (activeSteps.some((step) => step.status === 'completed' || step.status === 'in_progress')) {
    return 'in_progress';
  }
  return workflow.status === 'draft' ? 'draft' : 'in_progress';
}

function sortWorkflowSteps(steps: WorkflowStepRecord[]): WorkflowStepRecord[] {
  return steps
    .map((step, originalIndex) => ({ step, originalIndex }))
    .sort((a, b) => {
      if (a.step.step_index !== b.step.step_index) {
        return a.step.step_index - b.step.step_index;
      }
      return a.originalIndex - b.originalIndex;
    })
    .map(({ step }) => step);
}

function normalizeWorkflow(workflow: Partial<WorkflowRecord>): WorkflowRecord {
  const now = nowIso();
  const steps = Array.isArray(workflow.steps)
    ? workflow.steps.map((step, index) => normalizeStep(step, index))
    : [];
  const normalized: WorkflowRecord = {
    id: workflow.id || uniqueId('workflow', workflow.name || 'workflow'),
    workspaceId: workflow.workspaceId || '',
    name: workflow.name || '未命名工作流',
    description: workflow.description || '',
    status: workflow.status === 'completed' || workflow.status === 'draft' ? workflow.status : 'in_progress',
    steps: sortWorkflowSteps(steps),
    contextFiles: Array.isArray(workflow.contextFiles)
      ? workflow.contextFiles.map((file, index) => normalizeContextFile(file, index))
      : [],
    reviewedOutputFiles: Array.isArray(workflow.reviewedOutputFiles)
      ? workflow.reviewedOutputFiles.map((file, index) => normalizeReviewedOutputFile(file, index))
      : [],
    reviewComments: normalizeReviewComments(workflow.reviewComments),
    archivedReviewStepIds: Array.isArray(workflow.archivedReviewStepIds)
      ? workflow.archivedReviewStepIds.filter((stepId): stepId is string => typeof stepId === 'string')
      : [],
    contextSelections: normalizeContextSelections(workflow.contextSelections),
    stepSnapshots: Array.isArray(workflow.stepSnapshots)
      ? workflow.stepSnapshots.map((snapshot, index) => normalizeStepSnapshot(snapshot, index, workflow.id || ''))
      : [],
    stepChats: normalizeStepChats(workflow.stepChats),
    skillDrafts: normalizeSkillDrafts(workflow.skillDrafts),
    created_at: workflow.created_at || now,
    updated_at: now,
  };
  return {
    ...normalized,
    status: deriveWorkflowStatus(normalized),
  };
}

function buildSteps(inputs: CreateWorkflowStepInput[]): WorkflowStepRecord[] {
  const now = nowIso();
  const inputStepIndexes = inputs.map((input, index) => (
    typeof input.step_index === 'number' ? input.step_index : index
  ));
  const firstStepIndex = Math.min(...inputStepIndexes);

  return inputs.map((input, index) => ({
    id: uniqueId('step', input.name || `step-${index + 1}`),
    name: input.name || `步骤 ${index + 1}`,
    skill_id: input.skill_id,
    step_index: inputStepIndexes[index],
    runMode: input.runMode === 'parallel' ? 'parallel' : 'serial',
    parallelGroupId: input.parallelGroupId,
    parallelGroupName: input.parallelGroupName,
    status: inputStepIndexes[index] === firstStepIndex ? 'in_progress' : 'pending',
    output: null,
    created_at: now,
    updated_at: now,
  }));
}

export async function getWorkflowState() {
  const store = await readStore();
  return {
    workspaces: store.workspaces,
    workflows: store.workflows.map(normalizeWorkflow),
  };
}

export async function getWorkflow(id: string) {
  const store = await readStore();
  const workflow = store.workflows.find((item) => item.id === id);
  return workflow ? normalizeWorkflow(workflow) : null;
}

export async function createWorkspace(input: { name: string; description?: string }) {
  const name = input.name.trim();
  if (!name) throw new Error('Workspace name is required');

  const store = await readStore();
  const now = nowIso();
  const workspace: WorkspaceRecord = {
    id: uniqueId('workspace', name),
    name,
    description: input.description?.trim() || '未填写目录说明',
    created_at: now,
    updated_at: now,
  };

  await writeStore({
    ...store,
    workspaces: [workspace, ...store.workspaces],
  });
  return workspace;
}

export async function deleteWorkspace(id: string) {
  const store = await readStore();
  const nextWorkspaces = store.workspaces.filter((workspace) => workspace.id !== id);
  if (nextWorkspaces.length === store.workspaces.length) throw new Error(`Workspace not found: ${id}`);
  const nextWorkflows = store.workflows.filter((workflow) => workflow.workspaceId !== id);
  const deletedWorkflowCount = store.workflows.length - nextWorkflows.length;
  await writeStore({ ...store, workspaces: nextWorkspaces, workflows: nextWorkflows });
  return { success: true, deletedWorkflowCount };
}

export async function createWorkflow(input: CreateWorkflowInput) {
  const name = input.name.trim();
  if (!name) throw new Error('Workflow name is required');
  if (!input.workspaceId) throw new Error('workspaceId is required');
  if (!Array.isArray(input.steps) || input.steps.length < 3) {
    throw new Error('At least three workflow steps are required');
  }

  const store = await readStore();
  if (!store.workspaces.some((workspace) => workspace.id === input.workspaceId)) {
    throw new Error(`Workspace not found: ${input.workspaceId}`);
  }

  const now = nowIso();
  const workflow = normalizeWorkflow({
    id: uniqueId('workflow', name),
    workspaceId: input.workspaceId,
    name,
    description: input.description?.trim() || '',
    status: 'in_progress',
    steps: buildSteps(input.steps),
    created_at: now,
    updated_at: now,
  });

  await writeStore({
    ...store,
    workflows: [workflow, ...store.workflows],
  });
  return workflow;
}

export async function upsertWorkflow(workflow: Partial<WorkflowRecord>) {
  const store = await readStore();
  const normalized = normalizeWorkflow(workflow);
  if (!normalized.workspaceId) throw new Error('workspaceId is required');

  const exists = store.workflows.some((item) => item.id === normalized.id);
  const workflows = exists
    ? store.workflows.map((item) => (item.id === normalized.id ? normalized : item))
    : [normalized, ...store.workflows];

  await writeStore({ ...store, workflows });
  return normalized;
}

export async function deleteWorkflow(id: string) {
  const store = await readStore();
  const workflows = store.workflows.filter((workflow) => workflow.id !== id);
  if (workflows.length === store.workflows.length) throw new Error(`Workflow not found: ${id}`);
  await writeStore({ ...store, workflows });
  return { success: true };
}
