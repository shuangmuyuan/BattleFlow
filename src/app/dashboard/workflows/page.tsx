'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ClipboardEvent, DragEvent, KeyboardEvent, MouseEvent, PointerEvent } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  PageHeader,
  ProductEmptyState,
  StatusBadge,
  appCardClassName,
} from '@/components/battleflow/ui';
import {
  CompactMarkdown,
  compactMarkdownPreview,
} from '@/components/battleflow/compact-markdown';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus,
  Play,
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  ArrowRight,
  MessageSquare,
  Save,
  Sparkles,
  Loader2,
  BookOpen,
  Database,
  ClipboardCheck,
  Paperclip,
  Image as ImageIcon,
  X,
  Download,
  Pencil,
  Trash2,
  RotateCcw,
  Copy,
  ChevronDown,
  FileText,
  ShieldCheck,
  CircleStop,
  GripVertical,
  ExternalLink,
} from 'lucide-react';

interface Skill {
  id: string;
  name: string;
  description: string;
  methodology: string;
  tools: string[];
  outputs: Record<string, unknown>;
  checklist: string[];
  acceptanceCriteria?: string[];
  requiredSections?: string[];
  evidenceRules?: string[];
  failureConditions?: string[];
  tags: string[];
  version?: string;
  prompt_template?: string;
  skill_md?: string;
  tuning_request?: string;
  scope?: 'personal' | 'team' | 'official';
  status?: 'imported' | 'pending_review' | 'published' | 'rejected' | 'archived';
  updated_at?: string;
  package_assets?: SkillPackageAsset[];
  review?: {
    source_skill_id?: string;
    source_version?: string;
    decision?: 'approved' | 'rejected';
  };
}

interface SkillPackageAsset {
  path: string;
  kind: string;
  source_folder: string;
  mime_type: string;
  size: number;
  content_kind: 'text' | 'metadata';
  content?: string;
  truncated?: boolean;
  note?: string;
}

const skillStatusPriority: Record<string, number> = {
  published: 4,
  imported: 3,
};

const skillScopePriority: Record<string, number> = {
  official: 3,
  team: 2,
  personal: 1,
};

function getWorkflowSkillFamilyId(skill: Skill) {
  return skill.review?.source_skill_id || skill.id;
}

function getWorkflowSkillScore(skill: Skill) {
  const updatedAt = skill.updated_at ? new Date(skill.updated_at).getTime() : 0;
  return [
    skillStatusPriority[skill.status || ''] || 0,
    skillScopePriority[skill.scope || ''] || 0,
    Number.isNaN(updatedAt) ? 0 : updatedAt,
  ];
}

function isPreferredWorkflowSkill(candidate: Skill, current: Skill) {
  const candidateScore = getWorkflowSkillScore(candidate);
  const currentScore = getWorkflowSkillScore(current);

  for (let index = 0; index < candidateScore.length; index += 1) {
    if (candidateScore[index] !== currentScore[index]) {
      return candidateScore[index] > currentScore[index];
    }
  }

  return candidate.id.localeCompare(current.id) < 0;
}

function dedupeWorkflowSkillOptions(sourceSkills: Skill[]) {
  const preferredByFamily = new Map<string, Skill>();

  sourceSkills.forEach((skill) => {
    const familyId = getWorkflowSkillFamilyId(skill);
    const current = preferredByFamily.get(familyId);
    if (!current || isPreferredWorkflowSkill(skill, current)) {
      preferredByFamily.set(familyId, skill);
    }
  });

  return sourceSkills.filter((skill) => preferredByFamily.get(getWorkflowSkillFamilyId(skill))?.id === skill.id);
}

type WorkflowStepStatus =
  | 'pending'
  | 'in_progress'
  | 'self_checking'
  | 'agent_validating'
  | 'validation_failed'
  | 'completed';
type WorkflowStepValidationStatus = 'not_started' | 'running' | 'passed' | 'failed' | 'error';
type WorkflowValidationOutcome = 'pass' | 'needs_revision' | 'blocked' | 'error';
type WorkflowStepSnapshotType = 'auto' | 'manual' | 'validation_candidate';

interface WorkflowStepValidationFinding {
  id: string;
  severity: 'blocking' | 'warning' | 'suggestion';
  criterion: string;
  issue: string;
  recommendation: string;
  evidence?: string;
}

interface WorkflowStepValidationPhase {
  outcome: WorkflowValidationOutcome;
  summary: string;
  findings: WorkflowStepValidationFinding[];
  rawText?: string;
  generator?: 'claude-code-cli';
}

interface WorkflowStepValidationAttempt {
  id: string;
  workflowId: string;
  stepId: string;
  artifactHash: string;
  artifactSnapshotId?: string;
  skillId: string;
  skillVersion?: string;
  criteria: string[];
  selfCheck?: WorkflowStepValidationPhase;
  agentValidation?: WorkflowStepValidationPhase;
  status: 'running' | 'passed' | 'failed' | 'error';
  created_at: string;
  updated_at: string;
}

interface WorkflowStep {
  id: string;
  name: string;
  skill_id: string;
  step_index: number;
  runMode?: 'serial' | 'parallel';
  parallelGroupId?: string;
  parallelGroupName?: string;
  isRemoved?: boolean;
  removedAt?: string;
  status: WorkflowStepStatus;
  output: string | null;
  candidateOutput?: string;
  candidateArtifactHash?: string;
  candidateSnapshotId?: string;
  validationAttemptId?: string;
  validationStatus?: WorkflowStepValidationStatus;
  validationSummary?: string;
  created_at?: string;
  updated_at?: string;
  completed_at?: string;
}

type WorkflowDemoHandoffStatus = 'queued' | 'ready' | 'running' | 'succeeded' | 'failed' | 'canceled';

interface WorkflowDemoHandoff {
  id: string;
  workflowId: string;
  stepId: string;
  externalWorkflowId: string;
  externalProjectKey: string;
  title: string;
  documentTitle: string;
  documentFormat: 'markdown';
  handoffId?: string;
  studioUrl?: string;
  directStudioUrl?: string;
  status: WorkflowDemoHandoffStatus;
  error?: string;
  created_at: string;
  updated_at: string;
}

type WorkflowFileContentKind = 'text' | 'image_data_url' | 'metadata';

interface WorkflowContextSelection {
  knowledgeBaseIds: string[];
  reviewMaterialIds: string[];
  disabledAutoInjectedStepIds?: string[];
  updated_at?: string;
}

interface WorkflowSkillDraft {
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
  acceptanceCriteria?: string[];
  requiredSections?: string[];
  evidenceRules?: string[];
  failureConditions?: string[];
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

interface Workflow {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  status: 'draft' | 'in_progress' | 'completed';
  steps: WorkflowStep[];
  contextFiles?: UploadedContextFile[];
  reviewedOutputFiles?: ReviewedOutputFile[];
  reviewComments?: Record<string, string>;
  archivedReviewStepIds?: string[];
  contextSelections?: Record<string, WorkflowContextSelection>;
  stepSnapshots?: WorkflowStepSnapshot[];
  stepChats?: Record<string, ChatMessage[]>;
  skillDrafts?: Record<string, WorkflowSkillDraft>;
  validationAttempts?: WorkflowStepValidationAttempt[];
  demoHandoffs?: WorkflowDemoHandoff[];
  created_at?: string;
  updated_at?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

type WorkflowStepRunMode = NonNullable<WorkflowStep['runMode']>;

interface WorkflowTemplateStep {
  label: string;
  aliases: string[];
  runMode: WorkflowStepRunMode;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  defaultWorkflowName: string;
  defaultWorkflowDescription: string;
  steps: WorkflowTemplateStep[];
}

interface WorkflowExecutionGroup {
  id: string;
  runMode: WorkflowStepRunMode;
  stepIndex: number;
  steps: WorkflowStep[];
}

type ChatPersistenceStatus = 'idle' | 'streaming' | 'saving' | 'saved' | 'failed';
type DeleteTarget =
  | { type: 'workspace'; id: string; name: string; workflowCount: number }
  | { type: 'workflow'; id: string; name: string; workspaceId: string };

function getWorkspaceDescriptionText(description?: string) {
  const value = description?.trim();
  return value && value !== '未填写目录说明' ? value : '';
}

interface AssistantQuickReplyQuestion {
  id: string;
  label: string;
  prompt: string;
  options: string[];
  multi: boolean;
}

const builtInWorkflowTemplates: WorkflowTemplate[] = [
  {
    id: 'ai-native-product-planning-e2e',
    name: 'AI Native 产品规划端到端验证',
    description: '按产品规划输入、并行分析、用户旅程、TR1、Demo、TR2 并行产物的链路进行端到端验证。',
    defaultWorkflowName: 'AI Native 产品规划端到端验证',
    defaultWorkflowDescription: '基于内置产品规划 Skill 模板，完成输入、分析、旅程、TR1、Demo 与 TR2 产物生成。',
    steps: [
      {
        label: '产品规划输入需求+Prompt',
        aliases: ['产品规划输入需求+Prompt', '产品规划输入需求', '产品规划输入', '规划输入', 'product-planning-input', 'planning-input'],
        runMode: 'serial',
      },
      {
        label: '共创客户验证分析',
        aliases: ['共创客户验证分析', 'co-create-customer-minutes-analysis', 'customer-validation', '客户验证分析'],
        runMode: 'parallel',
      },
      {
        label: '竞品功能研究',
        aliases: ['竞品功能研究', '竞品功能分析', '功能研究型竞品分析', 'feature-competitor-analysis', 'competitor-feature-research'],
        runMode: 'parallel',
      },
      {
        label: '竞品痛点收集',
        aliases: ['竞品痛点收集', '竞品痛点收集分析', '痛点收集型竞品分析', 'competitor-painpoint-research', 'painpoint-competitor-analysis'],
        runMode: 'parallel',
      },
      {
        label: '竞品解法研究',
        aliases: ['竞品解法研究', '竞品解法分析', '问题求解型竞品分析', 'solution-competitor-analysis', 'competitor-solution-research'],
        runMode: 'parallel',
      },
      {
        label: '用户旅程设计',
        aliases: ['用户旅程设计', 'user-journey-design', 'journey-design'],
        runMode: 'serial',
      },
      {
        label: 'TR1 需求规格',
        aliases: [
          'TR1 需求规格',
          'TR1 用户需求说明书生成器',
          'TR1 用户需求说明书',
          '用户需求说明书生成器',
          '用户需求规格说明书',
          'tr1-requirements-spec',
          'team-tr1-requirements-spec',
          'review-tr1-requirements-spec',
          'requirements-spec',
          '需求规格',
        ],
        runMode: 'serial',
      },
      {
        label: 'Demo 生成',
        aliases: ['Demo 生成', 'demo-creator', 'demo生成器', 'demo-generator'],
        runMode: 'serial',
      },
      {
        label: 'EPIC 生成',
        aliases: ['EPIC 生成', 'tr2-epic-creator', 'epic-creator', 'epic生成器'],
        runMode: 'parallel',
      },
      {
        label: 'Feature 生成',
        aliases: ['Feature 生成', 'tr2-feature-creator', 'feature-creator', 'feature生成器'],
        runMode: 'parallel',
      },
      {
        label: 'Story 生成',
        aliases: ['Story 生成', 'tr2-story-creator', 'story-creator', 'story生成器'],
        runMode: 'parallel',
      },
      {
        label: 'Tech 需求',
        aliases: ['Tech 需求', 'tr2-tech-creator', 'tech-creator', 'tech需求生成器', '技术需求'],
        runMode: 'parallel',
      },
    ],
  },
];

function normalizeTemplateMatchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s_+\-—–/｜|：:（）()【】[\].,，。"'`]+/g, '');
}

function getSkillSearchText(skill: Skill) {
  return [
    skill.id,
    skill.name,
    skill.description,
    ...(skill.tags || []),
  ].filter(Boolean);
}

function matchTemplateStepSkill(
  step: WorkflowTemplateStep,
  skillOptions: Skill[],
  usedSkillIds: Set<string>,
) {
  const normalizedAliases = step.aliases.map(normalizeTemplateMatchText).filter(Boolean);
  const candidates = skillOptions
    .filter((skill) => !usedSkillIds.has(skill.id))
    .map((skill) => {
      const fields = getSkillSearchText(skill).map(normalizeTemplateMatchText).filter(Boolean);
      const exactMatch = fields.some((field) => normalizedAliases.some((alias) => field === alias));
      if (exactMatch) return { skill, score: 3 };

      const containsMatch = fields.some((field) => normalizedAliases.some((alias) => (
        field.includes(alias) || alias.includes(field)
      )));
      if (containsMatch) return { skill, score: 2 };

      return { skill, score: 0 };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  return candidates[0]?.skill;
}

function resolveWorkflowTemplateSkills(template: WorkflowTemplate, skillOptions: Skill[]) {
  const usedSkillIds = new Set<string>();
  const matchedSkills: Skill[] = [];
  const missingSteps: WorkflowTemplateStep[] = [];
  const modes: Record<string, WorkflowStepRunMode> = {};

  template.steps.forEach((step) => {
    const skill = matchTemplateStepSkill(step, skillOptions, usedSkillIds);
    if (!skill) {
      missingSteps.push(step);
      return;
    }

    usedSkillIds.add(skill.id);
    matchedSkills.push(skill);
    modes[skill.id] = step.runMode;
  });

  return { matchedSkills, missingSteps, modes };
}

const chatErrorFallbackContent = '抱歉，对话出现了问题，请重试。';
const chatErrorFallbackPrefix = '抱歉，对话出现了问题';
const chatCancelledContent = '已终止本次生成。';
const claudeRuntimeSkillMisfireMarkers = [
  '/<skill-name>',
  'system-reminder',
  'available-skills',
  '可用 Skill 列表',
  '可用的 Skill',
  '已注册的可用 Skill',
  '没有看到任何已注册',
  '无法猜测或自行发明技能名称',
];

function isClaudeRuntimeSkillMisfireMessage(message: ChatMessage) {
  if (message.role !== 'assistant') return false;
  return claudeRuntimeSkillMisfireMarkers.some((marker) => message.content.includes(marker));
}

function sanitizeChatMessages(messages: ChatMessage[]) {
  return messages.filter((message) => !isClaudeRuntimeSkillMisfireMessage(message));
}

function getLastAssistantMessage(messages: ChatMessage[]) {
  return [...messages].reverse().find((message) => message.role === 'assistant');
}

function getLastConfirmableAssistantMessage(messages: ChatMessage[]) {
  const lastAssistantMessage = getLastAssistantMessage(messages);
  const content = lastAssistantMessage?.content.trim() || '';
  if (
    !content
    || content.startsWith(chatErrorFallbackPrefix)
    || content.startsWith(chatCancelledContent)
  ) return undefined;
  return lastAssistantMessage;
}

function hasConfirmableAssistantMessage(messages: ChatMessage[]) {
  return Boolean(getLastConfirmableAssistantMessage(messages));
}

function cleanQuickReplyOption(rawOption: string) {
  return rawOption
    .replace(/^[\s>*•\-+]+/, '')
    .replace(/^\d+[.)、]\s*/, '')
    .replace(/^[☐□■▪▫✅☑️✔️⚠️]+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getDefaultQuickReplyOptions(question: AssistantQuickReplyQuestion) {
  if (question.options.length === 0) {
    return ['无补充，按当前建议继续'];
  }

  const defaults = question.options.filter((option) => /默认|优先|使用|✅|✔|可补充/.test(option));
  return defaults.length > 0 ? defaults : [question.options[0]];
}

function extractAssistantQuickReplyQuestions(content: string): AssistantQuickReplyQuestion[] {
  const text = content.trim();
  if (
    !text
    || text.startsWith(chatErrorFallbackPrefix)
    || text.startsWith(chatCancelledContent)
  ) {
    return [];
  }

  const lines = text.split('\n');
  const questions: AssistantQuickReplyQuestion[] = [];
  let current: AssistantQuickReplyQuestion | null = null;

  const commitCurrent = () => {
    if (!current) return;
    const promptLooksActionable = /确认|是否|有没有|有无|同意|需要|偏好|限制/.test(current.prompt);
    if (current.options.length > 0 || promptLooksActionable) {
      questions.push(current);
    }
    current = null;
  };

  lines.forEach((line, index) => {
    const normalized = line
      .replace(/\*\*/g, '')
      .replace(/^#{1,6}\s*/, '')
      .trim();
    const questionMatch = normalized.match(/^(问题|确认)\s*(\d+)?\s*[：:]\s*(.+)$/);
    const confirmMatch = !questionMatch
      ? normalized.match(/^(确认以上[^，。,.]*)(?:[，。,.]|$)/)
      : null;

    if (questionMatch || confirmMatch) {
      commitCurrent();
      const label = questionMatch
        ? `${questionMatch[1]}${questionMatch[2] ? ` ${questionMatch[2]}` : ''}`
        : '确认';
      const prompt = (questionMatch ? questionMatch[3] : confirmMatch?.[1] || '').trim();
      current = {
        id: `${label}-${index}`,
        label,
        prompt,
        options: [],
        multi: /以下|类型|来源|材料|选项|哪些|偏好|限制|可选|多个|列表/.test(prompt),
      };
      return;
    }

    const optionMatch = normalized.match(/^[-*•]\s+(.+)$/)
      || normalized.match(/^[☐□■▪▫✅☑️✔️⚠️]\s*(.+)$/);
    if (current && optionMatch) {
      const option = cleanQuickReplyOption(optionMatch[1]);
      if (option && option.length <= 120) {
        current.options.push(option);
      }
    }
  });

  commitCurrent();

  if (questions.length === 0 && /确认以上|可以进入|继续|开始/.test(text.slice(-240))) {
    return [{
      id: 'confirm-continue',
      label: '确认',
      prompt: '确认以上内容并继续',
      options: ['确认，按当前建议继续'],
      multi: false,
    }];
  }

  return questions.slice(-3);
}

function buildQuickReplyText(
  questions: AssistantQuickReplyQuestion[],
  selections: Record<string, string[]>,
) {
  if (questions.length === 0) return '';

  return questions.map((question) => {
    const selectedOptions = selections[question.id]?.length
      ? selections[question.id]
      : getDefaultQuickReplyOptions(question);
    return `${question.label}：${selectedOptions.join('、')}`;
  }).join('\n');
}

function AssistantQuickReplyPanel({
  questions,
  disabled,
  onSubmit,
}: {
  questions: AssistantQuickReplyQuestion[];
  disabled: boolean;
  onSubmit: (reply: string) => void;
}) {
  const [selections, setSelections] = useState<Record<string, string[]>>({});

  const toggleOption = (question: AssistantQuickReplyQuestion, option: string) => {
    setSelections((prev) => {
      const currentOptions = prev[question.id] || [];
      const selected = currentOptions.includes(option);
      return {
        ...prev,
        [question.id]: question.multi
          ? selected
            ? currentOptions.filter((item) => item !== option)
            : [...currentOptions, option]
          : selected
            ? []
            : [option],
      };
    });
  };

  const replyText = buildQuickReplyText(questions, selections);

  return (
    <div className="w-full min-w-0 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm shadow-sm">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-primary">快速确认</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">选择后直接发送，无需手动组织回复。</p>
        </div>
        <Button
          type="button"
          size="sm"
          className="h-8 shrink-0 gap-1.5 text-xs"
          disabled={disabled || !replyText}
          onClick={() => onSubmit(replyText)}
        >
          <ArrowRight className="h-3.5 w-3.5" />
          发送选择
        </Button>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {questions.map((question) => {
          const selectedOptions = selections[question.id] || [];
          const displayOptions = question.options.length > 0
            ? question.options
            : getDefaultQuickReplyOptions(question);
          const effectiveSelectedOptions = selectedOptions.length > 0
            ? selectedOptions
            : getDefaultQuickReplyOptions(question);

          return (
            <div key={question.id} className="rounded-md border border-border/45 bg-background/70 p-2.5">
              <div className="flex flex-wrap items-start gap-2">
                <Badge variant="secondary" className="shrink-0 text-[10px]">{question.label}</Badge>
                <p className="min-w-0 flex-1 text-xs font-medium leading-5">{question.prompt}</p>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {displayOptions.map((option) => {
                  const selected = effectiveSelectedOptions.includes(option);
                  return (
                    <Button
                      key={option}
                      type="button"
                      variant={selected ? 'default' : 'outline'}
                      size="sm"
                      className="h-auto min-h-7 max-w-full justify-start whitespace-normal px-2 py-1 text-left text-xs"
                      disabled={disabled}
                      onClick={() => toggleOption(question, option)}
                    >
                      {selected && <CheckCircle2 className="mr-1 h-3.5 w-3.5 shrink-0" />}
                      <span className="min-w-0 break-words">{option}</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getStepDemoHandoff(workflow?: Workflow | null, stepId?: string) {
  if (!workflow || !stepId) return undefined;
  return (workflow.demoHandoffs || []).find((handoff) => handoff.stepId === stepId && Boolean(handoff.studioUrl));
}

function getDemoHandoffStatusLabel(status?: WorkflowDemoHandoffStatus) {
  switch (status) {
    case 'queued':
      return '已排队';
    case 'running':
      return '生成中';
    case 'succeeded':
      return '已完成';
    case 'failed':
      return '失败';
    case 'canceled':
      return '已取消';
    case 'ready':
    default:
      return '可打开';
  }
}

function sortWorkflowStepsForDisplay(steps: WorkflowStep[]) {
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

function getVisibleWorkflowSteps(workflow: Workflow) {
  return sortWorkflowStepsForDisplay(workflow.steps.filter((step) => !step.isRemoved));
}

function getWorkflowExecutionGroups(steps: WorkflowStep[]): WorkflowExecutionGroup[] {
  const groups: WorkflowExecutionGroup[] = [];
  let parallelGroupCounter = 0;

  sortWorkflowStepsForDisplay(steps).forEach((step) => {
    const runMode = step.runMode === 'parallel' ? 'parallel' : 'serial';
    const previousGroup = groups[groups.length - 1];

    if (runMode === 'parallel' && previousGroup?.runMode === 'parallel') {
      previousGroup.steps.push(step);
      return;
    }

    if (runMode === 'parallel') {
      parallelGroupCounter += 1;
      groups.push({
        id: `parallel-${step.parallelGroupId || parallelGroupCounter}-${groups.length}`,
        runMode,
        stepIndex: step.step_index,
        steps: [step],
      });
      return;
    }

    groups.push({
      id: `serial-${step.id}`,
      runMode,
      stepIndex: step.step_index,
      steps: [step],
    });
  });

  return groups;
}

function deriveWorkflowStatusFromSteps(steps: WorkflowStep[]): Workflow['status'] {
  const activeSteps = steps.filter((step) => !step.isRemoved);
  if (activeSteps.length === 0) return 'draft';
  if (activeSteps.every((step) => step.status === 'completed')) return 'completed';
  return 'in_progress';
}

function isValidationGateStatus(status: WorkflowStepStatus) {
  return status === 'self_checking' || status === 'agent_validating' || status === 'validation_failed';
}

function isActiveWorkflowStepStatus(status: WorkflowStepStatus) {
  return status === 'in_progress' || isValidationGateStatus(status);
}

function isStepConfirmableStatus(status: WorkflowStepStatus) {
  return status === 'in_progress' || status === 'validation_failed';
}

function getStepStatusLabel(status: WorkflowStepStatus) {
  switch (status) {
    case 'completed':
      return '已完成';
    case 'self_checking':
      return 'Skill 自检中';
    case 'agent_validating':
      return 'Agent 校验中';
    case 'validation_failed':
      return '验证未通过';
    case 'in_progress':
      return '进行中';
    default:
      return '未开始';
  }
}

function getValidationAttemptStatusLabel(status?: WorkflowStepValidationAttempt['status']) {
  switch (status) {
    case 'passed':
      return '已通过';
    case 'failed':
      return '未通过';
    case 'error':
      return '运行错误';
    case 'running':
      return '运行中';
    default:
      return '未开始';
  }
}

function getValidationAttemptTone(status?: WorkflowStepValidationAttempt['status']) {
  if (status === 'passed') return 'success';
  if (status === 'failed' || status === 'error') return 'danger';
  if (status === 'running') return 'brand';
  return 'neutral';
}

function getValidationOutcomeLabel(outcome?: WorkflowValidationOutcome) {
  switch (outcome) {
    case 'pass':
      return '通过';
    case 'needs_revision':
      return '需要修订';
    case 'blocked':
      return '阻塞';
    case 'error':
      return '错误';
    default:
      return '未运行';
  }
}

function getFindingSeverityLabel(severity: WorkflowStepValidationFinding['severity']) {
  if (severity === 'blocking') return '阻塞';
  if (severity === 'warning') return '警告';
  return '建议';
}

function getFindingSeverityTone(severity: WorkflowStepValidationFinding['severity']) {
  if (severity === 'blocking') return 'danger';
  if (severity === 'warning') return 'warning';
  return 'neutral';
}

function normalizeWorkflowExecutionPlan(workflow: Workflow, updatedAt = new Date().toISOString()): Workflow {
  const visibleSteps = getVisibleWorkflowSteps(workflow);
  const removedSteps = workflow.steps.filter((step) => step.isRemoved);
  const groups = getWorkflowExecutionGroups(visibleSteps);
  const firstIncompleteGroupIndex = groups.findIndex((group) => (
    group.steps.some((step) => step.status !== 'completed')
  ));
  let nextStepIndex = 0;
  let parallelGroupCounter = 0;

  const normalizedVisibleSteps = groups.flatMap((group, groupIndex) => {
    const stepIndex = nextStepIndex;
    nextStepIndex += 1;

    if (group.runMode === 'parallel') {
      parallelGroupCounter += 1;
    }

    const parallelGroupId = group.runMode === 'parallel'
      ? `parallel-${workflow.id}-${parallelGroupCounter}`
      : undefined;
    const parallelGroupName = group.runMode === 'parallel'
      ? `并行任务组 ${parallelGroupCounter}`
      : undefined;

    return group.steps.map((step) => {
      const isActiveIncompleteGroup = groupIndex === firstIncompleteGroupIndex;
      const nextStatus = step.status === 'completed'
        ? 'completed'
        : isActiveIncompleteGroup
          ? isValidationGateStatus(step.status) ? step.status : 'in_progress'
          : 'pending';

      const nextStep: WorkflowStep = {
        ...step,
        step_index: stepIndex,
        runMode: group.runMode,
        parallelGroupId,
        parallelGroupName,
        status: nextStatus,
      };

      if (group.runMode === 'serial') {
        nextStep.parallelGroupId = undefined;
        nextStep.parallelGroupName = undefined;
      }

      return nextStep;
    });
  });

  const nextSteps = [...normalizedVisibleSteps, ...removedSteps];

  return {
    ...workflow,
    status: deriveWorkflowStatusFromSteps(nextSteps),
    steps: nextSteps,
    updated_at: updatedAt,
  };
}

function hasWorkflowExecutionPlanChanged(source: Workflow, normalized: Workflow) {
  if (source.status !== normalized.status) return true;
  if (source.steps.length !== normalized.steps.length) return true;

  return source.steps.some((step, index) => {
    const normalizedStep = normalized.steps[index];
    if (!normalizedStep || step.id !== normalizedStep.id) return true;
    return (
      step.step_index !== normalizedStep.step_index
      || (step.runMode || 'serial') !== (normalizedStep.runMode || 'serial')
      || step.parallelGroupId !== normalizedStep.parallelGroupId
      || step.parallelGroupName !== normalizedStep.parallelGroupName
      || step.status !== normalizedStep.status
    );
  });
}

function getPriorWorkflowSteps(workflow: Workflow, step: WorkflowStep) {
  const visibleSteps = getVisibleWorkflowSteps(workflow);
  const groups = getWorkflowExecutionGroups(visibleSteps);
  const currentGroupIndex = groups.findIndex((group) => group.steps.some((item) => item.id === step.id));
  if (currentGroupIndex <= 0) return [];

  return groups
    .slice(0, currentGroupIndex)
    .flatMap((group) => group.steps);
}

function buildSelectedWorkflowSteps(
  selectedSkills: Skill[],
  selectedSkillModes: Record<string, WorkflowStepRunMode>,
) {
  let stepIndex = 0;
  let parallelGroupCounter = 0;
  let activeParallelGroupId = '';
  let activeParallelGroupName = '';
  let previousMode: WorkflowStepRunMode | undefined;

  return selectedSkills.map((skill, index) => {
    const mode = selectedSkillModes[skill.id] === 'parallel' ? 'parallel' : 'serial';

    if (mode === 'parallel' && previousMode !== 'parallel') {
      parallelGroupCounter += 1;
      activeParallelGroupId = `parallel-${Date.now()}-${parallelGroupCounter}`;
      activeParallelGroupName = `并行任务组 ${parallelGroupCounter}`;
    }

    const step = {
      name: skill.name,
      skill_id: skill.id,
      step_index: stepIndex,
      runMode: mode,
      parallelGroupId: mode === 'parallel' ? activeParallelGroupId : undefined,
      parallelGroupName: mode === 'parallel' ? activeParallelGroupName : undefined,
    };

    const nextMode = index + 1 < selectedSkills.length
      ? selectedSkillModes[selectedSkills[index + 1].id] || 'serial'
      : undefined;

    if (mode === 'serial' || nextMode !== 'parallel') {
      stepIndex += 1;
    }
    previousMode = mode;

    return step;
  });
}

function getChatErrorContent(error: unknown) {
  const message = error instanceof Error ? error.message.trim() : '';
  if (!message || message === 'Chat request failed') return chatErrorFallbackContent;
  return `${chatErrorFallbackPrefix}：${message}。`;
}

async function getChatResponseError(response: Response) {
  try {
    const data = await response.json() as { error?: unknown };
    if (typeof data.error === 'string' && data.error.trim()) return data.error.trim();
  } catch {
    // The response might be an interrupted SSE stream or a non-JSON error page.
  }
  return 'Chat request failed';
}

function isAbortError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const maybeError = error as { name?: unknown };
  return maybeError.name === 'AbortError';
}

interface KnowledgeBaseOption {
  id: string;
  name: string;
  description: string;
  source_type?: 'builtin' | 'external';
  dataset_name?: string;
  document_count?: number;
  updated_at?: string;
}

interface KnowledgeBaseResponse {
  knowledgeBases?: KnowledgeBaseOption[];
  serviceUnavailable?: boolean;
  error?: string;
}

interface ReviewMaterial {
  id: string;
  name: string;
  source: string;
  summary: string;
}

interface UploadedContextFile {
  id: string;
  stepId: string;
  name: string;
  type: string;
  size: number;
  isImage: boolean;
  previewUrl?: string;
  contentKind: WorkflowFileContentKind;
  content?: string;
  note?: string;
  created_at?: string;
}

interface ReviewedOutputFile {
  id: string;
  stepId: string;
  name: string;
  type: string;
  size: number;
  contentKind: WorkflowFileContentKind;
  content?: string;
  note?: string;
  created_at?: string;
}

interface WorkflowStepSnapshot {
  id: string;
  workflowId: string;
  stepId: string;
  stepName: string;
  stepIndex: number;
  output: string;
  snapshotType?: WorkflowStepSnapshotType;
  label?: string;
  contextFiles: string[];
  reviewedMaterials: string[];
  reviewComment?: string;
  created_at?: string;
}

interface Workspace {
  id: string;
  name: string;
  description: string;
  created_at?: string;
  updated_at?: string;
}

const defaultContextSelection: WorkflowContextSelection = {
  knowledgeBaseIds: [],
  reviewMaterialIds: [],
  disabledAutoInjectedStepIds: [],
};

const maxTextContextChars = 32_000;
const maxPreviewImageBytes = 800_000;
const maxStepPromptContextChars = 12_000;
const maxTotalStepPromptContextChars = 36_000;
const maxChatRequestMessages = 12;
const maxChatRequestMessageChars = 12_000;
const maxTotalChatRequestMessageChars = 48_000;
const maxRenderedMarkdownPreviewChars = 24_000;
const maxDocumentTitleScanChars = 16_000;
const maxDocumentTypeScanChars = 12_000;

function sliceTextWithMiddleOmission(value: string, maxChars: number) {
  if (value.length <= maxChars) {
    return { text: value, truncated: false, omittedChars: 0 };
  }

  const headChars = Math.floor(maxChars * 0.72);
  const tailChars = Math.max(maxChars - headChars, 0);
  const omittedChars = value.length - headChars - tailChars;

  return {
    text: [
      value.slice(0, headChars),
      '',
      `...（中间省略 ${omittedChars.toLocaleString('zh-CN')} 字符）...`,
      '',
      tailChars > 0 ? value.slice(-tailChars) : '',
    ].filter(Boolean).join('\n'),
    truncated: true,
    omittedChars,
  };
}

function getRenderedMarkdownPreview(content: string, maxChars = maxRenderedMarkdownPreviewChars) {
  const sliced = sliceTextWithMiddleOmission(content.trim(), maxChars);
  return {
    content: sliced.text,
    truncated: sliced.truncated,
    omittedChars: sliced.omittedChars,
  };
}

function buildPromptChatMessages(messages: ChatMessage[]) {
  const recentMessages = messages.slice(-maxChatRequestMessages);
  let remainingMessageChars = maxTotalChatRequestMessageChars;

  return recentMessages.map((message) => {
    if (remainingMessageChars <= 0) {
      return {
        ...message,
        content: `注：该历史消息未注入正文，因为本轮历史对话上下文已达到 ${maxTotalChatRequestMessageChars.toLocaleString('zh-CN')} 字符预算。`,
      };
    }

    const sliced = sliceTextWithMiddleOmission(
      message.content,
      Math.min(maxChatRequestMessageChars, remainingMessageChars),
    );
    remainingMessageChars -= sliced.text.length;

    return {
      ...message,
      content: sliced.truncated
        ? [
          sliced.text,
          '',
          `注：该历史消息原始长度为 ${message.content.length.toLocaleString('zh-CN')} 字符，本轮请求已按上下文预算截取。`,
        ].join('\n')
        : sliced.text,
    };
  });
}

function isReadableTextFile(file: File) {
  return file.type.startsWith('text/') || /\.(txt|md|markdown)$/i.test(file.name);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error || new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

async function buildWorkflowFilePayload(file: File) {
  if (isReadableTextFile(file)) {
    const rawText = await file.text();
    const truncated = rawText.length > maxTextContextChars;
    const content = truncated ? rawText.slice(0, maxTextContextChars) : rawText;
    return {
      contentKind: 'text' as const,
      content,
      note: truncated ? `文件正文已截断到 ${maxTextContextChars} 字符。` : undefined,
      previewUrl: undefined,
    };
  }

  if (file.type.startsWith('image/') && file.size <= maxPreviewImageBytes) {
    const dataUrl = await readFileAsDataUrl(file);
    return {
      contentKind: 'image_data_url' as const,
      content: dataUrl,
      note: '图片已保存为 data URL，可用于预览；当前对话以图片元信息引用。',
      previewUrl: dataUrl,
    };
  }

  return {
    contentKind: 'metadata' as const,
    content: undefined,
    note: file.type.startsWith('image/')
      ? `图片超过 ${Math.round(maxPreviewImageBytes / 1024)}KB，已保存元信息。`
      : '该文件类型当前保存元信息，未读取正文。',
    previewUrl: undefined,
  };
}

export default function WorkflowsPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>('');
  const [workspaceSpaceId, setWorkspaceSpaceId] = useState<string>('');
  const [skills, setSkills] = useState<Skill[]>([]);
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(-1);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatInputByStepId, setChatInputByStepId] = useState<Record<string, string>>({});
  const [streamingByStepId, setStreamingByStepId] = useState<Record<string, boolean>>({});
  const [expandedAssistantDocumentIds, setExpandedAssistantDocumentIds] = useState<Record<string, boolean>>({});
  const [chatPersistenceByStepId, setChatPersistenceByStepId] = useState<Record<string, ChatPersistenceStatus>>({});
  const [confirmingStepId, setConfirmingStepId] = useState<string | null>(null);
  const [validationStageByStepId, setValidationStageByStepId] = useState<Record<string, 'self_checking' | 'agent_validating'>>({});
  const [demoHandoffLoadingByStepId, setDemoHandoffLoadingByStepId] = useState<Record<string, boolean>>({});
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedWorkflowTemplateId, setSelectedWorkflowTemplateId] = useState('');
  const [draggingSelectedSkillId, setDraggingSelectedSkillId] = useState<string | null>(null);
  const [dragOverSelectedSkillId, setDragOverSelectedSkillId] = useState<string | null>(null);
  const [draggingWorkflowStepId, setDraggingWorkflowStepId] = useState<string | null>(null);
  const [dragOverWorkflowStepId, setDragOverWorkflowStepId] = useState<string | null>(null);
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [isDeletingTarget, setIsDeletingTarget] = useState(false);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(null);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newWorkspaceDesc, setNewWorkspaceDesc] = useState('');
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [newWorkflowDesc, setNewWorkflowDesc] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<Skill[]>([]);
  const [selectedSkillModes, setSelectedSkillModes] = useState<Record<string, 'serial' | 'parallel'>>({});
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseOption[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeNotice, setKnowledgeNotice] = useState('');
  const [selectedKnowledgeBaseIds, setSelectedKnowledgeBaseIds] = useState<string[]>([]);
  const [selectedReviewMaterialIds, setSelectedReviewMaterialIds] = useState<string[]>([]);
  const [uploadedContextFiles, setUploadedContextFiles] = useState<UploadedContextFile[]>([]);
  const [reviewedOutputFiles, setReviewedOutputFiles] = useState<ReviewedOutputFile[]>([]);
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
  const [supplementalContextOpen, setSupplementalContextOpen] = useState(false);
  const [supplementalContextTab, setSupplementalContextTab] = useState<'knowledge' | 'materials' | 'files'>('knowledge');
  const [rightPanelTab, setRightPanelTab] = useState<'outputs' | 'gate' | 'review' | 'archive'>('outputs');
  const [expandedOutputIds, setExpandedOutputIds] = useState<Record<string, boolean>>({});
  const [archivedReviewStepIds, setArchivedReviewStepIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const workflowSkillOptions = useMemo(() => dedupeWorkflowSkillOptions(skills), [skills]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reviewedOutputInputRef = useRef<HTMLInputElement>(null);
  const activeStepIdRef = useRef<string | null>(null);
  const activeChatRequestByStepIdRef = useRef<Record<string, AbortController>>({});
  const workflowsRef = useRef<Workflow[]>([]);
  const activeWorkflowRef = useRef<Workflow | null>(null);
  const validationStageTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const workflowStepDragSourceRef = useRef<string | null>(null);

  useEffect(() => {
    workflowsRef.current = workflows;
  }, [workflows]);

  useEffect(() => {
    activeWorkflowRef.current = activeWorkflow;
  }, [activeWorkflow]);

  useEffect(() => {
    if (!draggingWorkflowStepId) return undefined;

    const handleMouseUp = () => {
      workflowStepDragSourceRef.current = null;
      setDraggingWorkflowStepId(null);
      setDragOverWorkflowStepId(null);
    };

    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [draggingWorkflowStepId]);

  const getVisibleSteps = (workflow: Workflow) => getVisibleWorkflowSteps(workflow);

  const normalizeContextSelection = (selection?: Partial<WorkflowContextSelection>): WorkflowContextSelection => ({
    knowledgeBaseIds: Array.isArray(selection?.knowledgeBaseIds) ? selection.knowledgeBaseIds : [],
    reviewMaterialIds: Array.isArray(selection?.reviewMaterialIds) ? selection.reviewMaterialIds : [],
    disabledAutoInjectedStepIds: Array.isArray(selection?.disabledAutoInjectedStepIds)
      ? selection.disabledAutoInjectedStepIds
      : [],
    updated_at: selection?.updated_at,
  });

  const getContextSelection = (workflow: Workflow, stepId?: string): WorkflowContextSelection => (
    normalizeContextSelection(stepId ? workflow.contextSelections?.[stepId] : defaultContextSelection)
  );

  const getStepChatMessages = (workflow: Workflow, stepId?: string): ChatMessage[] => (
    stepId && Array.isArray(workflow.stepChats?.[stepId])
      ? sanitizeChatMessages(workflow.stepChats[stepId])
      : []
  );

  const setStepChatPersistenceStatus = (stepId: string, status: ChatPersistenceStatus) => {
    setChatPersistenceByStepId((prev) => ({
      ...prev,
      [stepId]: status,
    }));
  };

  const syncWorkflowSupportingState = (workflow: Workflow, stepIndex: number) => {
    const visibleSteps = getVisibleSteps(workflow);
    const step = visibleSteps[stepIndex] || visibleSteps[0];
    const selection = getContextSelection(workflow, step?.id);

    setUploadedContextFiles(workflow.contextFiles || []);
    setReviewedOutputFiles(workflow.reviewedOutputFiles || []);
    setReviewComments(workflow.reviewComments || {});
    setArchivedReviewStepIds(workflow.archivedReviewStepIds || []);
    setSelectedKnowledgeBaseIds(selection.knowledgeBaseIds);
    setSelectedReviewMaterialIds(selection.reviewMaterialIds);
  };

  const switchActiveStep = (workflow: Workflow, stepIndex: number) => {
    const visibleSteps = getVisibleSteps(workflow);
    const nextStep = visibleSteps[stepIndex] || visibleSteps[0];
    const nextIndex = Math.max(visibleSteps.findIndex((step) => step.id === nextStep?.id), 0);

    setActiveStepIndex(nextIndex);
    activeStepIdRef.current = nextStep?.id || null;
    syncWorkflowSupportingState(workflow, nextIndex);
    const nextStepMessages = getStepChatMessages(workflow, nextStep?.id);
    setChatMessages(nextStepMessages);
    setChatInput(nextStep?.id ? chatInputByStepId[nextStep.id] || '' : '');
    if (nextStep?.id) {
      setStepChatPersistenceStatus(nextStep.id, hasConfirmableAssistantMessage(nextStepMessages) ? 'saved' : 'idle');
    }
    const priorSteps = nextStep ? getPriorWorkflowSteps(workflow, nextStep) : [];
    setRightPanelTab(
      nextStep?.status === 'validation_failed'
        ? 'gate'
        : nextStep?.output || priorSteps.some((step) => step.output)
        ? 'outputs'
        : 'outputs',
    );
  };

  const persistWorkflow = useCallback(async (workflow: Workflow) => {
    try {
      const response = await fetch('/api/workflows', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '工作流保存失败');
      const savedWorkflow = data.workflow as Workflow;
      setWorkflows((prev) => prev.map((item) => (item.id === savedWorkflow.id ? savedWorkflow : item)));
      setActiveWorkflow((prev) => (prev?.id === savedWorkflow.id ? savedWorkflow : prev));
      return savedWorkflow;
    } catch (error) {
      console.error('Workflow save error:', error);
      setErrorMessage(error instanceof Error ? error.message : '工作流保存失败');
      return null;
    }
  }, []);

  const getLatestWorkflowSnapshot = useCallback((workflowId: string, fallback: Workflow): Workflow => (
    workflowsRef.current.find((workflow) => workflow.id === workflowId)
      || (activeWorkflowRef.current?.id === workflowId ? activeWorkflowRef.current : null)
      || fallback
  ), []);

  const updateActiveWorkflow = useCallback((updater: (workflow: Workflow) => Workflow) => {
    if (!activeWorkflow) return;

    const updatedWorkflow = updater(activeWorkflow);
    setActiveWorkflow(updatedWorkflow);
    setWorkflows((prev) => prev.map((workflow) => (
      workflow.id === updatedWorkflow.id ? updatedWorkflow : workflow
    )));
    void persistWorkflow(updatedWorkflow);
  }, [activeWorkflow, persistWorkflow]);

  const updateWorkflowById = useCallback((workflowId: string, updater: (workflow: Workflow) => Workflow) => {
    const sourceWorkflow = workflows.find((workflow) => workflow.id === workflowId)
      || (activeWorkflow?.id === workflowId ? activeWorkflow : null);
    if (!sourceWorkflow) return;

    const updatedWorkflow = updater(sourceWorkflow);
    setWorkflows((prev) => prev.map((workflow) => (
      workflow.id === workflowId ? updatedWorkflow : workflow
    )));
    setActiveWorkflow((prev) => (prev?.id === workflowId ? updatedWorkflow : prev));
    void persistWorkflow(updatedWorkflow);
  }, [activeWorkflow, persistWorkflow, workflows]);

  const saveStepChatMessages = useCallback((
    workflow: Workflow,
    stepId: string,
    messages: ChatMessage[],
    options: { persist?: boolean } = {},
  ) => {
    const nextMessages = sanitizeChatMessages(messages);
    const updatedAt = new Date().toISOString();
    const buildNextWorkflow = (source: Workflow): Workflow => ({
      ...source,
      stepChats: {
        ...(source.stepChats || {}),
        [stepId]: nextMessages,
      },
      updated_at: updatedAt,
    });
    const updatedWorkflow = buildNextWorkflow(workflow);

    setWorkflows((prev) => prev.map((item) => (
      item.id === workflow.id ? buildNextWorkflow(item) : item
    )));
    setActiveWorkflow((prev) => (
      prev?.id === workflow.id ? buildNextWorkflow(prev) : prev
    ));

    if (options.persist !== false) {
      void persistWorkflow(updatedWorkflow);
    }

    return updatedWorkflow;
  }, [persistWorkflow]);

  const openWorkflow = (workflow: Workflow) => {
    const normalizedWorkflow = normalizeWorkflowExecutionPlan(
      workflow,
      workflow.updated_at || new Date().toISOString(),
    );
    setActiveWorkflow(normalizedWorkflow);
    setWorkflows((prev) => prev.map((item) => (
      item.id === normalizedWorkflow.id ? normalizedWorkflow : item
    )));
    if (hasWorkflowExecutionPlanChanged(workflow, normalizedWorkflow)) {
      void persistWorkflow(normalizedWorkflow);
    }
    const visibleSteps = getVisibleSteps(normalizedWorkflow);
    const firstInProgress = visibleSteps.findIndex((step) => isActiveWorkflowStepStatus(step.status));
    const nextStepIndex = firstInProgress >= 0 ? firstInProgress : 0;
    switchActiveStep(normalizedWorkflow, nextStepIndex);
  };

  const loadWorkflowState = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      const [skillsResponse, workflowsResponse] = await Promise.all([
        fetch('/api/skills', { cache: 'no-store' }),
        fetch('/api/workflows', { cache: 'no-store' }),
      ]);

      const skillsData = await skillsResponse.json();
      const workflowsData = await workflowsResponse.json();

      if (!skillsResponse.ok) throw new Error(skillsData.error || 'Skill 加载失败');
      if (!workflowsResponse.ok) throw new Error(workflowsData.error || '工作流加载失败');

      const availableSkills = ((skillsData.skills || []) as Skill[])
        .filter((skill) => skill.status !== 'pending_review' && skill.status !== 'rejected' && skill.status !== 'archived');
      const nextWorkspaces = (workflowsData.workspaces || []) as Workspace[];
      const nextWorkflows = (workflowsData.workflows || []) as Workflow[];

      setSkills(availableSkills);
      setWorkspaces(nextWorkspaces);
      setWorkflows(nextWorkflows);
      setActiveWorkspaceId((current) => (
        nextWorkspaces.some((workspace) => workspace.id === current)
          ? current
          : nextWorkspaces[0]?.id || ''
      ));
      setWorkspaceSpaceId((current) => (
        nextWorkspaces.some((workspace) => workspace.id === current)
          ? current
          : ''
      ));
      setActiveWorkflow((current) => {
        if (!current) return current;
        return nextWorkflows.find((workflow) => workflow.id === current.id) || null;
      });
    } catch (error) {
      console.error('Workflow state load error:', error);
      setErrorMessage(error instanceof Error ? error.message : '工作流数据加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadKnowledgeBases = useCallback(async () => {
    setKnowledgeLoading(true);
    setKnowledgeNotice('');

    try {
      const response = await fetch('/api/knowledge', { cache: 'no-store' });
      const data = await response.json() as KnowledgeBaseResponse;

      if (data.serviceUnavailable) {
        setKnowledgeBases([]);
        setKnowledgeNotice(data.error || '知识库服务未配置，暂时无法访问真实知识库。');
        return;
      }

      if (!response.ok) throw new Error(data.error || '知识库加载失败');
      setKnowledgeBases(data.knowledgeBases || []);
    } catch (error) {
      console.error('Knowledge bases load error:', error);
      setKnowledgeBases([]);
      setKnowledgeNotice(error instanceof Error ? error.message : '知识库加载失败');
    } finally {
      setKnowledgeLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkflowState();
  }, [loadWorkflowState]);

  useEffect(() => {
    loadKnowledgeBases();
  }, [loadKnowledgeBases]);

  useEffect(() => () => {
    Object.values(activeChatRequestByStepIdRef.current).forEach((controller) => controller.abort());
    activeChatRequestByStepIdRef.current = {};
    Object.values(validationStageTimersRef.current).forEach((timer) => clearTimeout(timer));
    validationStageTimersRef.current = {};
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const clearValidationStage = useCallback((stepId: string) => {
    const existingTimer = validationStageTimersRef.current[stepId];
    if (existingTimer) clearTimeout(existingTimer);
    delete validationStageTimersRef.current[stepId];
    setValidationStageByStepId((prev) => {
      const next = { ...prev };
      delete next[stepId];
      return next;
    });
  }, []);

  const updateVisibleChatMessagesForStep = useCallback((stepId: string, messages: ChatMessage[]) => {
    if (activeStepIdRef.current === stepId) {
      setChatMessages(messages);
    }
  }, []);

  const startValidationStage = useCallback((stepId: string) => {
    clearValidationStage(stepId);
    setValidationStageByStepId((prev) => ({ ...prev, [stepId]: 'self_checking' }));
    validationStageTimersRef.current[stepId] = setTimeout(() => {
      setValidationStageByStepId((prev) => (
        prev[stepId] === 'self_checking'
          ? { ...prev, [stepId]: 'agent_validating' }
          : prev
      ));
      delete validationStageTimersRef.current[stepId];
    }, 1200);
  }, [clearValidationStage]);

  const getStepIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />;
      case 'self_checking':
      case 'agent_validating':
        return <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />;
      case 'validation_failed':
        return <CircleStop className="h-5 w-5 shrink-0 text-destructive" />;
      case 'in_progress':
        return <Clock className="h-5 w-5 shrink-0 animate-pulse text-blue-500" />;
      default:
        return <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />;
    }
  };

  const addUploadedContextFiles = useCallback(async (files: File[]) => {
    if (!activeWorkflow || activeStepIndex < 0 || files.length === 0) return;

    const currentStepForFiles = getVisibleSteps(activeWorkflow)[activeStepIndex];
    if (!currentStepForFiles) return;

    const createdAt = new Date().toISOString();
    const nextFiles = await Promise.all(files.map(async (file) => {
      const payload = await buildWorkflowFilePayload(file);
      return {
        id: `file-${Date.now()}-${file.name}-${Math.random().toString(16).slice(2)}`,
        stepId: currentStepForFiles.id,
        name: file.name || '粘贴图片',
        type: file.type || 'unknown',
        size: file.size,
        isImage: file.type.startsWith('image/'),
        created_at: createdAt,
        ...payload,
      };
    }));

    setUploadedContextFiles((prev) => [...prev, ...nextFiles]);
    updateActiveWorkflow((workflow) => ({
      ...workflow,
      contextFiles: [...(workflow.contextFiles || []), ...nextFiles],
      updated_at: createdAt,
    }));
  }, [activeStepIndex, activeWorkflow, updateActiveWorkflow]);

  const addReviewedOutputFiles = useCallback(async (files: File[], stepId?: string) => {
    if (!stepId || files.length === 0) return;

    const createdAt = new Date().toISOString();
    const nextFiles = await Promise.all(files.map(async (file) => {
      const payload = await buildWorkflowFilePayload(file);
      return {
        id: `reviewed-${Date.now()}-${file.name}-${Math.random().toString(16).slice(2)}`,
        stepId,
        name: file.name,
        type: file.type || 'unknown',
        size: file.size,
        created_at: createdAt,
        ...payload,
      };
    }));

    setReviewedOutputFiles((prev) => [...prev, ...nextFiles]);
    updateActiveWorkflow((workflow) => ({
      ...workflow,
      reviewedOutputFiles: [...(workflow.reviewedOutputFiles || []), ...nextFiles],
      updated_at: createdAt,
    }));
  }, [updateActiveWorkflow]);


  const handlePasteContextFiles = useCallback((event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files);
    if (files.length > 0) {
      void addUploadedContextFiles(files);
    }
  }, [addUploadedContextFiles]);

  const formatFileSize = (size: number) => {
    if (size < 1024) return `${size}B`;
    if (size < 1024 * 1024) return `${Math.ceil(size / 1024)}KB`;
    return `${(size / 1024 / 1024).toFixed(1)}MB`;
  };

  const summarizeWorkflowFile = (file: UploadedContextFile | ReviewedOutputFile, maxChars = 1200) => {
    const metadata = `${file.name}（${file.type || 'unknown'}，${formatFileSize(file.size)}）`;
    if (file.contentKind === 'text' && file.content) {
      return `${metadata}\n${file.content.slice(0, maxChars)}${file.content.length > maxChars ? '\n...（已截断）' : ''}`;
    }
    return file.note ? `${metadata}\n${file.note}` : metadata;
  };

  const extractMarkdownFence = (content: string) => {
    const fenced = content.match(/```(?:markdown|md)\s*\n([\s\S]*?)```/i);
    return fenced?.[1]?.trim();
  };

  const normalizeSkillOutputDocument = (
    workflow: Workflow,
    step: WorkflowStep,
    assistantContent: string,
  ) => {
    const raw = (extractMarkdownFence(assistantContent) || assistantContent).trim();
    const markerMatch = raw.match(
      /(?:^|\n)#{1,3}\s*(?:Skill\s*输出文档|输出文档|最终产出|产出物|Deliverable|Output)\s*\n/i,
    );
    const body = markerMatch?.index !== undefined && markerMatch.index >= 0
      ? raw.slice(markerMatch.index).trim()
      : raw;

    if (/^#\s+\S/.test(body)) {
      return body;
    }

    return [
      `# ${step.name} - Skill 输出文档`,
      '',
      `> 工作流：${workflow.name}`,
      '',
      body || '本步骤暂无可保存产物内容。',
    ].join('\n');
  };

  const downloadStepOutput = (stepName: string, output: string) => {
    const fileName = `${activeWorkflow?.name || '工作流'}-${stepName}.md`.replace(/[\\/:*?"<>|]/g, '-');
    const content = /^#\s+\S/.test(output.trim())
      ? output
      : `# ${stepName}\n\n${output}`;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadMarkdownDocument = (fileNameBase: string, content: string) => {
    const fileName = `${fileNameBase || 'Skill 输出文档'}.md`.replace(/[\\/:*?"<>|]/g, '-');
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyMarkdownToClipboard = useCallback(async (content: string, label = 'Markdown 文档') => {
    const normalizedContent = content.trim();

    if (!normalizedContent) {
      toast.warning('暂无可复制内容');
      return;
    }

    const fallbackCopy = () => {
      const textarea = document.createElement('textarea');
      textarea.value = normalizedContent;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.inset = '0 auto auto -9999px';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      return copied;
    };

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(normalizedContent);
      } else if (!fallbackCopy()) {
        throw new Error('Clipboard fallback failed');
      }

      toast.success(`${label}已复制到剪贴板`);
    } catch (error) {
      if (fallbackCopy()) {
        toast.success(`${label}已复制到剪贴板`);
        return;
      }

      console.warn('Failed to copy Markdown content', error);
      toast.error('复制失败，可展开后手动选择内容复制');
    }
  }, []);

  const getMarkdownDocumentTitle = (content: string, fallback: string) => {
    const sample = content.length > maxDocumentTitleScanChars ? content.slice(0, maxDocumentTitleScanChars) : content;
    const heading = sample.match(/^\s*#{1,3}\s+(.+)$/m)?.[1]?.trim();
    if (heading) return heading.slice(0, 64);

    const firstLine = sample
      .split('\n')
      .map((line) => line.replace(/^[>\s#*-]+/, '').trim())
      .find(Boolean);

    return (firstLine || fallback).slice(0, 64);
  };

  const isAssistantDocumentLike = (content: string) => {
    const value = content.trim();
    if (value.length < 900) return false;
    const sample = value.length > maxDocumentTypeScanChars ? value.slice(0, maxDocumentTypeScanChars) : value;
    return (
      /^#{1,3}\s+\S/m.test(sample)
      || /\n\|[^|\n]+\|[^|\n]+\|\n\|[\s:|-]+\|/.test(sample)
      || /(输出文档|最终产出|分析报告|需求说明书|规格说明书|Markdown 文档)/.test(sample)
    );
  };

  const renderAssistantDocumentCard = (content: string, messageIndex: number) => {
    const documentContent = activeWorkflow && currentStep
      ? normalizeSkillOutputDocument(activeWorkflow, currentStep, content)
      : content.trim();
    const title = getMarkdownDocumentTitle(documentContent, `${currentStep?.name || '当前步骤'} - Skill 输出文档`);
    const documentId = `${currentStep?.id || 'step'}-${messageIndex}`;
    const isExpanded = Boolean(expandedAssistantDocumentIds[documentId]);
    const previewDocument = getRenderedMarkdownPreview(documentContent);

    return (
      <div
        key={`assistant-document-${messageIndex}`}
        className="w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-border/50 bg-card shadow-sm md:max-w-[80%] xl:max-w-[44rem]"
      >
        <div className={`flex min-w-0 items-center justify-between gap-3 bg-muted/25 px-3 py-2.5 ${isExpanded ? 'border-b border-border/50' : ''}`}>
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{title}</p>
              <p className="text-[11px] text-muted-foreground">
                Markdown 文档 · {documentContent.length.toLocaleString('zh-CN')} 字符 · 确认步骤后保存
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              title="复制 Markdown"
              aria-label="复制 Markdown 文档"
              onClick={() => copyMarkdownToClipboard(documentContent)}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              title="下载 Markdown"
              aria-label="下载 Markdown 文档"
              onClick={() => downloadMarkdownDocument(title, documentContent)}
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 px-2 text-xs"
              title={isExpanded ? '折叠文档' : '展开文档'}
              aria-expanded={isExpanded}
              aria-controls={`assistant-document-body-${documentId}`}
              onClick={() => {
                setExpandedAssistantDocumentIds((prev) => ({
                  ...prev,
                  [documentId]: !isExpanded,
                }));
              }}
            >
              {isExpanded ? '折叠' : '展开'}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </Button>
          </div>
        </div>
        {isExpanded && (
          <div
            id={`assistant-document-body-${documentId}`}
            className="max-h-[min(34rem,55vh)] min-w-0 overflow-y-auto p-4"
          >
            <CompactMarkdown
              content={previewDocument.content}
              className="text-sm leading-6 [&_h2]:text-sm [&_h3]:text-xs [&_table]:text-[11px]"
            />
            {previewDocument.truncated && (
              <p className="mt-3 rounded-md border border-border/60 bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
                预览已省略 {previewDocument.omittedChars.toLocaleString('zh-CN')} 字符，复制或下载可获取完整 Markdown。
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  const getSavedStepOutputFileId = (stepId: string) => `saved-step-output-${stepId}`;

  const buildStepOutputMarkdown = (workflow: Workflow, step: WorkflowStep) => {
    const output = (step.output || '').trim();
    if (!output) return `# ${step.name} - Skill 输出文档\n\n> 工作流：${workflow.name}\n\n暂无产物。`;
    return /^#\s+\S/.test(output)
      ? output
      : `# ${workflow.name}\n\n## ${step.name}\n\n${output}`;
  };

  const buildStepOutputPromptContext = (
    workflow: Workflow,
    step: WorkflowStep,
    maxChars = maxStepPromptContextChars,
  ) => {
    const output = buildStepOutputMarkdown(workflow, step);
    const sliced = sliceTextWithMiddleOmission(output, maxChars);

    if (!sliced.truncated) return sliced.text;

    return [
      sliced.text,
      '',
      `注：该前序步骤产物原始长度为 ${output.length.toLocaleString('zh-CN')} 字符，本轮上下文已按 ${maxChars.toLocaleString('zh-CN')} 字符预算截取。`,
    ].join('\n');
  };

  const getEffectiveSkillForStep = useCallback((workflow?: Workflow | null, step?: WorkflowStep): Skill | undefined => {
    if (!workflow || !step) return undefined;
    return skills.find((skill) => skill.id === step.skill_id);
  }, [skills]);

  const buildSavedStepOutputFile = (
    workflow: Workflow,
    step: WorkflowStep,
    createdAt: string,
  ): ReviewedOutputFile => {
    const content = buildStepOutputMarkdown(workflow, step);
    return {
      id: getSavedStepOutputFileId(step.id),
      stepId: step.id,
      name: `${workflow.name}-${step.name}-产出.md`.replace(/[\\/:*?"<>|]/g, '-'),
      type: 'text/markdown',
      size: new TextEncoder().encode(content).length,
      contentKind: 'text',
      content,
      note: '由当前步骤产出保存，可作为后续步骤的补充上下文材料引用。',
      created_at: createdAt,
    };
  };

  const downloadReviewedOutputFile = (file: ReviewedOutputFile) => {
    const content = file.content || file.note || file.name;
    const blob = new Blob([content], { type: `${file.type || 'text/plain'};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name.replace(/[\\/:*?"<>|]/g, '-');
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadWorkflowFinalOutput = (workflow: Workflow, steps: WorkflowStep[]) => {
    if (steps.length === 0) return;
    const content = [
      `# ${workflow.name} 最终产出`,
      workflow.description ? `\n${workflow.description}` : '',
      ...steps.map((step) => `\n\n## ${step.name}\n\n${step.output || ''}`),
    ].join('');
    const fileName = `${workflow.name}-最终产出.md`.replace(/[\\/:*?"<>|]/g, '-');
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const formatSnapshotTime = (value?: string) => {
    if (!value) return '未记录时间';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('zh-CN', { hour12: false });
  };

  const buildStepSnapshot = (
    workflow: Workflow,
    step: WorkflowStep,
    output: string,
    createdAt: string,
  ): WorkflowStepSnapshot => {
    const selection = getContextSelection(workflow, step.id);
    const knowledgeBaseIds = selectedKnowledgeBaseIds.length > 0
      ? selectedKnowledgeBaseIds
      : selection.knowledgeBaseIds;
    const reviewMaterialIds = selectedReviewMaterialIds.length > 0
      ? selectedReviewMaterialIds
      : selection.reviewMaterialIds;
    const selectedReviewIds = new Set(reviewMaterialIds);
    const disabledAutoIds = new Set(selection.disabledAutoInjectedStepIds || []);
    const priorSteps = getPriorWorkflowSteps(workflow, step);
    const autoInjectedStepIds = new Set(
      priorSteps
        .filter((item) => item.output && !disabledAutoIds.has(item.id))
        .map((item) => item.id),
    );

    const selectedKnowledgeBases = knowledgeBases
      .filter((kb) => knowledgeBaseIds.includes(kb.id))
      .map((kb) => `知识库：${kb.name}（${kb.description}）`);
    const stepContextFiles = (workflow.contextFiles || [])
      .filter((file) => file.stepId === step.id)
      .map((file) => summarizeWorkflowFile(file, 800));
    const autoInjectedStepMaterials = priorSteps
      .filter((item) => item.output && !disabledAutoIds.has(item.id))
      .map((item) => {
        const markdown = buildStepOutputMarkdown(workflow, item);
        return `默认注入：${item.name} Markdown 产物\n${markdown.slice(0, 1200)}${markdown.length > 1200 ? '\n...（已截断）' : ''}`;
      });
    const selectedStepMaterials = getVisibleSteps(workflow)
      .filter((item) => selectedReviewIds.has(item.id) && !autoInjectedStepIds.has(item.id) && item.output)
      .map((item) => {
        const markdown = buildStepOutputMarkdown(workflow, item);
        return `${item.name}产物\n${markdown.slice(0, 1200)}${markdown.length > 1200 ? '\n...（已截断）' : ''}`;
      });
    const selectedUploadedMaterials = (workflow.reviewedOutputFiles || [])
      .filter((file) => selectedReviewIds.has(file.id))
      .map((file) => summarizeWorkflowFile(file, 800));
    const currentStepReviewedFiles = (workflow.reviewedOutputFiles || [])
      .filter((file) => file.stepId === step.id && !selectedReviewIds.has(file.id))
      .map((file) => summarizeWorkflowFile(file, 800));
    const reviewComment = workflow.reviewComments?.[step.id]?.trim() || reviewComments[step.id]?.trim() || '';

    return {
      id: `snapshot-${Date.now()}-${step.id}`,
      workflowId: workflow.id,
      stepId: step.id,
      stepName: step.name,
      stepIndex: step.step_index,
      output,
      contextFiles: [...selectedKnowledgeBases, ...stepContextFiles],
      reviewedMaterials: [...autoInjectedStepMaterials, ...selectedStepMaterials, ...selectedUploadedMaterials, ...currentStepReviewedFiles],
      reviewComment: reviewComment || undefined,
      created_at: createdAt,
    };
  };

  const handleSendMessage = useCallback(async (overrideMessage?: string) => {
    const workflow = activeWorkflow;
    const currentStep = workflow ? getVisibleSteps(workflow)[activeStepIndex] : undefined;
    if (!workflow || !currentStep) return;

    const stepInput = overrideMessage ?? chatInputByStepId[currentStep.id] ?? chatInput;
    const userMessage = stepInput.trim();
    if (!userMessage || streamingByStepId[currentStep.id]) return;

    const currentStepContextFiles = uploadedContextFiles.filter((file) => file.stepId === currentStep.id);
    const selectedKnowledgeBases = knowledgeBases.filter((kb) => selectedKnowledgeBaseIds.includes(kb.id));
    const contextSelection = getContextSelection(workflow, currentStep.id);
    const disabledAutoInjectedStepIds = new Set(contextSelection.disabledAutoInjectedStepIds || []);
    const autoInjectedStepOutputs: Array<{ id: string; name: string; output: string }> = [];
    let remainingStepContextChars = maxTotalStepPromptContextChars;
    for (const step of getPriorWorkflowSteps(workflow, currentStep)) {
      if (!step.output || disabledAutoInjectedStepIds.has(step.id)) {
        continue;
      }

      if (remainingStepContextChars <= 0) {
        autoInjectedStepOutputs.push({
          id: step.id,
          name: step.name,
          output: `注：该前序步骤产物未注入正文，因为本轮前序产物上下文已达到 ${maxTotalStepPromptContextChars.toLocaleString('zh-CN')} 字符预算。`,
        });
        continue;
      }

      const output = buildStepOutputPromptContext(
        workflow,
        step,
        Math.min(maxStepPromptContextChars, remainingStepContextChars),
      );
      remainingStepContextChars -= output.length;
      autoInjectedStepOutputs.push({
        id: step.id,
        name: step.name,
        output,
      });
    }
    const autoInjectedStepOutputIds = new Set(autoInjectedStepOutputs.map((step) => step.id));
    const selectedReviewMaterials = getVisibleSteps(workflow)
      .filter((step) => (
        selectedReviewMaterialIds.includes(step.id)
        && !autoInjectedStepOutputIds.has(step.id)
        && step.output
      ))
      .map((step) => ({
        name: step.name,
        source: '工作流已评审产物',
        summary: buildStepOutputPromptContext(workflow, step, 1200),
      }));
    const selectedUploadedReviewMaterials = reviewedOutputFiles
      .filter((file) => selectedReviewMaterialIds.includes(file.id))
      .map((file) => ({
        name: file.name,
        source: '本地上传审核产物',
        summary: summarizeWorkflowFile(file, 1200),
      }));
    const contextSummary = [
      autoInjectedStepOutputs.length > 0
        ? `默认注入的前序步骤 Markdown 产物：${autoInjectedStepOutputs.map((step) => step.name).join('、')}。`
        : '',
      selectedKnowledgeBases.length > 0
        ? `选中的知识库：${selectedKnowledgeBases.map((kb) => `${kb.name}（${kb.description || '无描述'}）`).join('；')}。发送时将按本轮问题检索相关片段。`
        : '',
      selectedReviewMaterials.length > 0
        ? `选中的已评审材料：${selectedReviewMaterials.map((material) => `${material.name}：${material.summary}`).join('；')}`
        : '',
      selectedUploadedReviewMaterials.length > 0
        ? `选中的本地审核材料：${selectedUploadedReviewMaterials.map((material) => `${material.name}：${material.summary}`).join('；')}`
        : '',
      currentStepContextFiles.length > 0
        ? `用户上传/粘贴的文件：\n${currentStepContextFiles.map((file) => summarizeWorkflowFile(file, 1200)).join('\n\n')}`
        : '',
    ].filter(Boolean).join('\n');
    const messageWithContext = contextSummary
      ? `${userMessage}\n\n[本轮补充上下文]\n${contextSummary}`
      : userMessage;
    const visibleMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: userMessage }];
    const requestMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: messageWithContext }];

    setChatInputByStepId((prev) => ({ ...prev, [currentStep.id]: '' }));
    if (activeStepIdRef.current === currentStep.id) {
      setChatInput('');
    }
    updateVisibleChatMessagesForStep(currentStep.id, visibleMessages);
    saveStepChatMessages(workflow, currentStep.id, visibleMessages, { persist: false });
    setStepChatPersistenceStatus(currentStep.id, 'streaming');
    const controller = new AbortController();
    activeChatRequestByStepIdRef.current[currentStep.id] = controller;
    let assistantContent = '';
    setStreamingByStepId((prev) => ({ ...prev, [currentStep.id]: true }));

    try {
      const skillDef = getEffectiveSkillForStep(workflow, currentStep);

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: buildPromptChatMessages(requestMessages).map((m) => ({
            role: m.role,
            content: m.content,
          })),
          agent_provider: 'claude-code-cli',
          model_id: 'doubao-seed-2-0-pro-260215',
          workflow_id: workflow.id,
          skill_definition: skillDef ? {
            id: skillDef.id,
            skill_id: skillDef.id,
            name: skillDef.name,
            description: skillDef.description,
            methodology: skillDef.methodology,
            outputs: skillDef.outputs,
            checklist: skillDef.checklist,
            tools: skillDef.tools,
            prompt_template: skillDef.prompt_template,
            skill_md: skillDef.skill_md,
            scope: skillDef.scope,
            status: skillDef.status,
            package_assets: skillDef.package_assets || [],
            tuning_request: 'tuning_request' in skillDef ? skillDef.tuning_request : undefined,
          } : undefined,
          step_context: autoInjectedStepOutputs.map((step) => ({
            step_name: step.name,
            step_output: step.output,
          })),
          selected_knowledge_bases: selectedKnowledgeBases,
          knowledge_query: userMessage,
          selected_review_materials: [...selectedReviewMaterials, ...selectedUploadedReviewMaterials],
          uploaded_files: currentStepContextFiles.map(({ previewUrl, ...file }) => file),
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(await getChatResponseError(response));
      if (!response.body) throw new Error('Chat response body is missing');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      updateVisibleChatMessagesForStep(currentStep.id, [...visibleMessages, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            let data: { content?: string; done?: boolean; error?: string };
            try {
              data = JSON.parse(line.slice(6));
            } catch {
              // Skip non-JSON lines
              continue;
            }
            if (data.error) throw new Error(data.error);
            if (data.content) {
              assistantContent += data.content;
              updateVisibleChatMessagesForStep(currentStep.id, [...visibleMessages, { role: 'assistant', content: assistantContent }]);
            }
            if (data.done) break;
          }
        }
      }
      const finalMessages: ChatMessage[] = [
        ...visibleMessages,
        { role: 'assistant', content: assistantContent },
      ];
      updateVisibleChatMessagesForStep(currentStep.id, finalMessages);
      const workflowWithFinalMessages = saveStepChatMessages(
        getLatestWorkflowSnapshot(workflow.id, workflow),
        currentStep.id,
        finalMessages,
        { persist: false },
      );
      setStepChatPersistenceStatus(currentStep.id, 'saving');
      const savedWorkflow = await persistWorkflow(workflowWithFinalMessages);
      setStepChatPersistenceStatus(currentStep.id, savedWorkflow ? 'saved' : 'failed');
    } catch (error) {
      if (isAbortError(error)) {
        const cancelledMessages: ChatMessage[] = [
          ...visibleMessages,
          { role: 'assistant', content: chatCancelledContent },
        ];
        updateVisibleChatMessagesForStep(currentStep.id, cancelledMessages);
        const workflowWithCancelledMessages = saveStepChatMessages(
          getLatestWorkflowSnapshot(workflow.id, workflow),
          currentStep.id,
          cancelledMessages,
          { persist: false },
        );
        setStepChatPersistenceStatus(currentStep.id, 'saving');
        const savedWorkflow = await persistWorkflow(workflowWithCancelledMessages);
        setStepChatPersistenceStatus(currentStep.id, savedWorkflow ? 'saved' : 'failed');
        return;
      }

      console.error('Chat error:', error);
      const errorMessages: ChatMessage[] = [
        ...visibleMessages,
        { role: 'assistant', content: getChatErrorContent(error) },
      ];
      updateVisibleChatMessagesForStep(currentStep.id, errorMessages);
      const workflowWithErrorMessages = saveStepChatMessages(
        getLatestWorkflowSnapshot(workflow.id, workflow),
        currentStep.id,
        errorMessages,
        { persist: false },
      );
      setStepChatPersistenceStatus(currentStep.id, 'saving');
      const savedWorkflow = await persistWorkflow(workflowWithErrorMessages);
      setStepChatPersistenceStatus(currentStep.id, savedWorkflow ? 'saved' : 'failed');
    } finally {
      if (activeChatRequestByStepIdRef.current[currentStep.id] === controller) {
        delete activeChatRequestByStepIdRef.current[currentStep.id];
      }
      setStreamingByStepId((prev) => {
        if (!prev[currentStep.id]) return prev;
        const next = { ...prev };
        delete next[currentStep.id];
        return next;
      });
    }
  }, [
    chatInput,
    chatInputByStepId,
    chatMessages,
    streamingByStepId,
    activeWorkflow,
    activeStepIndex,
    saveStepChatMessages,
    getLatestWorkflowSnapshot,
    updateVisibleChatMessagesForStep,
    persistWorkflow,
    getEffectiveSkillForStep,
    knowledgeBases,
    selectedKnowledgeBaseIds,
    selectedReviewMaterialIds,
    uploadedContextFiles,
    reviewedOutputFiles,
  ]);

  const handleStopStreaming = useCallback(() => {
    const currentStep = activeWorkflow ? getVisibleSteps(activeWorkflow)[activeStepIndex] : undefined;
    if (!currentStep) return;
    activeChatRequestByStepIdRef.current[currentStep.id]?.abort();
  }, [activeWorkflow, activeStepIndex]);

  const handleChatInputKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    void handleSendMessage();
  }, [handleSendMessage]);

  const handleConfirmStep = async () => {
    if (!activeWorkflow || activeStepIndex < 0 || confirmingStepId) return;

    const currentStep = getVisibleSteps(activeWorkflow)[activeStepIndex];
    if (!currentStep) return;

    const lastAssistantMsg = getLastConfirmableAssistantMessage(chatMessages);
    const currentStepChatStatus = chatPersistenceByStepId[currentStep.id] || 'idle';
    if (
      streamingByStepId[currentStep.id]
      || currentStepChatStatus !== 'saved'
      || !lastAssistantMsg
    ) {
      return;
    }

    setConfirmingStepId(currentStep.id);

    try {
      const stepOutputDocument = normalizeSkillOutputDocument(activeWorkflow, currentStep, lastAssistantMsg.content);
      setErrorMessage('');
      startValidationStage(currentStep.id);
      const response = await fetch('/api/workflows/validation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: currentStep.status === 'validation_failed' ? 'retry_step_validation' : 'start_step_validation',
          workflowId: activeWorkflow.id,
          stepId: currentStep.id,
          candidateOutput: stepOutputDocument,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '验证运行失败');

      const savedWorkflow = data.workflow as Workflow;
      setWorkflows((prev) => prev.map((workflow) => (
        workflow.id === savedWorkflow.id ? savedWorkflow : workflow
      )));
      setActiveWorkflow(savedWorkflow);

      if (data.passed) {
        setRightPanelTab('outputs');
        const visibleSteps = getVisibleSteps(savedWorkflow);
        const nextInProgressIndex = visibleSteps.findIndex((step) => isActiveWorkflowStepStatus(step.status));
        const completedStepIndex = visibleSteps.findIndex((step) => step.id === currentStep.id);
        const nextActiveStepIndex = nextInProgressIndex >= 0
          ? nextInProgressIndex
          : Math.max(completedStepIndex, 0);
        setErrorMessage('');
        toast.success('验证通过', { description: '候选产物已沉淀为步骤输出。' });
        switchActiveStep(savedWorkflow, nextActiveStepIndex);
        return;
      }

      const currentStepIndex = Math.max(
        getVisibleSteps(savedWorkflow).findIndex((step) => step.id === currentStep.id),
        0,
      );
      setActiveStepIndex(currentStepIndex);
      activeStepIdRef.current = currentStep.id;
      syncWorkflowSupportingState(savedWorkflow, currentStepIndex);
      setChatMessages(getStepChatMessages(savedWorkflow, currentStep.id));
      setChatInput(chatInputByStepId[currentStep.id] || '');
      setRightPanelTab('gate');
      const failedStep = savedWorkflow.steps.find((step) => step.id === currentStep.id);
      const summary = failedStep?.validationSummary || data.attempt?.agentValidation?.summary || data.attempt?.selfCheck?.summary || '';
      const message = summary ? `验证未通过：${summary}` : '验证未通过，请修订后重新验证。';
      setErrorMessage(message);
      toast.error('验证未通过', { description: summary || '请根据验证反馈修订候选产物后重新验证。' });
    } catch (error) {
      const message = error instanceof Error ? error.message : '验证运行失败';
      setErrorMessage(message);
      toast.error('验证运行失败', { description: message });
    } finally {
      clearValidationStage(currentStep.id);
      setConfirmingStepId((stepId) => (stepId === currentStep.id ? null : stepId));
    }
  };

  const handleCreateWorkflow = async () => {
    if (!activeWorkspaceId || !newWorkflowName.trim() || selectedSkills.length < 3) return;

    const steps = buildSelectedWorkflowSteps(selectedSkills, selectedSkillModes);

    try {
      setErrorMessage('');
      const response = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_workflow',
          workspaceId: activeWorkspaceId,
          name: newWorkflowName.trim(),
          description: newWorkflowDesc.trim(),
          steps,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '创建工作流失败');

      const rawCreatedWorkflow = data.workflow as Workflow;
      const createdWorkflow = normalizeWorkflowExecutionPlan(
        rawCreatedWorkflow,
        rawCreatedWorkflow.updated_at || new Date().toISOString(),
      );
      setWorkflows((prev) => [createdWorkflow, ...prev]);
      setActiveWorkflow(createdWorkflow);
      setActiveStepIndex(0);
      activeStepIdRef.current = getVisibleSteps(createdWorkflow)[0]?.id || null;
      setChatMessages([]);
      setChatInput('');
      if (hasWorkflowExecutionPlanChanged(rawCreatedWorkflow, createdWorkflow)) {
        void persistWorkflow(createdWorkflow);
      }
      setCreateDialogOpen(false);
      setNewWorkflowName('');
      setNewWorkflowDesc('');
      setSelectedWorkflowTemplateId('');
      setSelectedSkills([]);
      setSelectedSkillModes({});
      resetSelectedSkillDrag();
    } catch (error) {
      console.error('Create workflow error:', error);
      setErrorMessage(error instanceof Error ? error.message : '创建工作流失败');
    }
  };

  const resetWorkspaceDialog = () => {
    setEditingWorkspaceId(null);
    setNewWorkspaceName('');
    setNewWorkspaceDesc('');
  };

  const handleOpenCreateWorkspace = () => {
    resetWorkspaceDialog();
    setWorkspaceDialogOpen(true);
  };

  const handleOpenEditWorkspace = (workspace: Workspace) => {
    setEditingWorkspaceId(workspace.id);
    setNewWorkspaceName(workspace.name);
    setNewWorkspaceDesc(getWorkspaceDescriptionText(workspace.description));
    setWorkspaceDialogOpen(true);
  };

  const handleWorkspaceDialogOpenChange = (open: boolean) => {
    setWorkspaceDialogOpen(open);
    if (!open) resetWorkspaceDialog();
  };

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim()) return;

    try {
      setErrorMessage('');
      const response = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_workspace',
          name: newWorkspaceName.trim(),
          description: newWorkspaceDesc.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '创建工作目录失败');

      const workspace = data.workspace as Workspace;
      setWorkspaces((prev) => [workspace, ...prev]);
      setActiveWorkspaceId(workspace.id);
      setWorkspaceSpaceId(workspace.id);
      setWorkspaceDialogOpen(false);
      setNewWorkspaceName('');
      setNewWorkspaceDesc('');
    } catch (error) {
      console.error('Create workspace error:', error);
      setErrorMessage(error instanceof Error ? error.message : '创建工作目录失败');
    }
  };

  const handleUpdateWorkspace = async () => {
    if (!editingWorkspaceId || !newWorkspaceName.trim()) return;

    try {
      setErrorMessage('');
      const response = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_workspace',
          id: editingWorkspaceId,
          name: newWorkspaceName.trim(),
          description: newWorkspaceDesc.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '更新工作目录失败');

      const workspace = data.workspace as Workspace;
      setWorkspaces((prev) => prev.map((item) => (item.id === workspace.id ? workspace : item)));
      setWorkspaceDialogOpen(false);
      resetWorkspaceDialog();
    } catch (error) {
      console.error('Update workspace error:', error);
      setErrorMessage(error instanceof Error ? error.message : '更新工作目录失败');
    }
  };

  const handleSaveWorkspace = () => {
    if (editingWorkspaceId) {
      void handleUpdateWorkspace();
      return;
    }
    void handleCreateWorkspace();
  };

  const handleDeleteWorkspace = async (workspaceId: string) => {
    try {
      setErrorMessage('');
      const response = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_workspace', id: workspaceId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '删除工作目录失败');

      const deletedWorkflowIds = new Set(
        workflows
          .filter((workflow) => workflow.workspaceId === workspaceId)
          .map((workflow) => workflow.id),
      );
      setWorkflows((prev) => prev.filter((workflow) => workflow.workspaceId !== workspaceId));
      if (activeWorkflow && deletedWorkflowIds.has(activeWorkflow.id)) {
        setActiveWorkflow(null);
        setActiveStepIndex(-1);
        activeStepIdRef.current = null;
        setChatMessages([]);
        setChatInput('');
      }
      setWorkspaces((prev) => {
        const next = prev.filter((workspace) => workspace.id !== workspaceId);
        if (activeWorkspaceId === workspaceId) {
          setActiveWorkspaceId(next[0]?.id || '');
        }
        if (workspaceSpaceId === workspaceId) {
          setWorkspaceSpaceId('');
        }
        return next;
      });
    } catch (error) {
      console.error('Delete workspace error:', error);
      setErrorMessage(error instanceof Error ? error.message : '删除工作目录失败');
    }
  };

  const handleDeleteWorkflow = async (workflowId: string) => {
    try {
      setErrorMessage('');
      const response = await fetch(`/api/workflows?id=${encodeURIComponent(workflowId)}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '删除工作流失败');

      setWorkflows((prev) => prev.filter((workflow) => workflow.id !== workflowId));
      if (activeWorkflow?.id === workflowId) {
        setActiveWorkflow(null);
        setActiveStepIndex(-1);
        activeStepIdRef.current = null;
        setChatMessages([]);
        setChatInput('');
      }
    } catch (error) {
      console.error('Delete workflow error:', error);
      setErrorMessage(error instanceof Error ? error.message : '删除工作流失败');
    }
  };

  const handleConfirmDeleteTarget = async () => {
    if (!deleteTarget || isDeletingTarget) return;

    setIsDeletingTarget(true);
    try {
      if (deleteTarget.type === 'workspace') {
        await handleDeleteWorkspace(deleteTarget.id);
      } else {
        await handleDeleteWorkflow(deleteTarget.id);
      }
      setDeleteTarget(null);
    } finally {
      setIsDeletingTarget(false);
    }
  };

  const handleOpenEditWorkflow = (workflow: Workflow) => {
    setEditingWorkflowId(workflow.id);
    setEditDialogOpen(true);
  };

  const handleCloneWorkflow = (workflow: Workflow) => {
    const timestamp = Date.now();
    const visibleSteps = getVisibleSteps(workflow);
    const firstVisibleStepId = visibleSteps[0]?.id;
    const clonedAt = new Date().toISOString();

    const clonedWorkflow = normalizeWorkflowExecutionPlan({
      ...workflow,
      id: `wf-clone-${timestamp}`,
      name: `${workflow.name} 副本`,
      status: 'draft',
      created_at: clonedAt,
      updated_at: clonedAt,
      steps: workflow.steps.map((step, index) => ({
        ...step,
        id: `step-clone-${timestamp}-${index}`,
        status: step.id === firstVisibleStepId ? 'in_progress' : 'pending',
        output: null,
        completed_at: undefined,
        removedAt: step.isRemoved ? new Date().toISOString() : undefined,
      })),
      stepSnapshots: [],
      stepChats: {},
      skillDrafts: {},
    }, clonedAt);

    setWorkflows((prev) => [clonedWorkflow, ...prev]);
    void persistWorkflow(clonedWorkflow);
  };

  const handleSoftRemoveStep = (workflowId: string, stepId: string) => {
    updateWorkflowById(workflowId, (workflow) => {
      const updatedAt = new Date().toISOString();
      return normalizeWorkflowExecutionPlan({
        ...workflow,
        steps: workflow.steps.map((step) => (
          step.id === stepId
            ? { ...step, isRemoved: true, removedAt: updatedAt, updated_at: updatedAt }
            : step
        )),
        updated_at: updatedAt,
      }, updatedAt);
    });
  };

  const handleRestoreStep = (workflowId: string, stepId: string) => {
    updateWorkflowById(workflowId, (workflow) => {
      const updatedAt = new Date().toISOString();
      return normalizeWorkflowExecutionPlan({
        ...workflow,
        steps: workflow.steps.map((step) => (
          step.id === stepId
            ? { ...step, isRemoved: false, removedAt: undefined, updated_at: updatedAt }
            : step
        )),
        updated_at: updatedAt,
      }, updatedAt);
    });
  };

  const handleUpdateStepRunMode = (workflowId: string, stepId: string, runMode: 'serial' | 'parallel') => {
    updateWorkflowById(workflowId, (workflow) => {
      const visibleSteps = getVisibleSteps(workflow);
      const stepPosition = visibleSteps.findIndex((step) => step.id === stepId);
      if (stepPosition < 0) return workflow;

      const targetStep = visibleSteps[stepPosition];
      const updatedAt = new Date().toISOString();

      return normalizeWorkflowExecutionPlan({
        ...workflow,
        steps: workflow.steps.map((step) => {
          if (step.id !== targetStep.id) return step;

          if (runMode === 'serial') {
            return {
              ...step,
              runMode: 'serial',
              parallelGroupId: undefined,
              parallelGroupName: undefined,
              updated_at: updatedAt,
            };
          }

          return {
            ...step,
            runMode: 'parallel',
            updated_at: updatedAt,
          };
        }),
        updated_at: updatedAt,
      }, updatedAt);
    });
  };

  const resetWorkflowStepDrag = () => {
    workflowStepDragSourceRef.current = null;
    setDraggingWorkflowStepId(null);
    setDragOverWorkflowStepId(null);
  };

  const beginWorkflowStepDrag = (stepId: string) => {
    workflowStepDragSourceRef.current = stepId;
    setDraggingWorkflowStepId(stepId);
    setDragOverWorkflowStepId(stepId);
  };

  const handleWorkflowStepDragStart = (event: DragEvent<HTMLElement>, stepId: string) => {
    beginWorkflowStepDrag(stepId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', stepId);
  };

  const handleWorkflowStepMouseDown = (event: MouseEvent<HTMLDivElement>, stepId: string) => {
    const target = event.target as HTMLElement;
    const isControl = target.closest('button') && !target.closest('[data-drag-handle="true"]');
    if (isControl) return;

    beginWorkflowStepDrag(stepId);
  };

  const handleWorkflowStepPointerDown = (event: PointerEvent<HTMLDivElement>, stepId: string) => {
    const target = event.target as HTMLElement;
    const isControl = target.closest('button') && !target.closest('[data-drag-handle="true"]');
    if (isControl) return;

    beginWorkflowStepDrag(stepId);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleWorkflowStepPointerMove = (event: PointerEvent<HTMLDivElement>, workflowId: string) => {
    const sourceStepId = workflowStepDragSourceRef.current;
    if (!sourceStepId) return;

    if (event.buttons === 0) {
      resetWorkflowStepDrag();
      return;
    }

    const targetElement = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest('[data-workflow-step-id]') as HTMLElement | null;
    const targetStepId = targetElement?.dataset.workflowStepId;

    if (!targetStepId || targetStepId === sourceStepId) return;

    setDragOverWorkflowStepId(targetStepId);
    handleReorderWorkflowStep(workflowId, sourceStepId, targetStepId);
  };

  const handleReorderWorkflowStep = (workflowId: string, sourceStepId: string, targetStepId: string) => {
    if (!sourceStepId || !targetStepId || sourceStepId === targetStepId) return;

    updateWorkflowById(workflowId, (workflow) => {
      const visibleSteps = getVisibleSteps(workflow);
      const sourceIndex = visibleSteps.findIndex((step) => step.id === sourceStepId);
      const targetIndex = visibleSteps.findIndex((step) => step.id === targetStepId);
      if (sourceIndex < 0 || targetIndex < 0) return workflow;

      const reorderedSteps = [...visibleSteps];
      const [movedStep] = reorderedSteps.splice(sourceIndex, 1);
      reorderedSteps.splice(targetIndex, 0, movedStep);

      const updatedAt = new Date().toISOString();
      const reorderedStepMap = new Map(
        reorderedSteps.map((step, index) => [
          step.id,
          {
            ...step,
            step_index: index,
            updated_at: updatedAt,
          },
        ]),
      );

      return normalizeWorkflowExecutionPlan({
        ...workflow,
        steps: workflow.steps.map((step) => reorderedStepMap.get(step.id) || step),
        updated_at: updatedAt,
      }, updatedAt);
    });
  };

  const resetSelectedSkillDrag = () => {
    setDraggingSelectedSkillId(null);
    setDragOverSelectedSkillId(null);
  };

  const handleReorderSelectedSkill = (sourceSkillId: string, targetSkillId: string) => {
    if (!sourceSkillId || !targetSkillId || sourceSkillId === targetSkillId) return;

    setSelectedSkills((prev) => {
      const sourceIndex = prev.findIndex((skill) => skill.id === sourceSkillId);
      const targetIndex = prev.findIndex((skill) => skill.id === targetSkillId);
      if (sourceIndex < 0 || targetIndex < 0) return prev;

      const next = [...prev];
      const [movedSkill] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, movedSkill);
      return next;
    });
  };

  const applyWorkflowTemplate = (template: WorkflowTemplate) => {
    const { matchedSkills, missingSteps, modes } = resolveWorkflowTemplateSkills(template, workflowSkillOptions);

    setSelectedWorkflowTemplateId(template.id);
    setNewWorkflowName((current) => current.trim() ? current : template.defaultWorkflowName);
    setNewWorkflowDesc((current) => current.trim() ? current : template.defaultWorkflowDescription);
    setSelectedSkills(matchedSkills);
    setSelectedSkillModes(modes);
    resetSelectedSkillDrag();

    if (missingSteps.length > 0) {
      toast.warning('模板未完全匹配', {
        description: `缺少 ${missingSteps.map((step) => step.label).join('、')}，可导入后再应用模板。`,
      });
    } else {
      toast.success('已应用模板', { description: '已自动填充 Skill 顺序和串并行编排。' });
    }
  };

  const handleAppendSkillToWorkflow = (workflowId: string, skill: Skill) => {
    updateWorkflowById(workflowId, (workflow) => {
      const updatedAt = new Date().toISOString();

      return normalizeWorkflowExecutionPlan({
        ...workflow,
        steps: [
          ...workflow.steps,
          {
            id: `step-${Date.now()}-${skill.id}`,
            name: skill.name,
            skill_id: skill.id,
            step_index: workflow.steps.length,
            runMode: 'serial',
            status: 'pending',
            output: null,
            created_at: updatedAt,
            updated_at: updatedAt,
          },
        ],
        updated_at: updatedAt,
      }, updatedAt);
    });
  };

  const handleGenerateDemoHandoff = async () => {
    const workflow = activeWorkflow;
    const step = workflow ? getVisibleSteps(workflow)[activeStepIndex] || getVisibleSteps(workflow)[0] : undefined;
    if (!workflow || !step || demoHandoffLoadingByStepId[step.id]) return;

    const existingHandoff = getStepDemoHandoff(workflow, step.id);
    if (existingHandoff?.studioUrl) return;

    const hasVerifiedOutput = Boolean(
      step.status === 'completed'
      && step.output?.trim()
      && (!step.validationStatus || step.validationStatus === 'passed'),
    );
    if (!hasVerifiedOutput) {
      toast.error('当前节点还不能生成 Demo');
      return;
    }

    setDemoHandoffLoadingByStepId((prev) => ({ ...prev, [step.id]: true }));

    try {
      const response = await fetch('/api/demos/handoffs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workflowId: workflow.id,
          stepId: step.id,
        }),
      });
      const data = await response.json() as {
        error?: string;
        workflow?: Workflow;
        handoff?: WorkflowDemoHandoff;
        reused?: boolean;
      };

      if (!response.ok) {
        throw new Error(data.error || 'Demo generation failed');
      }

      const savedWorkflow = data.workflow;
      if (savedWorkflow?.id) {
        setWorkflows((prev) => prev.map((item) => (
          item.id === savedWorkflow.id ? savedWorkflow : item
        )));
        setActiveWorkflow((prev) => (prev?.id === savedWorkflow.id ? savedWorkflow : prev));
      }

      toast.success(data.reused ? '已找到 Demo' : 'Demo 生成成功', {
        description: data.handoff?.studioUrl ? '可打开查看。' : undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Demo 生成失败';
      toast.error('Demo 生成失败', { description: message });
    } finally {
      setDemoHandoffLoadingByStepId((prev) => {
        const next = { ...prev };
        delete next[step.id];
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        正在加载工作流数据...
      </div>
    );
  }

  // If no active workflow, show workflow list
  if (!activeWorkflow) {
    const openedWorkspace = workspaces.find((workspace) => workspace.id === workspaceSpaceId) || null;
    const activeWorkspace = openedWorkspace
      || workspaces.find((workspace) => workspace.id === activeWorkspaceId)
      || null;
    const workspaceWorkflows = openedWorkspace
      ? workflows.filter((workflow) => workflow.workspaceId === openedWorkspace.id)
      : [];
    const editingWorkflow = editingWorkflowId
      ? workflows.find((workflow) => workflow.id === editingWorkflowId) || null
      : null;
    const inProgressWorkflowCount = workspaceWorkflows.filter((workflow) => workflow.status === 'in_progress').length;
    const completedWorkflowCount = workspaceWorkflows.filter((workflow) => workflow.status === 'completed').length;
    const totalEnabledStepCount = workspaceWorkflows.reduce((total, workflow) => total + getVisibleSteps(workflow).length, 0);
    const openWorkspaceSpace = (workspaceId: string) => {
      setActiveWorkspaceId(workspaceId);
      setWorkspaceSpaceId(workspaceId);
      setEditingWorkflowId(null);
    };
    const renderWorkflowCard = (wf: Workflow) => {
      const visibleSteps = getVisibleSteps(wf);
      const removedStepCount = wf.steps.filter((step) => step.isRemoved).length;
      const completedStepCount = visibleSteps.filter((step) => step.status === 'completed').length;
      const compactSteps = visibleSteps.length > 5
        ? visibleSteps.slice(0, 3)
        : visibleSteps;
      const trailingStep = visibleSteps.length > 5 ? visibleSteps[visibleSteps.length - 1] : null;
      const hiddenStepCount = visibleSteps.length - compactSteps.length - (trailingStep ? 1 : 0);
      const progressItems = trailingStep ? [...compactSteps, trailingStep] : compactSteps;

      return (
        <Card
          key={wf.id}
          className={`flex min-h-48 min-w-0 flex-col gap-0 overflow-hidden py-0 ${appCardClassName}`}
        >
          <CardHeader className="flex min-w-0 flex-col gap-2 px-4 pb-2 pt-4">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <CardTitle className="line-clamp-2 text-base leading-snug">{wf.name}</CardTitle>
                <p className="mt-1.5 line-clamp-2 min-h-8 text-sm text-muted-foreground">
                  {wf.description || '未填写工作流说明'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <StatusBadge
                  tone={wf.status === 'completed' ? 'success' : wf.status === 'in_progress' ? 'brand' : 'neutral'}
                >
                  {wf.status === 'completed' ? '已完成' : wf.status === 'in_progress' ? '进行中' : '草稿'}
                </StatusBadge>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Button
                variant="outline"
                size="sm"
                className="h-8 min-w-0 gap-1 px-2 text-xs"
                onClick={(event) => {
                  event.stopPropagation();
                  openWorkflow(wf);
                }}
              >
                <Play className="h-3.5 w-3.5" />
                进入
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 min-w-0 gap-1 px-2 text-xs"
                onClick={(event) => {
                  event.stopPropagation();
                  handleOpenEditWorkflow(wf);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                编辑
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 min-w-0 gap-1 px-2 text-xs"
                onClick={(event) => {
                  event.stopPropagation();
                  handleCloneWorkflow(wf);
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                克隆
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 min-w-0 gap-1 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={(event) => {
                  event.stopPropagation();
                  setDeleteTarget({
                    type: 'workflow',
                    id: wf.id,
                    name: wf.name,
                    workspaceId: wf.workspaceId,
                  });
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除
              </Button>
            </div>
          </CardHeader>
          <CardContent className="mt-auto min-w-0 overflow-hidden px-4 pb-4">
            <div className="flex max-w-full flex-nowrap items-center overflow-hidden">
              {progressItems.map((step, idx) => (
                <div key={step.id} className="flex shrink-0 items-center">
                  {idx === compactSteps.length && hiddenStepCount > 0 && (
                    <>
                      <ArrowRight className="mx-1 h-3 w-3 shrink-0 text-muted-foreground" />
                      <Badge variant="outline" className="h-5 px-1.5 text-[11px]">
                        +{hiddenStepCount}
                      </Badge>
                    </>
                  )}
                  {(idx > 0 || (idx === compactSteps.length && hiddenStepCount > 0)) && (
                    <ArrowRight className="mx-1 h-3 w-3 shrink-0 text-muted-foreground" />
                  )}
                  {getStepIcon(step.status)}
                </div>
              ))}
            </div>
            <p className="mt-2 truncate text-xs text-muted-foreground">
              {completedStepCount}/{visibleSteps.length}
              {removedStepCount > 0 && (
                <span className="ml-2">已移除 {removedStepCount} 个</span>
              )}
            </p>
          </CardContent>
        </Card>
      );
    };

    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader
          title={openedWorkspace ? openedWorkspace.name : '工作空间'}
          description={openedWorkspace
            ? getWorkspaceDescriptionText(openedWorkspace.description) || '管理该空间下的工作流编排和运行产物。'
            : '管理工作空间和工作流编排。'}
          action={(
            openedWorkspace ? (
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <Button
                  variant="outline"
                  className="w-full gap-2 sm:w-auto"
                  onClick={() => {
                    setWorkspaceSpaceId('');
                    setEditingWorkflowId(null);
                  }}
                >
                  <ArrowLeft className="h-4 w-4" />
                  所有空间
                </Button>
                <Button className="w-full gap-2 sm:w-auto" onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                  新建工作流
                </Button>
              </div>
            ) : (
              <Button variant="outline" className="w-full gap-2 sm:w-auto" onClick={handleOpenCreateWorkspace}>
                <Plus className="h-4 w-4" />
                新建空间
              </Button>
            )
          )}
        />

        {!openedWorkspace ? (
          <div className="min-h-0 flex-1 overflow-auto px-4 py-3 md:px-5 md:py-4">
            <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-3">
              <div className="flex justify-end border-b border-border/40 pb-2">
                <StatusBadge tone="neutral" className="w-fit text-xs">
                  共 {workspaces.length} 个空间
                </StatusBadge>
              </div>

              {workspaces.length === 0 ? (
                <ProductEmptyState
                  icon={<Plus />}
                  title="暂无工作空间"
                  description="先创建一个空间，用来承载同一阶段或同一产品线下的工作流。"
                  className="min-h-80"
                  action={(
                    <Button size="sm" className="gap-1.5" onClick={handleOpenCreateWorkspace}>
                      <Plus className="h-3.5 w-3.5" />
                      新建空间
                    </Button>
                  )}
                />
              ) : (
                <div className="max-h-[calc(100dvh-260px)] min-h-0 overflow-y-auto pr-2">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {workspaces.map((workspace) => {
                      const workspaceDescription = getWorkspaceDescriptionText(workspace.description);
                      const workspaceWorkflowList = workflows.filter((workflow) => workflow.workspaceId === workspace.id);
                      const count = workspaceWorkflowList.length;
                      const inProgressCount = workspaceWorkflowList.filter((workflow) => workflow.status === 'in_progress').length;
                      const completedCount = workspaceWorkflowList.filter((workflow) => workflow.status === 'completed').length;
                      const latestUpdatedAt = [workspace.updated_at, ...workspaceWorkflowList.map((workflow) => workflow.updated_at)]
                        .filter(Boolean)
                        .sort((a, b) => String(b).localeCompare(String(a)))[0];

                      return (
                        <Card
                          key={workspace.id}
                          className={`min-w-0 gap-0 overflow-hidden py-0 ${appCardClassName}`}
                        >
                          <CardContent className="flex h-full flex-col gap-3 p-3.5">
                            <div className="flex min-w-0 items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h3 className="truncate text-base font-semibold">{workspace.name}</h3>
                                {workspaceDescription && (
                                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                    {workspaceDescription}
                                  </p>
                                )}
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5">
                                <StatusBadge tone="neutral" className="text-xs">
                                  {count} 个流程
                                </StatusBadge>
                              </div>
                            </div>

                            <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-border/50 bg-muted/20 text-center text-xs">
                              <div className="min-w-0 border-r border-border/50 px-2 py-1.5">
                                <p className="font-semibold">{count}</p>
                                <p className="mt-0.5 text-muted-foreground">全部</p>
                              </div>
                              <div className="min-w-0 border-r border-border/50 px-2 py-1.5">
                                <p className="font-semibold text-primary">{inProgressCount}</p>
                                <p className="mt-0.5 text-muted-foreground">进行中</p>
                              </div>
                              <div className="min-w-0 px-2 py-1.5">
                                <p className="font-semibold text-emerald-500">{completedCount}</p>
                                <p className="mt-0.5 text-muted-foreground">已完成</p>
                              </div>
                            </div>

                            <div className="mt-auto flex flex-col gap-2">
                              <p className="truncate text-xs text-muted-foreground">
                                最近更新：{formatSnapshotTime(latestUpdatedAt)}
                              </p>
                              <div className="grid grid-cols-3 gap-2">
                                <Button
                                  size="sm"
                                  className="h-8 min-w-0 gap-1.5 px-2 text-xs"
                                  onClick={() => openWorkspaceSpace(workspace.id)}
                                >
                                  进入空间
                                  <ArrowRight className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 min-w-0 gap-1.5 px-2 text-xs"
                                  onClick={() => handleOpenEditWorkspace(workspace)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  编辑
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 min-w-0 gap-1.5 px-2 text-xs text-destructive hover:text-destructive"
                                  onClick={() => setDeleteTarget({
                                    type: 'workspace',
                                    id: workspace.id,
                                    name: workspace.name,
                                    workflowCount: count,
                                  })}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  删除
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto px-4 py-3 md:px-5 md:py-4">
            <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-3">
              <div className="flex justify-end border-b border-border/40 pb-2">
                <StatusBadge tone="brand" className="w-fit text-xs">
                  {workspaceWorkflows.length} 个工作流
                </StatusBadge>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Card className={`gap-0 py-0 ${appCardClassName}`}>
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">全部工作流</p>
                    <p className="mt-1 text-xl font-semibold">{workspaceWorkflows.length}</p>
                  </CardContent>
                </Card>
                <Card className={`gap-0 py-0 ${appCardClassName}`}>
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">进行中</p>
                    <p className="mt-1 text-xl font-semibold text-primary">{inProgressWorkflowCount}</p>
                  </CardContent>
                </Card>
                <Card className={`gap-0 py-0 ${appCardClassName}`}>
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">已完成</p>
                    <p className="mt-1 text-xl font-semibold text-emerald-500">{completedWorkflowCount}</p>
                  </CardContent>
                </Card>
                <Card className={`gap-0 py-0 ${appCardClassName}`}>
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">启用步骤</p>
                    <p className="mt-1 text-xl font-semibold">{totalEnabledStepCount}</p>
                  </CardContent>
                </Card>
              </div>

              {workspaceWorkflows.length === 0 ? (
                <ProductEmptyState
                  icon={<Play />}
                  title="当前空间暂无工作流"
                  description="创建一个工作流，选择至少三个 Skill，开始串行或并行推进产品规划。"
                  className="min-h-80"
                  action={(
                    <Button className="gap-2" onClick={() => setCreateDialogOpen(true)}>
                      <Plus className="h-4 w-4" />
                      新建工作流
                    </Button>
                  )}
                />
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {workspaceWorkflows.map((workflow) => renderWorkflowCard(workflow))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Create Workflow Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0">
            <DialogHeader className="border-b border-border/40 px-6 py-5 pr-12">
              <DialogTitle>新建工作流</DialogTitle>
              <DialogDescription>选择 Skill 并配置串行或并行执行方式</DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-4">
                <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">创建位置</p>
                  <p className="text-sm font-medium mt-1">{activeWorkspace?.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{activeWorkspace?.description}</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-sm font-medium">内置模板</label>
                    {selectedWorkflowTemplateId && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setSelectedWorkflowTemplateId('')}
                      >
                        取消模板标记
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {builtInWorkflowTemplates.map((template) => {
                      const { matchedSkills, missingSteps } = resolveWorkflowTemplateSkills(template, workflowSkillOptions);
                      const isSelectedTemplate = selectedWorkflowTemplateId === template.id;
                      return (
                        <button
                          key={template.id}
                          type="button"
                          className={cn(
                            'rounded-lg border p-3 text-left transition-colors',
                            isSelectedTemplate
                              ? 'border-primary bg-primary/5'
                              : 'border-border/60 bg-card hover:border-primary/50 hover:bg-muted/30',
                          )}
                          onClick={() => applyWorkflowTemplate(template)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold">{template.name}</p>
                              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{template.description}</p>
                            </div>
                            <Badge
                              variant={missingSteps.length === 0 ? 'secondary' : 'outline'}
                              className="shrink-0"
                            >
                              {matchedSkills.length}/{template.steps.length}
                            </Badge>
                          </div>
                          {missingSteps.length > 0 && (
                            <p className="mt-2 line-clamp-1 text-xs text-muted-foreground">
                              缺少：{missingSteps.map((step) => step.label).join('、')}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">工作流名称</label>
                  <Input
                    placeholder="如：电商平台 v3.0 规划"
                    value={newWorkflowName}
                    onChange={(e) => setNewWorkflowName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">描述</label>
                  <Input
                    placeholder="简要描述本次规划的目标"
                    value={newWorkflowDesc}
                    onChange={(e) => setNewWorkflowDesc(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">选择 Skill（按顺序点击添加）</label>
                  {workflowSkillOptions.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
                      暂无可用 Skill，请先到 Skill 仓库导入或发布 Skill。
                    </div>
                  ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {workflowSkillOptions.map((skill) => {
                      const isSelected = selectedSkills.find((s) => s.id === skill.id);
                      const orderIndex = isSelected ? selectedSkills.findIndex((s) => s.id === skill.id) : -1;
                      return (
                        <button
                          key={skill.id}
                          type="button"
                          className={`p-3 rounded-lg border text-left transition-colors ${
                            isSelected ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-primary/50'
                          }`}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedSkills((prev) => prev.filter((s) => s.id !== skill.id));
                              setSelectedSkillModes((prev) => {
                                const next = { ...prev };
                                delete next[skill.id];
                                return next;
                              });
                            } else {
                              setSelectedSkills((prev) => [...prev, skill]);
                              setSelectedSkillModes((prev) => ({ ...prev, [skill.id]: 'serial' }));
                            }
                          }}
                        >
                          <div className="flex items-center gap-2">
                            {isSelected && (
                              <Badge variant="default" className="h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs">
                                {orderIndex + 1}
                              </Badge>
                            )}
                            <span className="text-sm font-medium">{skill.name}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{skill.description}</p>
                        </button>
                      );
                    })}
                  </div>
                  )}
                </div>
                {selectedSkills.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-sm font-medium">编排方式</label>
                      <span className="text-xs text-muted-foreground">拖拽调整顺序</span>
                    </div>
                    <div className="space-y-2">
                      {selectedSkills.map((skill, idx) => (
                        <div
                          key={skill.id}
                          data-selected-skill-id={skill.id}
                          draggable
                          aria-grabbed={draggingSelectedSkillId === skill.id}
                          onDragStart={(event) => {
                            setDraggingSelectedSkillId(skill.id);
                            setDragOverSelectedSkillId(skill.id);
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData('text/plain', skill.id);
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'move';
                            if (dragOverSelectedSkillId !== skill.id) {
                              setDragOverSelectedSkillId(skill.id);
                            }
                          }}
                          onDragEnter={() => {
                            if (!draggingSelectedSkillId || draggingSelectedSkillId === skill.id) return;
                            handleReorderSelectedSkill(draggingSelectedSkillId, skill.id);
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            const sourceSkillId = draggingSelectedSkillId || event.dataTransfer.getData('text/plain');
                            handleReorderSelectedSkill(sourceSkillId, skill.id);
                            resetSelectedSkillDrag();
                          }}
                          onDragEnd={resetSelectedSkillDrag}
                          className={cn(
                            'flex cursor-grab items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/20 p-2 transition-colors active:cursor-grabbing',
                            draggingSelectedSkillId === skill.id && 'opacity-50',
                            dragOverSelectedSkillId === skill.id && draggingSelectedSkillId !== skill.id
                              && 'border-primary/60 bg-primary/10 ring-1 ring-primary/25',
                          )}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <GripVertical className="size-4 shrink-0 text-muted-foreground" />
                            <Badge variant="secondary" className="h-6 w-6 rounded-full p-0 flex items-center justify-center text-xs">
                              {idx + 1}
                            </Badge>
                            <span className="truncate text-sm font-medium">{skill.name}</span>
                          </div>
                          <div className="flex items-center rounded-md border border-border/50 p-0.5">
                            <Button
                              type="button"
                              variant={(selectedSkillModes[skill.id] || 'serial') === 'serial' ? 'default' : 'ghost'}
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => setSelectedSkillModes((prev) => ({ ...prev, [skill.id]: 'serial' }))}
                            >
                              串行
                            </Button>
                            <Button
                              type="button"
                              variant={(selectedSkillModes[skill.id] || 'serial') === 'parallel' ? 'default' : 'ghost'}
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => setSelectedSkillModes((prev) => ({ ...prev, [skill.id]: 'parallel' }))}
                            >
                              并行
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      连续标记为并行的 Skill 会组成同一个并行任务组，可分别推进；后续串行步骤会等待该并行组汇聚后继续。M2 验收要求至少选择 3 个 Skill。
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="border-t border-border/40 bg-background px-6 py-4">
              <Button
                className="w-full"
                disabled={!activeWorkspace || !newWorkflowName.trim() || selectedSkills.length < 3}
                onClick={handleCreateWorkflow}
              >
                {selectedSkills.length < 3 ? `还需选择 ${3 - selectedSkills.length} 个 Skill` : '创建工作流'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Workspace Dialog */}
        <Dialog open={workspaceDialogOpen} onOpenChange={handleWorkspaceDialogOpenChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingWorkspaceId ? '编辑工作空间' : '新建工作空间'}</DialogTitle>
              <DialogDescription>
                {editingWorkspaceId ? '更新空间名称和说明，不影响空间内已有工作流。' : '工作流必须创建在某个工作空间内，便于按项目归档。'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">空间名称</label>
                <Input
                  placeholder="如：搜索体验优化专项"
                  value={newWorkspaceName}
                  onChange={(event) => setNewWorkspaceName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">空间说明</label>
                <Input
                  placeholder="简要说明空间对应的项目范围"
                  value={newWorkspaceDesc}
                  onChange={(event) => setNewWorkspaceDesc(event.target.value)}
                />
              </div>
              <Button className="w-full" disabled={!newWorkspaceName.trim()} onClick={handleSaveWorkspace}>
                {editingWorkspaceId ? '保存空间' : '创建空间'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Workflow Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
            <DialogHeader className="border-b border-border/40 px-6 py-5 pr-12">
              <DialogTitle>编辑工作流</DialogTitle>
              <DialogDescription>
                已有人执行过的步骤会软删除保留，可随时原样恢复，不破坏历史产物。
              </DialogDescription>
            </DialogHeader>

            {editingWorkflow && (
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
                <div>
                  <h3 className="text-sm font-medium">{editingWorkflow.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{editingWorkflow.description}</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">当前流程步骤</label>
                    <Badge variant="outline" className="text-xs">
                      {getVisibleSteps(editingWorkflow).length} 个启用
                    </Badge>
                  </div>
                  <div data-testid="workflow-step-sort-list" className="flex flex-col gap-2">
                    {getVisibleSteps(editingWorkflow).map((step, idx) => (
                      <div
                        key={step.id}
                        data-workflow-step-id={step.id}
                        draggable
                        aria-grabbed={draggingWorkflowStepId === step.id}
                        onPointerDown={(event) => handleWorkflowStepPointerDown(event, step.id)}
                        onPointerMove={(event) => handleWorkflowStepPointerMove(event, editingWorkflow.id)}
                        onPointerUp={resetWorkflowStepDrag}
                        onPointerCancel={resetWorkflowStepDrag}
                        onMouseDown={(event) => handleWorkflowStepMouseDown(event, step.id)}
                        onMouseEnter={() => {
                          if (!draggingWorkflowStepId || draggingWorkflowStepId === step.id) return;
                          setDragOverWorkflowStepId(step.id);
                          handleReorderWorkflowStep(editingWorkflow.id, draggingWorkflowStepId, step.id);
                        }}
                        onDragStart={(event) => handleWorkflowStepDragStart(event, step.id)}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = 'move';
                          if (dragOverWorkflowStepId !== step.id) {
                            setDragOverWorkflowStepId(step.id);
                          }
                        }}
                        onDragLeave={() => {
                          if (dragOverWorkflowStepId === step.id) {
                            setDragOverWorkflowStepId(null);
                          }
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const sourceStepId = draggingWorkflowStepId || event.dataTransfer.getData('text/plain');
                          handleReorderWorkflowStep(editingWorkflow.id, sourceStepId, step.id);
                          resetWorkflowStepDrag();
                        }}
                        onDragEnd={resetWorkflowStepDrag}
                        className={cn(
                          'flex cursor-grab items-center gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 transition-colors active:cursor-grabbing',
                          draggingWorkflowStepId === step.id && 'opacity-50',
                          dragOverWorkflowStepId === step.id && draggingWorkflowStepId !== step.id
                            && 'border-primary/60 bg-primary/10 ring-1 ring-primary/30',
                        )}
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          data-drag-handle="true"
                          aria-label={`拖动 ${step.name} 调整顺序`}
                          className="cursor-grab text-muted-foreground active:cursor-grabbing"
                        >
                          <GripVertical data-icon="inline-start" />
                        </Button>
                        <Badge variant="secondary" className="h-6 w-6 rounded-full p-0 flex items-center justify-center text-xs">
                          {idx + 1}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium">{step.name}</p>
                            {step.output && <Badge variant="outline" className="text-[10px]">已有产物</Badge>}
                            {step.runMode === 'parallel' && <Badge variant="secondary" className="text-[10px]">并行</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {getStepStatusLabel(step.status)}
                          </p>
                        </div>
                        <div className="flex items-center rounded-md border border-border/50 p-0.5">
                          <Button
                            type="button"
                            variant={(step.runMode || 'serial') === 'serial' ? 'default' : 'ghost'}
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => handleUpdateStepRunMode(editingWorkflow.id, step.id, 'serial')}
                          >
                            串行
                          </Button>
                          <Button
                            type="button"
                            variant={(step.runMode || 'serial') === 'parallel' ? 'default' : 'ghost'}
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => handleUpdateStepRunMode(editingWorkflow.id, step.id, 'parallel')}
                          >
                            并行
                          </Button>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 text-xs"
                          onClick={() => handleSoftRemoveStep(editingWorkflow.id, step.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          移除
                        </Button>
                      </div>
                    ))}
                    {getVisibleSteps(editingWorkflow).length === 0 && (
                      <p className="rounded-lg border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
                        当前没有启用步骤，可从已移除步骤恢复或追加 Skill。
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">已移除步骤</label>
                    <Badge variant="outline" className="text-xs">
                      {editingWorkflow.steps.filter((step) => step.isRemoved).length} 个可恢复
                    </Badge>
                  </div>
                  {editingWorkflow.steps.some((step) => step.isRemoved) ? (
                    <div className="space-y-2">
                      {editingWorkflow.steps.filter((step) => step.isRemoved).map((step) => (
                        <div
                          key={step.id}
                          className="flex items-center gap-3 rounded-lg border border-border/40 bg-background/40 p-3 opacity-80"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{step.name}</p>
                            <p className="text-xs text-muted-foreground">
                              原步骤保留产物与状态，可原样加回
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 text-xs"
                            onClick={() => handleRestoreStep(editingWorkflow.id, step.id)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            恢复
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
                      暂无移除步骤。
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">追加 Skill</label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {workflowSkillOptions.map((skill) => (
                      <div
                        key={skill.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border/60 p-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{skill.name}</p>
                          <p className="line-clamp-1 text-xs text-muted-foreground">{skill.description}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 shrink-0 gap-1.5 text-xs"
                          onClick={() => handleAppendSkillToWorkflow(editingWorkflow.id, skill)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          添加
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={Boolean(deleteTarget)}
          onOpenChange={(open) => {
            if (!open && !isDeletingTarget) setDeleteTarget(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {deleteTarget?.type === 'workspace' ? '删除工作空间' : '删除工作流'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget?.type === 'workspace' ? (
                  <>
                    将删除「{deleteTarget.name}」空间
                    {deleteTarget.workflowCount > 0 ? `，并同时删除其中 ${deleteTarget.workflowCount} 个工作流` : ''}
                    。该操作会移除相关步骤、对话记录和产物，删除后不可恢复。
                  </>
                ) : (
                  <>
                    将删除「{deleteTarget?.name}」工作流。该操作会移除相关步骤、对话记录和产物，删除后不可恢复。
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeletingTarget}>取消</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={isDeletingTarget}
                onClick={(event) => {
                  event.preventDefault();
                  void handleConfirmDeleteTarget();
                }}
              >
                {isDeletingTarget ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    删除中
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    确认删除
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // Active workflow view - Pipeline + Chat
  const visibleWorkflowSteps = getVisibleSteps(activeWorkflow);
  const currentStep = visibleWorkflowSteps[activeStepIndex] || visibleWorkflowSteps[0];
  const isStreaming = currentStep ? Boolean(streamingByStepId[currentStep.id]) : false;
  const currentStepDemoHandoff = currentStep ? getStepDemoHandoff(activeWorkflow, currentStep.id) : undefined;
  const currentStepDemoLoading = currentStep ? Boolean(demoHandoffLoadingByStepId[currentStep.id]) : false;
  const currentStepHasVerifiedOutput = Boolean(
    currentStep?.status === 'completed'
    && currentStep.output?.trim()
    && (!currentStep.validationStatus || currentStep.validationStatus === 'passed'),
  );
  const canGenerateCurrentStepDemo = Boolean(
    currentStep
    && currentStepHasVerifiedOutput
    && !currentStepDemoHandoff?.studioUrl
    && !currentStepDemoLoading,
  );
  const currentStepDemoHint = (() => {
    if (currentStepDemoHandoff?.studioUrl) {
      return `${getDemoHandoffStatusLabel(currentStepDemoHandoff.status)} · ${currentStepDemoHandoff.title || currentStep.name}`;
    }
    if (currentStepDemoLoading) return '正在提交当前节点产物';
    if (!currentStep) return '未选择节点';
    if (currentStep.status !== 'completed') return '节点通过验证后可生成 Demo';
    if (currentStep.validationStatus && currentStep.validationStatus !== 'passed') return '验证通过后可生成 Demo';
    if (!currentStep.output?.trim()) return '当前节点暂无产物';
    return '当前节点产物可生成 Demo';
  })();
  const lastAssistantMessageIndex = chatMessages.reduce(
    (latestIndex, message, index) => (message.role === 'assistant' ? index : latestIndex),
    -1,
  );
  const currentSkill = getEffectiveSkillForStep(activeWorkflow, currentStep);
  const previousSteps = currentStep
    ? getPriorWorkflowSteps(activeWorkflow, currentStep).filter((step) => step.output)
    : [];
  const currentContextSelection = currentStep
    ? getContextSelection(activeWorkflow, currentStep.id)
    : defaultContextSelection;
  const disabledAutoInjectedStepIds = currentContextSelection.disabledAutoInjectedStepIds || [];
  const autoInjectedPreviousSteps = previousSteps.filter((step) => !disabledAutoInjectedStepIds.includes(step.id));
  const autoInjectedPreviousStepIds = new Set(autoInjectedPreviousSteps.map((step) => step.id));
  const disabledAutoInjectedPreviousSteps = previousSteps.filter((step) => disabledAutoInjectedStepIds.includes(step.id));
  const reviewMaterials: ReviewMaterial[] = visibleWorkflowSteps
    .filter((step) => step.status === 'completed' && step.output)
    .map((step) => ({
      id: step.id,
      name: `${step.name}产物`,
      source: activeWorkflow.name,
      summary: compactMarkdownPreview(step.output || '', 120),
    }))
    .concat(
      reviewedOutputFiles.map((file) => ({
        id: file.id,
        name: `${file.name}（已审核）`,
        source: '本地上传审核产物',
        summary: `${file.name}，${file.type || 'unknown'}，${formatFileSize(file.size)}`,
      }))
    );
  const currentExecutionGroup = currentStep
    ? getWorkflowExecutionGroups(visibleWorkflowSteps).find((group) => (
      group.steps.some((step) => step.id === currentStep.id)
    ))
    : undefined;
  const parallelPeerSteps = currentExecutionGroup?.runMode === 'parallel'
    ? currentExecutionGroup.steps.filter((step) => step.id !== currentStep?.id && step.output)
    : [];
  const currentReviewedOutputFiles = currentStep
    ? reviewedOutputFiles.filter((file) => file.stepId === currentStep.id)
    : [];
  const currentContextFiles = currentStep
    ? uploadedContextFiles.filter((file) => file.stepId === currentStep.id)
    : [];
  const selectedKnowledgeBaseOptions = knowledgeBases.filter((kb) => selectedKnowledgeBaseIds.includes(kb.id));
  const unavailableKnowledgeBaseCount = selectedKnowledgeBaseIds.filter((id) => (
    !knowledgeBases.some((kb) => kb.id === id)
  )).length;
  const selectedReviewMaterialOptions = reviewMaterials.filter((material) => (
    selectedReviewMaterialIds.includes(material.id) && !autoInjectedPreviousStepIds.has(material.id)
  ));
  const additionalReviewMaterials = reviewMaterials.filter((material) => (
    !previousSteps.some((step) => step.id === material.id)
  ));
  const selectedContextCount = (
    autoInjectedPreviousSteps.length
    + selectedKnowledgeBaseOptions.length
    + selectedReviewMaterialOptions.length
    + currentContextFiles.length
  );
  const savedCurrentStepOutput = currentStep
    ? currentReviewedOutputFiles.find((file) => file.id === getSavedStepOutputFileId(currentStep.id))
    : undefined;
  const currentStepOutputMarkdown = currentStep?.output
    ? buildStepOutputMarkdown(activeWorkflow, currentStep)
    : '';
  const currentValidationAttempts = currentStep
    ? (activeWorkflow.validationAttempts || [])
      .filter((attempt) => attempt.stepId === currentStep.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
    : [];
  const currentValidationAttempt = currentStep?.validationAttemptId
    ? currentValidationAttempts.find((attempt) => attempt.id === currentStep.validationAttemptId) || currentValidationAttempts[0]
    : currentValidationAttempts[0];
  const currentCandidateSnapshot = currentValidationAttempt?.artifactSnapshotId
    ? (activeWorkflow.stepSnapshots || []).find((snapshot) => snapshot.id === currentValidationAttempt.artifactSnapshotId)
    : currentStep?.candidateSnapshotId
      ? (activeWorkflow.stepSnapshots || []).find((snapshot) => snapshot.id === currentStep.candidateSnapshotId)
      : undefined;
  const currentValidationCandidate = currentStep?.candidateOutput || currentCandidateSnapshot?.output || '';
  const currentSkillCriteria = [
    ...(currentSkill?.acceptanceCriteria || []),
    ...(currentSkill?.requiredSections || []).map((section) => `产物必须包含「${section}」章节。`),
    ...(currentSkill?.evidenceRules || []),
    ...(currentSkill?.failureConditions || []).map((condition) => `若出现以下情况必须判定为未通过：${condition}`),
    ...(currentSkill?.checklist || []),
  ];
  const currentValidationCriteria = currentValidationAttempt?.criteria?.length
    ? currentValidationAttempt.criteria
    : currentSkillCriteria;
  const currentValidationFindings = [
    ...(currentValidationAttempt?.selfCheck?.findings || []),
    ...(currentValidationAttempt?.agentValidation?.findings || []),
  ];
  const currentBlockingFindings = currentValidationFindings.filter((finding) => finding.severity === 'blocking');
  const currentGateBlocked = Boolean(
    currentStep?.status === 'validation_failed'
      || currentValidationAttempt?.status === 'failed'
      || currentValidationAttempt?.status === 'error',
  );
  const savedCurrentStepOutputIsCurrent = Boolean(
    savedCurrentStepOutput?.content && savedCurrentStepOutput.content === currentStepOutputMarkdown,
  );
  const maxVisibleStepIndex = visibleWorkflowSteps.length > 0
    ? Math.max(...visibleWorkflowSteps.map((step) => step.step_index))
    : -1;
  const isWorkflowFullyCompleted = visibleWorkflowSteps.length > 0
    && visibleWorkflowSteps.every((step) => step.status === 'completed');
  const finalWorkflowOutputSteps = isWorkflowFullyCompleted
    ? visibleWorkflowSteps
      .filter((step) => step.step_index === maxVisibleStepIndex && step.output)
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    : [];
  const currentReviewComment = currentStep ? reviewComments[currentStep.id]?.trim() || '' : '';
  const canArchiveReviewedOutput = currentReviewedOutputFiles.length > 0 || currentReviewComment.length > 0;
  const isReviewedOutputArchived = currentStep ? archivedReviewStepIds.includes(currentStep.id) : false;
  const currentStepChatPersistenceStatus = currentStep
    ? chatPersistenceByStepId[currentStep.id] || 'idle'
    : 'idle';
  const currentStepValidationStage = currentStep ? validationStageByStepId[currentStep.id] : undefined;
  const currentStepIsConfirming = Boolean(currentStep && confirmingStepId === currentStep.id);
  const currentStepEffectiveStatus = currentStepValidationStage || currentStep?.status;
  const currentStepHasConfirmableOutput = Boolean(
    currentStep && isStepConfirmableStatus(currentStep.status) && hasConfirmableAssistantMessage(chatMessages),
  );
  const currentStepCanConfirm = Boolean(
    currentStepHasConfirmableOutput
      && !isStreaming
      && !confirmingStepId
      && !currentStepValidationStage
      && currentStepChatPersistenceStatus === 'saved',
  );
  const currentStepConfirmHint = (() => {
    if (currentStepChatPersistenceStatus === 'saving') return '正在保存对话记录，保存完成后才能确认。';
    if (currentStepChatPersistenceStatus === 'failed') return '对话记录保存失败，请重新发送或刷新后再试。';
    if (isStreaming) return 'AI 正在生成，完成后会自动保存对话记录。';
    if (currentStepValidationStage === 'self_checking') return 'Skill 正在基于验收标准自检候选产物。';
    if (currentStepValidationStage === 'agent_validating') return '独立 Agent 正在校验候选产物。';
    if (currentStepIsConfirming) return '正在运行验证门禁。';
    if (currentStep?.status === 'validation_failed') {
      return currentStep.validationSummary
        ? `上次验证未通过：${currentStep.validationSummary}`
        : '上次验证未通过，修订后可重新验证。';
    }
    return 'AI 已产出并保存，可运行验证门禁。';
  })();
  const currentStepConfirmLabel = (() => {
    if (currentStepValidationStage === 'self_checking' || currentStepEffectiveStatus === 'self_checking') return 'Skill 自检中';
    if (currentStepValidationStage === 'agent_validating' || currentStepEffectiveStatus === 'agent_validating') return 'Agent 校验中';
    if (currentStep?.status === 'validation_failed') return '重新验证';
    return '运行验证';
  })();
  const renderValidationPhase = (label: string, phase?: WorkflowStepValidationPhase) => (
    <div className="rounded-lg border border-border/50 bg-background/60 p-3">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="truncate text-xs font-medium">{label}</p>
        <StatusBadge
          tone={phase?.outcome === 'pass' ? 'success' : phase ? 'warning' : 'neutral'}
          className="shrink-0 text-[11px]"
        >
          {getValidationOutcomeLabel(phase?.outcome)}
        </StatusBadge>
      </div>
      {phase?.summary ? (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{phase.summary}</p>
      ) : (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">暂无结果。</p>
      )}
      {phase?.findings && phase.findings.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {phase.findings.slice(0, 4).map((finding) => (
            <div key={finding.id} className="rounded-md border border-border/40 bg-muted/25 p-2">
              <div className="flex min-w-0 items-center gap-2">
                <StatusBadge tone={getFindingSeverityTone(finding.severity)} className="shrink-0 text-[10px]">
                  {getFindingSeverityLabel(finding.severity)}
                </StatusBadge>
                <p className="min-w-0 truncate text-[11px] text-muted-foreground">{finding.criterion || '未指定验收标准'}</p>
              </div>
              <p className="mt-1 text-xs leading-5">{finding.issue}</p>
              {finding.recommendation && (
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{finding.recommendation}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
  const updateCurrentContextSelection = (
    nextSelection: Partial<WorkflowContextSelection>,
    localStateUpdate?: () => void,
  ) => {
    if (!currentStep) return;

    localStateUpdate?.();
    const updatedAt = new Date().toISOString();
    updateActiveWorkflow((workflow) => {
      const currentSelection = getContextSelection(workflow, currentStep.id);
      return {
        ...workflow,
        contextSelections: {
          ...(workflow.contextSelections || {}),
          [currentStep.id]: {
            ...currentSelection,
            ...nextSelection,
            updated_at: updatedAt,
          },
        },
        updated_at: updatedAt,
      };
    });
  };
  const setAutoInjectedStepEnabled = (stepId: string, enabled: boolean) => {
    if (!currentStep) return;
    const disabledIds = new Set(disabledAutoInjectedStepIds);
    if (enabled) {
      disabledIds.delete(stepId);
    } else {
      disabledIds.add(stepId);
    }
    updateCurrentContextSelection({
      disabledAutoInjectedStepIds: Array.from(disabledIds),
    });
  };
  const removeContextFile = (fileId: string) => {
    const updatedAt = new Date().toISOString();
    setUploadedContextFiles((prev) => prev.filter((item) => item.id !== fileId));
    updateActiveWorkflow((workflow) => ({
      ...workflow,
      contextFiles: (workflow.contextFiles || []).filter((file) => file.id !== fileId),
      updated_at: updatedAt,
    }));
  };
  const removeReviewedOutputFile = (fileId: string) => {
    const updatedAt = new Date().toISOString();
    setReviewedOutputFiles((prev) => prev.filter((item) => item.id !== fileId));
    updateActiveWorkflow((workflow) => ({
      ...workflow,
      reviewedOutputFiles: (workflow.reviewedOutputFiles || []).filter((file) => file.id !== fileId),
      contextSelections: Object.fromEntries(
        Object.entries(workflow.contextSelections || {}).map(([stepId, selection]) => [
          stepId,
          {
            ...selection,
            reviewMaterialIds: selection.reviewMaterialIds.filter((id) => id !== fileId),
            updated_at: updatedAt,
          },
        ]),
      ),
      updated_at: updatedAt,
    }));
    setSelectedReviewMaterialIds((prev) => prev.filter((id) => id !== fileId));
  };
  const updateReviewComment = (stepId: string, comment: string) => {
    const updatedAt = new Date().toISOString();
    setReviewComments((prev) => ({ ...prev, [stepId]: comment }));
    updateActiveWorkflow((workflow) => ({
      ...workflow,
      reviewComments: {
        ...(workflow.reviewComments || {}),
        [stepId]: comment,
      },
      updated_at: updatedAt,
    }));
  };
  const archiveReviewedOutput = (stepId: string) => {
    const updatedAt = new Date().toISOString();
    setArchivedReviewStepIds((prev) => (prev.includes(stepId) ? prev : [...prev, stepId]));
    updateActiveWorkflow((workflow) => ({
      ...workflow,
      archivedReviewStepIds: (workflow.archivedReviewStepIds || []).includes(stepId)
        ? workflow.archivedReviewStepIds || []
        : [...(workflow.archivedReviewStepIds || []), stepId],
      updated_at: updatedAt,
    }));
  };
  const saveCurrentStepOutput = () => {
    if (!activeWorkflow || !currentStep?.output) return;

    const updatedAt = new Date().toISOString();
    const outputFile = buildSavedStepOutputFile(activeWorkflow, currentStep, updatedAt);

    setReviewedOutputFiles((prev) => [
      outputFile,
      ...prev.filter((file) => file.id !== outputFile.id),
    ]);
    updateActiveWorkflow((workflow) => ({
      ...workflow,
      reviewedOutputFiles: [
        outputFile,
        ...(workflow.reviewedOutputFiles || []).filter((file) => file.id !== outputFile.id),
      ],
      updated_at: updatedAt,
    }));
  };
  const workflowStepGroups = getWorkflowExecutionGroups(visibleWorkflowSteps);
  const toggleOutputExpanded = (stepId: string) => {
    setExpandedOutputIds((prev) => ({
      ...prev,
      [stepId]: !prev[stepId],
    }));
  };
  const renderStepOutputPreview = (step: WorkflowStep, options: { label?: string } = {}) => {
    const output = step.output || '';
    const isExpanded = Boolean(expandedOutputIds[step.id]);
    const outputMarkdownPreview = getRenderedMarkdownPreview(output);

    return (
      <Card key={step.id} className="mb-2 border-border/60 bg-card/75 shadow-none">
        <CardContent className="p-3">
          <div className="flex min-w-0 items-start gap-2">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="min-w-0 truncate text-xs font-semibold">{step.name}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {options.label || '已确认产物'} · {output.length.toLocaleString('zh-CN')} 字符
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {output && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      title="下载 Markdown"
                      onClick={() => downloadStepOutput(step.name, output)}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {output && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-1.5 text-[11px]"
                      onClick={() => toggleOutputExpanded(step.id)}
                    >
                      {isExpanded ? '收起' : '展开'}
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </Button>
                  )}
                </div>
              </div>
              {output ? (
                <>
                  {isExpanded && (
                    <div className="mt-3 max-h-72 min-w-0 overflow-y-auto rounded-lg border border-border/60 bg-background/80 p-3">
                      <CompactMarkdown
                        content={outputMarkdownPreview.content}
                        className="text-xs leading-5 [&_blockquote]:my-2 [&_h2]:text-sm [&_h3]:text-xs [&_li]:text-xs [&_p]:text-xs [&_table]:text-[11px]"
                      />
                      {outputMarkdownPreview.truncated && (
                        <p className="mt-3 rounded-md border border-border/60 bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
                          预览已省略 {outputMarkdownPreview.omittedChars.toLocaleString('zh-CN')} 字符，下载可获取完整 Markdown。
                        </p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <p className="mt-2 break-words text-xs text-muted-foreground">暂无产物。</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-auto lg:flex-row lg:overflow-hidden">
      {/* Left: Pipeline Panel */}
      <div className="flex max-h-80 min-h-0 w-full shrink-0 flex-col border-b border-border/40 lg:max-h-none lg:w-64 lg:border-b-0 lg:border-r xl:w-80">
        <div className="border-b border-border/40 p-4">
          <Button variant="ghost" size="sm" onClick={() => {
            setActiveWorkflow(null);
            setActiveStepIndex(-1);
            activeStepIdRef.current = null;
            setChatMessages([]);
            setChatInput('');
          }}>
            ← 返回列表
          </Button>
          <h2 className="mt-2 truncate font-semibold">{activeWorkflow.name}</h2>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{activeWorkflow.description}</p>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-3 p-4">
            {workflowStepGroups.map((group) => {
              const groupSteps = group.steps;
              const isParallelGroup = group.runMode === 'parallel' && groupSteps.length > 1;
              const groupCompletedCount = groupSteps.filter((step) => step.status === 'completed').length;

              return (
                <div
                  key={group.id}
                  className={isParallelGroup ? 'rounded-xl border border-border/50 bg-muted/20 p-2' : ''}
                >
                  {isParallelGroup && (
                    <div className="flex min-w-0 items-center justify-end gap-2 px-2 pb-2">
                      <Badge variant="outline" className="text-[11px]">
                        并行 {groupCompletedCount}/{groupSteps.length}
                      </Badge>
                    </div>
                  )}

                  <div className="flex flex-col gap-1">
                    {groupSteps.map((step) => {
                      const idx = visibleWorkflowSteps.findIndex((item) => item.id === step.id);
                      const isActive = idx === activeStepIndex;
                      const isDisabled = step.status === 'pending' && !isActive;
                      const stepIsStreaming = Boolean(streamingByStepId[step.id]);
                      const stepHasChatMessages = getStepChatMessages(activeWorkflow, step.id).length > 0;
                      const shouldRenderParallelStepAsIdle = Boolean(
                        step.runMode === 'parallel'
                        && step.status === 'in_progress'
                        && !stepIsStreaming
                        && !step.output
                        && !stepHasChatMessages
                        && !validationStageByStepId[step.id],
                      );
                      const displayedStepStatus = validationStageByStepId[step.id]
                        || (stepIsStreaming ? 'in_progress' : shouldRenderParallelStepAsIdle ? 'pending' : step.status);
                      const showNodeConfirm = step.id === currentStep?.id && currentStepHasConfirmableOutput;

                      return (
                        <div
                          key={step.id}
                          className={`overflow-hidden rounded-lg transition-all ${
                            isActive
                              ? 'border border-primary/30 bg-primary/10'
                              : isDisabled
                                ? 'border border-transparent opacity-60'
                                : 'border border-transparent hover:bg-muted/50'
                          }`}
                        >
                          <button
                            type="button"
                            disabled={isDisabled}
                            className="w-full p-3 text-left disabled:cursor-not-allowed"
                            onClick={() => {
                              if (!isDisabled) {
                                switchActiveStep(activeWorkflow, idx);
                              }
                            }}
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              {getStepIcon(displayedStepStatus)}
                              <span className={`min-w-0 truncate text-sm font-medium ${isActive ? 'text-primary' : ''}`}>
                                {step.name}
                              </span>
                              {step.runMode === 'parallel' && (
                                <Badge variant="secondary" className="ml-auto text-[10px]">并行</Badge>
                              )}
                            </div>
                            {step.status === 'validation_failed' && step.validationSummary && (
                              <p className="mt-1 ml-7 line-clamp-2 text-xs text-destructive/80">
                                验证未通过 — {compactMarkdownPreview(step.validationSummary, 64)}
                              </p>
                            )}
                            {showNodeConfirm && (
                              <p className="mt-2 ml-7 text-[11px] leading-4 text-muted-foreground">
                                {currentStepConfirmHint}
                              </p>
                            )}
                          </button>
                          {showNodeConfirm && (
                            <div className="border-t border-primary/20 px-3 pb-3 pt-2">
                              <Button
                                size="sm"
                                className="h-8 w-full gap-1.5 text-xs"
                                disabled={!currentStepCanConfirm}
                                onClick={() => {
                                  void handleConfirmStep();
                                }}
                              >
                                {currentStepIsConfirming || currentStepValidationStage ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : currentStep?.status === 'validation_failed' ? (
                                  <RotateCcw className="h-3.5 w-3.5" />
                                ) : (
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                )}
                                {currentStepConfirmLabel}
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Center: Chat Panel */}
      <div className="flex min-h-[70vh] min-w-0 flex-1 flex-col overflow-hidden lg:min-h-0">
        {/* Chat Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <MessageSquare className="h-5 w-5 text-primary" />
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold">{currentStep?.name || '选择步骤开始对话'}</h3>
              <p className="truncate text-xs text-muted-foreground">
                {currentSkill ? `Skill: ${currentSkill.name} | 工具: ${currentSkill.tools.join(', ')}` : ''}
              </p>
            </div>
          </div>
          {currentStep?.status === 'completed' && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                if (!activeWorkflow || !currentStep) return;
                const updatedAt = new Date().toISOString();
                const nextWorkflow = normalizeWorkflowExecutionPlan({
                  ...activeWorkflow,
                  status: 'in_progress',
                  steps: activeWorkflow.steps.map((step) => (
                    step.id === currentStep.id
                      ? {
                        ...step,
                        status: 'in_progress',
                        output: null,
                        candidateOutput: undefined,
                        candidateArtifactHash: undefined,
                        candidateSnapshotId: undefined,
                        validationAttemptId: undefined,
                        validationStatus: 'not_started',
                        validationSummary: undefined,
                        completed_at: undefined,
                        updated_at: updatedAt,
                      }
                      : step
                  )),
                  updated_at: updatedAt,
                }, updatedAt);
                setWorkflows((prev) => prev.map((workflow) => (
                  workflow.id === nextWorkflow.id ? nextWorkflow : workflow
                )));
                setActiveWorkflow(nextWorkflow);
                switchActiveStep(nextWorkflow, activeStepIndex);
                void persistWorkflow(nextWorkflow);
              }}
            >
              重新编辑
            </Button>
          )}
        </div>

        {/* Previous Steps Context */}
        {previousSteps.length > 0 && (
          <div className="border-b border-border/30 bg-muted/30 px-4 py-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5" />
              <span>默认注入前序 Markdown 产物:</span>
              {autoInjectedPreviousSteps.length > 0 ? autoInjectedPreviousSteps.map((s) => (
                <Badge key={s.id} variant="outline" className="gap-1.5 text-xs">
                  <FileText className="h-3 w-3" />
                  {s.name}
                  <button
                    type="button"
                    className="ml-1 text-muted-foreground hover:text-foreground"
                    onClick={() => setAutoInjectedStepEnabled(s.id, false)}
                    aria-label={`取消注入 ${s.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )) : (
                <Badge variant="secondary" className="text-xs">已全部取消</Badge>
              )}
              {disabledAutoInjectedPreviousSteps.length > 0 && (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  已取消 {disabledAutoInjectedPreviousSteps.length} 个
                </Badge>
              )}
            </div>
          </div>
        )}

        {currentGateBlocked && (
          <div className="border-b border-destructive/20 bg-destructive/5 px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <CircleStop className="h-4 w-4 shrink-0 text-destructive" />
                  <p className="truncate text-sm font-medium text-destructive">验证门禁阻塞</p>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {currentStep?.validationSummary || currentValidationAttempt?.agentValidation?.summary || currentValidationAttempt?.selfCheck?.summary || '候选产物未通过验收标准，请继续对话修订。'}
                </p>
                {currentBlockingFindings.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    {currentBlockingFindings.slice(0, 2).map((finding) => (
                      <p key={finding.id} className="line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                        {finding.criterion ? `${finding.criterion}：` : ''}{finding.issue}
                      </p>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => setRightPanelTab('gate')}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  查看门禁
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  disabled={!currentStepCanConfirm}
                  onClick={() => void handleConfirmStep()}
                >
                  {currentStepIsConfirming || currentStepValidationStage ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  重新验证
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Chat Messages */}
        <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-hidden p-4 [&_[data-slot=scroll-area-viewport]]:min-w-0 [&_[data-slot=scroll-area-viewport]]:overflow-x-hidden">
          {currentStep?.status === 'completed' && currentStep.output && chatMessages.length === 0 ? (
            /* Show completed step output */
            <div className="min-w-0 max-w-full space-y-4 overflow-hidden">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <h3 className="font-semibold">本步骤已完成</h3>
              </div>
              <div className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border/40 bg-muted/50 p-4">
                <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <h4 className="min-w-0 truncate text-sm font-medium text-primary">{currentStep.name} — 产出物</h4>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => copyMarkdownToClipboard(currentStep.output || '', `${currentStep.name}产物`)}
                    >
                      复制
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => currentStep.output && downloadStepOutput(currentStep.name, currentStep.output)}
                    >
                      <Download className="h-3.5 w-3.5" />
                      下载
                    </Button>
                  </div>
                </div>
                {(() => {
                  const outputPreview = getRenderedMarkdownPreview(currentStep.output || '');
                  return (
                    <>
                      <CompactMarkdown content={outputPreview.content} />
                      {outputPreview.truncated && (
                        <p className="mt-3 rounded-md border border-border/60 bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
                          预览已省略 {outputPreview.omittedChars.toLocaleString('zh-CN')} 字符，下载可获取完整 Markdown。
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
              {currentSkill?.checklist && currentSkill.checklist.length > 0 && (
                <div className="bg-muted/30 border border-border/30 rounded-lg p-4">
                  <p className="font-medium text-sm mb-2">质量 Checklist</p>
                  <ul className="space-y-1">
                    {currentSkill.checklist.map((item, idx) => (
                      <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : chatMessages.length === 0 && currentSkill ? (
            /* Show step start guide */
            <div className="flex flex-col items-center justify-center h-full text-center py-10">
              <Sparkles className="h-8 w-8 text-primary/50 mb-4" />
              <h3 className="font-semibold text-lg mb-2">开始「{currentStep?.name}」步骤</h3>
              <p className="text-sm text-muted-foreground max-w-md mb-4">
                AI 将基于「{currentSkill.name}」Skill 的方法论框架，与你协作完成本步骤。
              </p>
                <div className="max-w-lg rounded-lg bg-muted/50 p-4 text-left text-sm">
                <p className="font-medium mb-2">方法论框架：</p>
                <pre className="whitespace-pre-wrap font-sans text-muted-foreground">{currentSkill.methodology}</pre>
              </div>
              {currentSkill.checklist.length > 0 && (
                <div className="mt-4 max-w-lg w-full">
                  <p className="font-medium text-sm mb-2">质量 Checklist：</p>
                  <ul className="space-y-1">
                    {currentSkill.checklist.map((item, idx) => (
                      <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span>☐</span> {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden">
              {chatMessages.map((msg, idx) => {
                const renderDocumentCard = msg.role === 'assistant' && isAssistantDocumentLike(msg.content);
                const quickReplyQuestions = msg.role === 'assistant' && idx === lastAssistantMessageIndex && !isStreaming
                  ? extractAssistantQuickReplyQuestions(msg.content)
                  : [];

                return (
                  <div
                    key={idx}
                    className={`flex w-full min-w-0 max-w-full ${msg.role === 'user' ? 'justify-end pl-6 sm:pl-10' : 'justify-start pr-6 sm:pr-10'}`}
                  >
                    {renderDocumentCard ? (
                      <div className="flex min-w-0 max-w-full flex-col gap-2 items-start md:max-w-[80%] xl:max-w-2xl">
                        {renderAssistantDocumentCard(msg.content, idx)}
                        {quickReplyQuestions.length > 0 && (
                          <AssistantQuickReplyPanel
                            questions={quickReplyQuestions}
                            disabled={isStreaming}
                            onSubmit={(reply) => {
                              void handleSendMessage(reply);
                            }}
                          />
                        )}
                      </div>
                    ) : (
                      <div className={`flex min-w-0 max-w-full flex-col gap-2 ${msg.role === 'user' ? 'items-end md:max-w-[80%] xl:max-w-2xl' : 'items-start md:max-w-[80%] xl:max-w-2xl'}`}>
                        <div
                          className={`w-fit min-w-0 max-w-full overflow-hidden break-words rounded-lg p-3 text-sm [overflow-wrap:anywhere] ${
                            msg.role === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted/50 border border-border/40'
                          }`}
                        >
                          {msg.role === 'assistant' ? (
                            <CompactMarkdown content={msg.content} />
                          ) : (
                            <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.content}</div>
                          )}
                        </div>
                        {quickReplyQuestions.length > 0 && (
                          <AssistantQuickReplyPanel
                            questions={quickReplyQuestions}
                            disabled={isStreaming}
                            onSubmit={(reply) => {
                              void handleSendMessage(reply);
                            }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {isStreaming && (
                <div className="flex justify-start">
                  <div className="bg-muted/50 border border-border/40 rounded-lg p-3">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </ScrollArea>

        {/* Chat Input */}
        <div className="flex flex-col gap-3 border-t border-border/40 p-4">
          <div className="flex flex-col gap-3 rounded-lg border border-border/40 bg-muted/20 p-3">
            <div className="flex w-full items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">补充上下文</p>
                  <p className="truncate text-xs text-muted-foreground">
                    本轮注入 {selectedContextCount} 个来源 · 自动产物 {autoInjectedPreviousSteps.length} · 知识库 {selectedKnowledgeBaseOptions.length} · 手动材料 {selectedReviewMaterialOptions.length} · 文件 {currentContextFiles.length}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0 gap-1.5 text-xs"
                onClick={() => setSupplementalContextOpen((prev) => !prev)}
                aria-expanded={supplementalContextOpen}
              >
                管理上下文
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${supplementalContextOpen ? 'rotate-180' : ''}`} />
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".txt,.md,image/*"
              className="hidden"
              onChange={(event) => {
                void addUploadedContextFiles(Array.from(event.target.files || []));
                event.target.value = '';
              }}
            />

            {supplementalContextOpen && (
              <div className="flex flex-col gap-3 border-t border-border/40 pt-3">
                {(selectedContextCount > 0 || unavailableKnowledgeBaseCount > 0) && (
                  <div className="rounded-lg border border-border/50 bg-background/60 p-3">
                    {unavailableKnowledgeBaseCount > 0 && (
                      <div className="mb-3 flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 px-2 text-xs"
                          onClick={() => {
                            const nextIds = selectedKnowledgeBaseIds.filter((id) => knowledgeBases.some((kb) => kb.id === id));
                            updateCurrentContextSelection(
                              { knowledgeBaseIds: nextIds },
                              () => setSelectedKnowledgeBaseIds(nextIds),
                            );
                          }}
                        >
                          清理失效引用
                        </Button>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                    {autoInjectedPreviousSteps.map((step) => (
                      <Badge key={`auto-step-${step.id}`} variant="secondary" className="gap-1.5 bg-primary/10 text-primary">
                        <FileText className="h-3 w-3" />
                        {step.name}
                        <button
                          type="button"
                          className="ml-1 text-primary/70 hover:text-primary"
                          onClick={() => setAutoInjectedStepEnabled(step.id, false)}
                          aria-label={`取消自动注入 ${step.name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                    {selectedKnowledgeBaseOptions.map((kb) => (
                      <Badge key={`selected-kb-${kb.id}`} variant="secondary" className="gap-1.5">
                        <Database className="h-3 w-3" />
                        {kb.name}
                        <button
                          type="button"
                          className="ml-1 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            const nextIds = selectedKnowledgeBaseIds.filter((id) => id !== kb.id);
                            updateCurrentContextSelection(
                              { knowledgeBaseIds: nextIds },
                              () => setSelectedKnowledgeBaseIds(nextIds),
                            );
                          }}
                          aria-label={`移除知识库 ${kb.name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                    {selectedReviewMaterialOptions.map((material) => (
                      <Badge key={`selected-material-${material.id}`} variant="secondary" className="gap-1.5">
                        <ClipboardCheck className="h-3 w-3" />
                        {material.name}
                        <button
                          type="button"
                          className="ml-1 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            const nextIds = selectedReviewMaterialIds.filter((id) => id !== material.id);
                            updateCurrentContextSelection(
                              { reviewMaterialIds: nextIds },
                              () => setSelectedReviewMaterialIds(nextIds),
                            );
                          }}
                          aria-label={`移除材料 ${material.name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                    {currentContextFiles.map((file) => (
                      <Badge key={`selected-file-${file.id}`} variant="outline" className="gap-1.5 bg-background/60">
                        {file.isImage ? <ImageIcon className="h-3 w-3" /> : <Paperclip className="h-3 w-3" />}
                        <span className="max-w-40 truncate">{file.name}</span>
                        <button
                          type="button"
                          className="ml-1 text-muted-foreground hover:text-foreground"
                          onClick={() => removeContextFile(file.id)}
                          aria-label={`移除 ${file.name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                    {unavailableKnowledgeBaseCount > 0 && (
                      <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning">
                        {unavailableKnowledgeBaseCount} 个知识库引用不可用
                      </Badge>
                    )}
                    </div>
                  </div>
                )}

                <Tabs value={supplementalContextTab} onValueChange={(value) => setSupplementalContextTab(value as 'knowledge' | 'materials' | 'files')}>
                  <TabsList className="grid h-8 w-full grid-cols-3">
                    <TabsTrigger value="knowledge" className="text-xs">知识库</TabsTrigger>
                    <TabsTrigger value="materials" className="text-xs">前序产物</TabsTrigger>
                    <TabsTrigger value="files" className="text-xs">本地文件</TabsTrigger>
                  </TabsList>

                  <TabsContent value="knowledge" className="mt-3">
                    <div className="flex flex-col gap-2">
                      {knowledgeNotice && (
                        <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-5 text-warning">
                          {knowledgeNotice}
                        </div>
                      )}
                      {knowledgeLoading ? (
                        <div className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
                          正在读取真实知识库列表...
                        </div>
                      ) : knowledgeBases.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border/60 p-3 text-xs leading-5 text-muted-foreground">
                          暂无可选知识库。当前不会向模型注入 Mock 知识库；请先在知识库页面完成服务配置和文档导入。
                        </div>
                      ) : (
                        knowledgeBases.map((kb) => {
                          const selected = selectedKnowledgeBaseIds.includes(kb.id);
                          return (
                            <div
                              key={kb.id}
                              className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${
                                selected ? 'border-primary/50 bg-primary/10' : 'border-border/50 bg-background/60'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-xs font-medium">{kb.name}</p>
                                  <StatusBadge tone={kb.document_count ? 'success' : 'warning'}>
                                    {kb.document_count ? '已连接' : '空库'}
                                  </StatusBadge>
                                  <Badge variant="outline">{kb.document_count || 0} 文档</Badge>
                                </div>
                                {kb.description?.trim() ? (
                                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                                    {kb.description}
                                  </p>
                                ) : null}
                                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                                  数据集 {kb.dataset_name || '未配置'} · 更新于 {kb.updated_at ? formatSnapshotTime(kb.updated_at) : '未知'}
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant={selected ? 'default' : 'outline'}
                                size="sm"
                                className="h-8 shrink-0 text-xs"
                                onClick={() => {
                                  const nextIds = selected
                                    ? selectedKnowledgeBaseIds.filter((id) => id !== kb.id)
                                    : [...selectedKnowledgeBaseIds, kb.id];
                                  updateCurrentContextSelection(
                                    { knowledgeBaseIds: nextIds },
                                    () => setSelectedKnowledgeBaseIds(nextIds),
                                  );
                                }}
                              >
                                {selected ? '已选' : '选择'}
                              </Button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="materials" className="mt-3">
                    <div className="flex flex-col gap-3">
                      <div className="rounded-lg border border-border/50 bg-background/60 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-medium">默认注入前序步骤产物</p>
                            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                              前序 Skill 输出的 Markdown 文档默认会进入当前步骤上下文，可按步骤关闭。
                            </p>
                          </div>
                          <Badge variant="outline" className="shrink-0 text-[11px]">
                            {autoInjectedPreviousSteps.length}/{previousSteps.length} 启用
                          </Badge>
                        </div>
                        {previousSteps.length > 0 ? (
                          <div
                            data-testid="auto-injected-previous-steps-list"
                            className={cn(
                              'mt-3 overflow-y-auto pr-2 [scrollbar-gutter:stable]',
                              previousSteps.length > 3 ? 'h-72' : 'max-h-72',
                            )}
                          >
                            <div className="flex flex-col gap-2 pr-3">
                              {previousSteps.map((step) => {
                                const enabled = !disabledAutoInjectedStepIds.includes(step.id);
                                return (
                                  <div
                                    key={step.id}
                                    className={cn(
                                      'flex items-start justify-between gap-3 rounded-lg border p-3',
                                      enabled ? 'border-primary/50 bg-primary/10' : 'border-border/50 bg-muted/20',
                                    )}
                                  >
                                    <div className="min-w-0">
                                      <div className="flex min-w-0 items-center gap-2">
                                        <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                                        <p className="truncate text-xs font-medium">{step.name}</p>
                                      </div>
                                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                                        {compactMarkdownPreview(step.output || '', 120)}
                                      </p>
                                    </div>
                                    <Button
                                      type="button"
                                      variant={enabled ? 'default' : 'outline'}
                                      size="sm"
                                      className="h-8 shrink-0 text-xs"
                                      onClick={() => setAutoInjectedStepEnabled(step.id, !enabled)}
                                    >
                                      {enabled ? '已注入' : '已取消'}
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
                            当前步骤暂无可自动注入的前序产物。
                          </div>
                        )}
                      </div>

                      <div className="rounded-lg border border-border/50 bg-background/60 p-3">
                        <p className="text-xs font-medium">额外审核材料</p>
                        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                          这里用于选择非默认链路的产物或本地审核材料。
                        </p>
                        {additionalReviewMaterials.length > 0 ? (
                          <div className="mt-3 flex flex-col gap-2">
                            {additionalReviewMaterials.map((material) => {
                              const selected = selectedReviewMaterialIds.includes(material.id);
                              return (
                                <div
                                  key={material.id}
                                  className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${
                                    selected ? 'border-primary/50 bg-primary/10' : 'border-border/50 bg-background/60'
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-medium">{material.name}</p>
                                    <p className="mt-1 text-[11px] text-muted-foreground">{material.source}</p>
                                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{material.summary}</p>
                                  </div>
                                  <Button
                                    type="button"
                                    variant={selected ? 'default' : 'outline'}
                                    size="sm"
                                    className="h-8 shrink-0 text-xs"
                                    onClick={() => {
                                      const nextIds = selected
                                        ? selectedReviewMaterialIds.filter((id) => id !== material.id)
                                        : [...selectedReviewMaterialIds, material.id];
                                      updateCurrentContextSelection(
                                        { reviewMaterialIds: nextIds },
                                        () => setSelectedReviewMaterialIds(nextIds),
                                      );
                                    }}
                                  >
                                    {selected ? '已选' : '选择'}
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="mt-3 rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
                            暂无额外审核材料。步骤产物会默认通过上方链路注入下一步骤，无需手动保存。
                          </div>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="files" className="mt-3">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-muted-foreground">支持 .txt、.md、图片，也可直接粘贴图片到输入框。</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 shrink-0 gap-1.5 text-xs"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          上传文件
                        </Button>
                      </div>
                      {currentContextFiles.length > 0 ? (
                        <div className="flex flex-col gap-2">
                          {currentContextFiles.map((file) => (
                            <div
                              key={file.id}
                              className="flex max-w-full items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/60 px-3 py-2 text-xs"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                {file.isImage ? (
                                  <ImageIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
                                ) : (
                                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                )}
                                <span className="truncate">{file.name}</span>
                                <span className="shrink-0 text-muted-foreground">{formatFileSize(file.size)}</span>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="shrink-0"
                                onClick={() => removeContextFile(file.id)}
                                aria-label={`移除 ${file.name}`}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
                          暂无上传文件。
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-border/40 bg-background/70 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Demo 生成</p>
                <p className="truncate text-xs text-muted-foreground">{currentStepDemoHint}</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {currentStepDemoHandoff?.studioUrl ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => window.open(currentStepDemoHandoff.studioUrl, '_blank', 'noopener,noreferrer')}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  打开 Demo
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  disabled={!canGenerateCurrentStepDemo}
                  onClick={() => void handleGenerateDemoHandoff()}
                >
                  {currentStepDemoLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  Demo 生成
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Textarea
              placeholder="输入你的问题或指令..."
              value={chatInput}
              onChange={(e) => {
                const nextValue = e.target.value;
                setChatInput(nextValue);
                if (currentStep?.id) {
                  setChatInputByStepId((prev) => ({ ...prev, [currentStep.id]: nextValue }));
                }
              }}
              onPaste={handlePasteContextFiles}
              onKeyDown={handleChatInputKeyDown}
              disabled={isStreaming}
              rows={3}
              className="max-h-40 min-h-20 min-w-0 flex-1 resize-none overflow-y-auto"
            />
            {isStreaming ? (
              <Button
                type="button"
                variant="outline"
                className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 sm:w-auto"
                onClick={handleStopStreaming}
                aria-label="终止当前任务"
              >
                <CircleStop className="h-4 w-4" />
                终止
              </Button>
            ) : (
              <Button
                type="button"
                className="gap-2 sm:w-auto"
                onClick={() => {
                  void handleSendMessage();
                }}
                disabled={!chatInput.trim()}
                aria-label="发送消息"
              >
                <ArrowRight className="h-4 w-4" />
                发送
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Right: Context Panel */}
      <div className="flex max-h-[32rem] min-h-0 w-full shrink-0 flex-col overflow-hidden border-t border-border/40 lg:h-full lg:max-h-none lg:w-80 lg:border-l lg:border-t-0 xl:w-80">
        <Tabs
          value={rightPanelTab}
          onValueChange={(value) => setRightPanelTab(value as typeof rightPanelTab)}
          className="min-h-0 flex-1 gap-0 overflow-hidden"
        >
          <div className="shrink-0 border-b border-border/40 p-4">
            <h3 className="text-sm font-semibold">上下文面板</h3>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {currentStep?.name || '未选择步骤'}
            </p>
            <TabsList className="mt-3 grid h-auto w-full grid-cols-4 gap-1">
              <TabsTrigger value="outputs" className="text-xs">产出</TabsTrigger>
              <TabsTrigger value="gate" className="text-xs">门禁</TabsTrigger>
              <TabsTrigger value="review" className="text-xs">审核</TabsTrigger>
              <TabsTrigger value="archive" className="text-xs">沉淀</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="gate" className="min-h-0 flex-1 overflow-hidden">
            <div className="flex h-full min-w-0 flex-col gap-3 overflow-y-auto p-4">
              {currentStep ? (
                <>
                  <div className="rounded-lg border border-border/50 bg-background/60 p-3">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium">当前门禁状态</p>
                        <p className="mt-1 truncate text-[11px] text-muted-foreground">
                          {currentValidationAttempt?.updated_at ? `最近验证：${formatSnapshotTime(currentValidationAttempt.updated_at)}` : '尚未运行验证'}
                        </p>
                      </div>
                      <StatusBadge tone={getValidationAttemptTone(currentValidationAttempt?.status)} className="shrink-0 text-[11px]">
                        {getValidationAttemptStatusLabel(currentValidationAttempt?.status)}
                      </StatusBadge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <StatusBadge tone={currentStep.status === 'validation_failed' ? 'danger' : currentStep.status === 'completed' ? 'success' : 'brand'} className="text-[11px]">
                        {getStepStatusLabel((currentStepEffectiveStatus || currentStep.status) as WorkflowStepStatus)}
                      </StatusBadge>
                      <Badge variant="outline" className="text-[11px]">
                        Attempts {currentValidationAttempts.length}
                      </Badge>
                    </div>
                    {(currentStep.validationSummary || currentValidationAttempt?.agentValidation?.summary || currentValidationAttempt?.selfCheck?.summary) && (
                      <p className="mt-3 text-xs leading-5 text-muted-foreground">
                        {currentStep.validationSummary || currentValidationAttempt?.agentValidation?.summary || currentValidationAttempt?.selfCheck?.summary}
                      </p>
                    )}
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        disabled={!currentValidationCandidate}
                        onClick={() => currentValidationCandidate && downloadMarkdownDocument(`${currentStep.name}-验证候选产物`, currentValidationCandidate)}
                      >
                        <Download className="h-3.5 w-3.5" />
                        下载候选
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        disabled={!currentStepCanConfirm}
                        onClick={() => void handleConfirmStep()}
                      >
                        {currentStepIsConfirming || currentStepValidationStage ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        {currentStep.status === 'validation_failed' ? '重新验证' : '运行验证'}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/50 bg-background/60 p-3">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <p className="text-xs font-medium">验收标准</p>
                      <Badge variant="outline" className="shrink-0 text-[11px]">
                        {currentValidationCriteria.length}
                      </Badge>
                    </div>
                    {currentValidationCriteria.length > 0 ? (
                      <div className="mt-3 flex flex-col gap-2">
                        {currentValidationCriteria.map((criterion, index) => (
                          <div key={`${criterion}-${index}`} className="flex gap-2 rounded-md bg-muted/25 px-2.5 py-2 text-[11px] leading-5">
                            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary">
                              {index + 1}
                            </span>
                            <span className="min-w-0 break-words text-muted-foreground">{criterion}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
                        当前 Skill 暂无显式验收标准；系统会使用通用 BattleFlow 产物标准。
                      </p>
                    )}
                  </div>

                  {renderValidationPhase('Skill 自检结果', currentValidationAttempt?.selfCheck)}
                  {renderValidationPhase('Agent 校验结果', currentValidationAttempt?.agentValidation)}

                  <div className="rounded-lg border border-border/50 bg-background/60 p-3">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <p className="text-xs font-medium">阻塞项</p>
                      <StatusBadge tone={currentBlockingFindings.length > 0 ? 'danger' : 'success'} className="shrink-0 text-[11px]">
                        {currentBlockingFindings.length > 0 ? `${currentBlockingFindings.length} 项` : '无阻塞'}
                      </StatusBadge>
                    </div>
                    {currentBlockingFindings.length > 0 ? (
                      <div className="mt-3 flex flex-col gap-2">
                        {currentBlockingFindings.map((finding) => (
                          <div key={finding.id} className="rounded-md border border-destructive/20 bg-destructive/5 p-2">
                            <p className="text-[11px] font-medium text-destructive">{finding.criterion || '未指定验收标准'}</p>
                            <p className="mt-1 text-xs leading-5">{finding.issue}</p>
                            {finding.recommendation && (
                              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{finding.recommendation}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
                        暂无阻塞项。若验证尚未运行，请先在当前步骤生成候选产物并运行验证。
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
                  选择一个步骤后查看验证门禁。
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="outputs" className="min-h-0 flex-1 overflow-hidden">
            <div className="flex h-full min-w-0 flex-col gap-4 overflow-y-auto p-4">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h4 className="min-w-0 truncate text-xs font-medium text-muted-foreground">当前步骤产出</h4>
                    <Badge variant="outline" className="shrink-0 text-[11px]">
                      {currentStep?.output ? '1 个' : '0 个'}
                    </Badge>
                  </div>
                  {currentStep?.output ? (
                    renderStepOutputPreview(currentStep, { label: '当前步骤' })
                  ) : (
                    <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
                      当前步骤验证通过后，会在这里展示本步骤产出。
                    </p>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h4 className="min-w-0 truncate text-xs font-medium text-muted-foreground">前序步骤产出</h4>
                    <Badge variant="outline" className="shrink-0 text-[11px]">{previousSteps.length} 个</Badge>
                  </div>
                  {previousSteps.length > 0 ? (
                    previousSteps.map((step) => renderStepOutputPreview(step, { label: '前序步骤' }))
                  ) : (
                    <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
                      当前步骤暂无前序产出。
                    </p>
                  )}
                </div>

                {parallelPeerSteps.length > 0 && (
                  <div className="min-w-0">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h4 className="min-w-0 truncate text-xs font-medium text-muted-foreground">并行任务产出</h4>
                      <Badge variant="outline" className="shrink-0 text-[11px]">{parallelPeerSteps.length} 个</Badge>
                    </div>
                    {parallelPeerSteps.map((step) => renderStepOutputPreview(step, { label: '并行步骤' }))}
                  </div>
                )}

                <div className="min-w-0">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h4 className="min-w-0 truncate text-xs font-medium text-muted-foreground">最终工作流产出</h4>
                    <Badge variant="outline" className="shrink-0 text-[11px]">
                      {finalWorkflowOutputSteps.length} 个
                    </Badge>
                  </div>
                  {finalWorkflowOutputSteps.length > 0 ? (
                    <div className="min-w-0">
                      <div className="mb-2 flex min-w-0 items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/25 px-3 py-2">
                        <p className="min-w-0 truncate text-[11px] text-muted-foreground">
                          来自最后步骤的已确认产物
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 gap-1 px-1.5 text-[11px]"
                          onClick={() => downloadWorkflowFinalOutput(activeWorkflow, finalWorkflowOutputSteps)}
                        >
                          <Download className="h-3.5 w-3.5" />
                          全部下载
                        </Button>
                      </div>
                      {finalWorkflowOutputSteps.map((step) => renderStepOutputPreview(step, { label: '最终产物' }))}
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
                      最后一个步骤验证通过后，这里会自动汇总为工作流最终产出。
                    </p>
                  )}
                </div>
            </div>
          </TabsContent>

          <TabsContent value="review" className="min-h-0 flex-1 overflow-hidden">
            <div className="flex h-full min-w-0 flex-col gap-3 overflow-y-auto p-4">
                {currentStep && (
                  <>
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <h4 className="min-w-0 truncate text-xs font-medium text-muted-foreground">产物审核反馈</h4>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 gap-1.5 text-xs"
                        onClick={() => reviewedOutputInputRef.current?.click()}
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                        上传
                      </Button>
                      <input
                        ref={reviewedOutputInputRef}
                        type="file"
                        multiple
                        accept=".txt,.md,.doc,.docx,.pdf,image/*"
                        className="hidden"
                        onChange={(event) => {
                          void addReviewedOutputFiles(Array.from(event.target.files || []), currentStep.id);
                          event.target.value = '';
                        }}
                      />
                    </div>
                    <Card className={appCardClassName}>
                      <CardContent className="flex flex-col gap-3 p-3">
                        <p className="break-words text-xs leading-5 text-muted-foreground">
                          下载产物并完成评审后，上传已审核版本并填写审核评论，后续可用于优化 Skill。
                        </p>

                        {currentReviewedOutputFiles.length > 0 ? (
                          <div className="flex flex-col gap-2">
                            {currentReviewedOutputFiles.map((file) => (
                              <div
                                key={file.id}
                                className="flex items-center gap-2 rounded-md border border-border/50 bg-background/60 px-2 py-1.5 text-xs"
                              >
                                <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-medium">{file.name}</p>
                                  <p className="text-muted-foreground">{formatFileSize(file.size)}</p>
                                </div>
                                {file.content && (
                                  <button
                                    type="button"
                                    className="text-muted-foreground hover:text-foreground"
                                    onClick={() => downloadReviewedOutputFile(file)}
                                    aria-label={`下载 ${file.name}`}
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="text-muted-foreground hover:text-foreground"
                                  onClick={() => removeReviewedOutputFile(file.id)}
                                  aria-label={`移除 ${file.name}`}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="rounded-md border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
                            暂无已审核产物。
                          </p>
                        )}

                        <textarea
                          className="min-h-24 w-full rounded-md border border-border/60 bg-background/60 px-3 py-2 text-xs outline-none placeholder:text-muted-foreground focus:border-brand/50"
                          placeholder="填写审核评论，例如：结论是否充分、哪些地方需要补充、Skill 输出模板是否需要调整..."
                          value={reviewComments[currentStep.id] || ''}
                          onChange={(event) => updateReviewComment(currentStep.id, event.target.value)}
                        />
                      </CardContent>
                    </Card>
                  </>
                )}
            </div>
          </TabsContent>

          <TabsContent value="archive" className="min-h-0 flex-1 overflow-hidden">
            <div className="flex h-full min-w-0 flex-col gap-3 overflow-y-auto p-4">
                <Card className={appCardClassName}>
                  <CardContent className="flex flex-col gap-3 p-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium">归档为工作流知识材料</p>
                      <p className="mt-1 break-words text-[11px] leading-5 text-muted-foreground">
                        {isReviewedOutputArchived
                          ? '已归档，可在后续上下文中选择引用。'
                          : '将已审核产物和评论沉淀为当前工作流可复用材料。'}
                      </p>
                    </div>
                    <Button
                      variant={isReviewedOutputArchived ? 'secondary' : 'outline'}
                      size="sm"
                      className="h-8 w-full gap-1.5 text-xs"
                      disabled={!canArchiveReviewedOutput || isReviewedOutputArchived}
                      onClick={() => currentStep && archiveReviewedOutput(currentStep.id)}
                    >
                      <Save className="h-3.5 w-3.5" />
                      {isReviewedOutputArchived ? '已归档' : '归档审核材料'}
                    </Button>
                  </CardContent>
                </Card>

                {currentStep?.output && (
                  <Card className={appCardClassName}>
                    <CardContent className="flex flex-col gap-3 p-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium">保存步骤产出</p>
                        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                          {savedCurrentStepOutput
                            ? `已保存为 ${savedCurrentStepOutput.name}，可在后续步骤的补充上下文中选择引用。`
                            : '将当前步骤产出保存为工作流内材料，后续步骤可作为评审材料引用。'}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2">
                        {savedCurrentStepOutput && (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="w-full gap-2"
                            onClick={() => downloadReviewedOutputFile(savedCurrentStepOutput)}
                          >
                            <Download className="h-3.5 w-3.5" />
                            下载已保存产物
                          </Button>
                        )}
                        <Button
                          variant={savedCurrentStepOutputIsCurrent ? 'secondary' : 'outline'}
                          size="sm"
                          className="w-full gap-2"
                          disabled={savedCurrentStepOutputIsCurrent}
                          onClick={saveCurrentStepOutput}
                        >
                          <Save className="h-3.5 w-3.5" />
                          {savedCurrentStepOutputIsCurrent
                            ? '已保存当前版本'
                            : savedCurrentStepOutput
                              ? '更新产出物'
                              : '保存产出物'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

    </div>
  );
}
