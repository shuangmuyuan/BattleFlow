'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ClipboardEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  MoreHorizontal,
} from 'lucide-react';

interface Skill {
  id: string;
  name: string;
  description: string;
  methodology: string;
  tools: string[];
  outputs: Record<string, unknown>;
  checklist: string[];
  tags: string[];
  prompt_template?: string;
  skill_md?: string;
  scope?: 'personal' | 'team' | 'official';
  status?: 'imported' | 'pending_review' | 'published' | 'rejected' | 'archived';
  updated_at?: string;
  review?: {
    source_skill_id?: string;
    source_version?: string;
    decision?: 'approved' | 'rejected';
  };
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
  status: 'pending' | 'in_progress' | 'completed';
  output: string | null;
  created_at?: string;
  updated_at?: string;
  completed_at?: string;
}

type WorkflowFileContentKind = 'text' | 'image_data_url' | 'metadata';

interface WorkflowContextSelection {
  knowledgeBaseIds: string[];
  reviewMaterialIds: string[];
  disabledAutoInjectedStepIds?: string[];
  updated_at?: string;
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
  created_at?: string;
  updated_at?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
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

const maxTextContextChars = 120_000;
const maxPreviewImageBytes = 800_000;

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
  const [isStreaming, setIsStreaming] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false);
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
  const [rightPanelTab, setRightPanelTab] = useState<'skill' | 'outputs' | 'review' | 'archive'>('outputs');
  const [archivedReviewStepIds, setArchivedReviewStepIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const workflowSkillOptions = useMemo(() => dedupeWorkflowSkillOptions(skills), [skills]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reviewedOutputInputRef = useRef<HTMLInputElement>(null);

  const getVisibleSteps = (workflow: Workflow) => workflow.steps.filter((step) => !step.isRemoved);

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
      ? workflow.stepChats[stepId]
      : []
  );

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
    syncWorkflowSupportingState(workflow, nextIndex);
    setChatMessages(getStepChatMessages(workflow, nextStep?.id));
    setRightPanelTab(
      nextStep?.output || (nextStep && visibleSteps.some((step) => step.step_index < nextStep.step_index && step.output))
        ? 'outputs'
        : 'skill',
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
    } catch (error) {
      console.error('Workflow save error:', error);
      setErrorMessage(error instanceof Error ? error.message : '工作流保存失败');
    }
  }, []);

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
    const updatedAt = new Date().toISOString();
    const buildNextWorkflow = (source: Workflow): Workflow => ({
      ...source,
      stepChats: {
        ...(source.stepChats || {}),
        [stepId]: messages,
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
    setActiveWorkflow(workflow);
    const visibleSteps = getVisibleSteps(workflow);
    const firstInProgress = visibleSteps.findIndex((step) => step.status === 'in_progress');
    const nextStepIndex = firstInProgress >= 0 ? firstInProgress : 0;
    switchActiveStep(workflow, nextStepIndex);
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

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const getStepIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />;
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


  const handlePasteContextFiles = useCallback((event: ClipboardEvent<HTMLInputElement>) => {
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

  const getSavedStepOutputFileId = (stepId: string) => `saved-step-output-${stepId}`;

  const buildStepOutputMarkdown = (workflow: Workflow, step: WorkflowStep) => {
    const output = (step.output || '').trim();
    if (!output) return `# ${step.name} - Skill 输出文档\n\n> 工作流：${workflow.name}\n\n暂无产物。`;
    return /^#\s+\S/.test(output)
      ? output
      : `# ${workflow.name}\n\n## ${step.name}\n\n${output}`;
  };

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
    const autoInjectedStepIds = new Set(
      workflow.steps
        .filter((item) => !item.isRemoved && item.step_index < step.step_index && item.output && !disabledAutoIds.has(item.id))
        .map((item) => item.id),
    );

    const selectedKnowledgeBases = knowledgeBases
      .filter((kb) => knowledgeBaseIds.includes(kb.id))
      .map((kb) => `知识库：${kb.name}（${kb.description}）`);
    const stepContextFiles = (workflow.contextFiles || [])
      .filter((file) => file.stepId === step.id)
      .map((file) => summarizeWorkflowFile(file, 800));
    const autoInjectedStepMaterials = workflow.steps
      .filter((item) => !item.isRemoved && item.step_index < step.step_index && item.output && !disabledAutoIds.has(item.id))
      .map((item) => {
        const markdown = buildStepOutputMarkdown(workflow, item);
        return `默认注入：${item.name} Markdown 产物\n${markdown.slice(0, 1200)}${markdown.length > 1200 ? '\n...（已截断）' : ''}`;
      });
    const selectedStepMaterials = workflow.steps
      .filter((item) => !item.isRemoved && selectedReviewIds.has(item.id) && !autoInjectedStepIds.has(item.id) && item.output)
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

  const handleSendMessage = useCallback(async () => {
    if (!chatInput.trim() || isStreaming) return;

    const workflow = activeWorkflow;
    const currentStep = workflow ? getVisibleSteps(workflow)[activeStepIndex] : undefined;
    if (!workflow || !currentStep) return;

    const userMessage = chatInput.trim();
    const currentStepContextFiles = uploadedContextFiles.filter((file) => file.stepId === currentStep.id);
    const selectedKnowledgeBases = knowledgeBases.filter((kb) => selectedKnowledgeBaseIds.includes(kb.id));
    const contextSelection = getContextSelection(workflow, currentStep.id);
    const disabledAutoInjectedStepIds = new Set(contextSelection.disabledAutoInjectedStepIds || []);
    const autoInjectedStepOutputs = workflow.steps
      .filter((step) => !step.isRemoved && step.step_index < currentStep.step_index && step.output && !disabledAutoInjectedStepIds.has(step.id))
      .map((step) => ({
        id: step.id,
        name: step.name,
        output: buildStepOutputMarkdown(workflow, step),
      }));
    const autoInjectedStepOutputIds = new Set(autoInjectedStepOutputs.map((step) => step.id));
    const selectedReviewMaterials = workflow.steps
      .filter((step) => (
        !step.isRemoved
        && selectedReviewMaterialIds.includes(step.id)
        && !autoInjectedStepOutputIds.has(step.id)
        && step.output
      ))
      .map((step) => ({
        name: step.name,
        source: '工作流已评审产物',
        summary: buildStepOutputMarkdown(workflow, step).slice(0, 1200),
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

    setChatInput('');
    setChatMessages(visibleMessages);
    saveStepChatMessages(workflow, currentStep.id, visibleMessages, { persist: false });
    setIsStreaming(true);

    try {
      const skillDef = skills.find((s) => s.id === currentStep?.skill_id);

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: requestMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          agent_provider: 'claude-cli',
          model_id: 'doubao-seed-2-0-pro-260215',
          skill_definition: skillDef ? {
            name: skillDef.name,
            description: skillDef.description,
            methodology: skillDef.methodology,
            outputs: skillDef.outputs,
            checklist: skillDef.checklist,
            tools: skillDef.tools,
            prompt_template: skillDef.prompt_template,
            skill_md: skillDef.skill_md,
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
      });

      if (!response.ok || !response.body) throw new Error('Chat request failed');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      setChatMessages([...visibleMessages, { role: 'assistant', content: '' }]);

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
              setChatMessages([...visibleMessages, { role: 'assistant', content: assistantContent }]);
            }
            if (data.done) break;
          }
        }
      }
      const finalMessages: ChatMessage[] = [
        ...visibleMessages,
        { role: 'assistant', content: assistantContent },
      ];
      setChatMessages(finalMessages);
      saveStepChatMessages(workflow, currentStep.id, finalMessages);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessages: ChatMessage[] = [
        ...visibleMessages,
        { role: 'assistant', content: '抱歉，对话出现了问题，请重试。' },
      ];
      setChatMessages(errorMessages);
      saveStepChatMessages(workflow, currentStep.id, errorMessages);
    } finally {
      setIsStreaming(false);
    }
  }, [
    chatInput,
    chatMessages,
    isStreaming,
    activeWorkflow,
    activeStepIndex,
    saveStepChatMessages,
    skills,
    knowledgeBases,
    selectedKnowledgeBaseIds,
    selectedReviewMaterialIds,
    uploadedContextFiles,
    reviewedOutputFiles,
  ]);

  const deriveWorkflowStatus = (steps: WorkflowStep[]): Workflow['status'] => {
    const activeSteps = steps.filter((step) => !step.isRemoved);
    if (activeSteps.length === 0) return 'draft';
    if (activeSteps.every((step) => step.status === 'completed')) return 'completed';
    return 'in_progress';
  };

  const completeWorkflowStep = (workflow: Workflow, stepId: string, output: string) => {
    const currentStep = workflow.steps.find((step) => step.id === stepId);
    if (!currentStep) return { workflow, nextActiveStepIndex: activeStepIndex };

    const completedAt = new Date().toISOString();
    let nextSteps = workflow.steps.map((step) => (
      step.id === stepId
        ? { ...step, status: 'completed' as const, output, completed_at: completedAt, updated_at: completedAt }
        : step
    ));

    const unlockNextStepIndex = () => {
      const laterStepIndex = Math.min(
        ...nextSteps
          .filter((step) => !step.isRemoved && step.step_index > currentStep.step_index)
          .map((step) => step.step_index)
      );

      if (!Number.isFinite(laterStepIndex)) return;

      nextSteps = nextSteps.map((step) => (
        step.step_index === laterStepIndex && step.status === 'pending'
          ? { ...step, status: 'in_progress' as const, updated_at: completedAt }
          : step
      ));
    };

    if (currentStep.runMode === 'parallel' && currentStep.parallelGroupId) {
      const groupSteps = nextSteps.filter((step) => !step.isRemoved && step.parallelGroupId === currentStep.parallelGroupId);
      if (groupSteps.every((step) => step.status === 'completed')) {
        unlockNextStepIndex();
      }
    } else {
      unlockNextStepIndex();
    }

    const nextWorkflow: Workflow = {
      ...workflow,
      status: deriveWorkflowStatus(nextSteps),
      steps: nextSteps,
      updated_at: completedAt,
    };
    const visibleSteps = getVisibleSteps(nextWorkflow);
    const nextInProgressIndex = visibleSteps.findIndex((step) => step.status === 'in_progress');
    const completedStepIndex = visibleSteps.findIndex((step) => step.id === stepId);

    return {
      workflow: nextWorkflow,
      nextActiveStepIndex: nextInProgressIndex >= 0 ? nextInProgressIndex : Math.max(completedStepIndex, 0),
    };
  };

  const handleConfirmStep = async () => {
    if (!activeWorkflow || activeStepIndex < 0) return;

    const lastAssistantMsg = [...chatMessages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistantMsg) return;

    const currentStep = getVisibleSteps(activeWorkflow)[activeStepIndex];
    if (!currentStep) return;

    const stepOutputDocument = normalizeSkillOutputDocument(activeWorkflow, currentStep, lastAssistantMsg.content);
    const { workflow: nextWorkflow, nextActiveStepIndex } = completeWorkflowStep(
      activeWorkflow,
      currentStep.id,
      stepOutputDocument,
    );
    const snapshotCreatedAt = new Date().toISOString();
    const stepSnapshot = buildStepSnapshot(activeWorkflow, currentStep, stepOutputDocument, snapshotCreatedAt);
    const workflowWithSnapshot = {
      ...nextWorkflow,
      stepChats: {
        ...(nextWorkflow.stepChats || {}),
        [currentStep.id]: chatMessages,
      },
      stepSnapshots: [stepSnapshot, ...(nextWorkflow.stepSnapshots || [])],
      updated_at: snapshotCreatedAt,
    };

    setWorkflows((prev) => prev.map((workflow) => (workflow.id === workflowWithSnapshot.id ? workflowWithSnapshot : workflow)));
    setActiveWorkflow(workflowWithSnapshot);
    setRightPanelTab('outputs');
    switchActiveStep(workflowWithSnapshot, nextActiveStepIndex);
    await persistWorkflow(workflowWithSnapshot);
  };

  const handleCreateWorkflow = async () => {
    if (!activeWorkspaceId || !newWorkflowName.trim() || selectedSkills.length < 3) return;

    let stepIndex = 0;
    let parallelGroupCounter = 0;
    let activeParallelGroupId = '';
    let activeParallelGroupName = '';
    const steps = selectedSkills.map((skill, idx) => {
      const mode = selectedSkillModes[skill.id] || 'serial';
      const previousMode = idx > 0 ? selectedSkillModes[selectedSkills[idx - 1].id] || 'serial' : 'serial';
      const nextMode = idx < selectedSkills.length - 1 ? selectedSkillModes[selectedSkills[idx + 1].id] || 'serial' : 'serial';

      if (mode === 'serial') {
        if (idx > 0) stepIndex += 1;
        activeParallelGroupId = '';
        activeParallelGroupName = '';
        return {
          name: skill.name,
          skill_id: skill.id,
          step_index: stepIndex,
          runMode: 'serial' as const,
        };
      }

      if (previousMode !== 'parallel') {
        if (idx > 0) stepIndex += 1;
        parallelGroupCounter += 1;
        activeParallelGroupId = `parallel-${Date.now()}-${parallelGroupCounter}`;
        activeParallelGroupName = `并行任务组 ${parallelGroupCounter}`;
      }

      const currentStepIndex = stepIndex;
      if (nextMode !== 'parallel') {
        // The next serial step should depend on this parallel group.
        stepIndex += 0;
      }

      return {
        name: skill.name,
        skill_id: skill.id,
        step_index: currentStepIndex,
        runMode: 'parallel' as const,
        parallelGroupId: activeParallelGroupId,
        parallelGroupName: activeParallelGroupName,
      };
    });

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

      const createdWorkflow = data.workflow as Workflow;
      setWorkflows((prev) => [createdWorkflow, ...prev]);
      setActiveWorkflow(createdWorkflow);
      setActiveStepIndex(0);
      setChatMessages([]);
      setCreateDialogOpen(false);
      setNewWorkflowName('');
      setNewWorkflowDesc('');
      setSelectedSkills([]);
      setSelectedSkillModes({});
    } catch (error) {
      console.error('Create workflow error:', error);
      setErrorMessage(error instanceof Error ? error.message : '创建工作流失败');
    }
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

  const handleDeleteWorkspace = async (workspaceId: string) => {
    const workflowCount = workflows.filter((workflow) => workflow.workspaceId === workspaceId).length;
    if (workflowCount > 0 || workspaces.length <= 1) return;

    try {
      setErrorMessage('');
      const response = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_workspace', id: workspaceId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '删除工作目录失败');

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

  const handleOpenEditWorkflow = (workflow: Workflow) => {
    setEditingWorkflowId(workflow.id);
    setEditDialogOpen(true);
  };

  const handleCloneWorkflow = (workflow: Workflow) => {
    const timestamp = Date.now();
    const visibleSteps = getVisibleSteps(workflow);
    const firstVisibleStepId = visibleSteps[0]?.id;

    const clonedWorkflow: Workflow = {
      ...workflow,
      id: `wf-clone-${timestamp}`,
      name: `${workflow.name} 副本`,
      status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
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
    };

    setWorkflows((prev) => [clonedWorkflow, ...prev]);
    void persistWorkflow(clonedWorkflow);
  };

  const handleSoftRemoveStep = (workflowId: string, stepId: string) => {
    updateWorkflowById(workflowId, (workflow) => ({
      ...workflow,
      steps: workflow.steps.map((step) => (
        step.id === stepId
          ? { ...step, isRemoved: true, removedAt: new Date().toISOString() }
          : step
      )),
    }));
  };

  const handleRestoreStep = (workflowId: string, stepId: string) => {
    updateWorkflowById(workflowId, (workflow) => ({
      ...workflow,
      steps: workflow.steps.map((step) => (
        step.id === stepId
          ? { ...step, isRemoved: false, removedAt: undefined }
          : step
      )),
    }));
  };

  const handleUpdateStepRunMode = (workflowId: string, stepId: string, runMode: 'serial' | 'parallel') => {
    updateWorkflowById(workflowId, (workflow) => {
      const visibleSteps = getVisibleSteps(workflow);
      const stepPosition = visibleSteps.findIndex((step) => step.id === stepId);
      if (stepPosition < 0) return workflow;

      const targetStep = visibleSteps[stepPosition];
      const previousStep = visibleSteps[stepPosition - 1];
      const nextStep = visibleSteps[stepPosition + 1];
      const adjacentGroupId = previousStep?.parallelGroupId || nextStep?.parallelGroupId;
      const adjacentGroupName = previousStep?.parallelGroupName || nextStep?.parallelGroupName;
      const newGroupId = adjacentGroupId || `parallel-${Date.now()}-${stepId}`;
      const newGroupName = adjacentGroupName || `并行任务组 ${workflow.steps.filter((step) => step.runMode === 'parallel').length + 1}`;

      return {
        ...workflow,
        steps: workflow.steps.map((step) => {
          if (step.id !== targetStep.id) return step;

          if (runMode === 'serial') {
            return {
              ...step,
              runMode: 'serial',
              parallelGroupId: undefined,
              parallelGroupName: undefined,
            };
          }

          return {
            ...step,
            runMode: 'parallel',
            parallelGroupId: newGroupId,
            parallelGroupName: newGroupName,
          };
        }),
      };
    });
  };

  const handleAppendSkillToWorkflow = (workflowId: string, skill: Skill) => {
    updateWorkflowById(workflowId, (workflow) => {
      const maxStepIndex = workflow.steps.reduce((max, step) => Math.max(max, step.step_index), -1);
      const visibleSteps = getVisibleSteps(workflow);

      return {
        ...workflow,
        steps: [
          ...workflow.steps,
          {
            id: `step-${Date.now()}-${skill.id}`,
            name: skill.name,
            skill_id: skill.id,
            step_index: maxStepIndex + 1,
            runMode: 'serial',
            status: visibleSteps.length === 0 ? 'in_progress' : 'pending',
            output: null,
          },
        ],
      };
    });
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
          className={`flex min-h-56 min-w-0 flex-col overflow-hidden ${appCardClassName}`}
        >
          <CardHeader className="flex min-w-0 flex-col gap-3 pb-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <CardTitle className="line-clamp-2 text-base leading-snug">{wf.name}</CardTitle>
                <p className="mt-2 line-clamp-2 min-h-10 text-sm text-muted-foreground">
                  {wf.description || '未填写工作流说明'}
                </p>
              </div>
              <StatusBadge
                className="shrink-0"
                tone={wf.status === 'completed' ? 'success' : wf.status === 'in_progress' ? 'brand' : 'neutral'}
              >
                {wf.status === 'completed' ? '已完成' : wf.status === 'in_progress' ? '进行中' : '草稿'}
              </StatusBadge>
            </div>
            <div className="grid grid-cols-3 gap-2">
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
            </div>
          </CardHeader>
          <CardContent className="mt-auto min-w-0 overflow-hidden">
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
              {completedStepCount}/{visibleSteps.length} 步骤已完成
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
          title={openedWorkspace ? openedWorkspace.name : '工作流'}
          description={openedWorkspace
            ? openedWorkspace.description || '当前目录的工作流空间，在这里创建、进入和维护规划流程。'
            : '先选择工作目录，再进入目录内编排和推进工作流。'}
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
                  所有目录
                </Button>
                <Button className="w-full gap-2 sm:w-auto" onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                  新建工作流
                </Button>
              </div>
            ) : (
              <Button variant="outline" className="w-full gap-2 sm:w-auto" onClick={() => setWorkspaceDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                新建目录
              </Button>
            )
          )}
        />

        {errorMessage && (
          <Alert variant="destructive" className="mx-4 mt-4 md:mx-6">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        {!openedWorkspace ? (
          <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
              <div className="flex justify-end border-b border-border/40 pb-4">
                <StatusBadge tone="neutral" className="w-fit text-xs">
                  共 {workspaces.length} 个目录
                </StatusBadge>
              </div>

              {workspaces.length === 0 ? (
                <ProductEmptyState
                  icon={<Plus />}
                  title="暂无工作目录"
                  description="先创建一个目录，用来承载同一阶段或同一产品线下的工作流。"
                  className="min-h-80"
                  action={(
                    <Button size="sm" className="gap-1.5" onClick={() => setWorkspaceDialogOpen(true)}>
                      <Plus className="h-3.5 w-3.5" />
                      新建目录
                    </Button>
                  )}
                />
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {workspaces.map((workspace) => {
                    const workspaceWorkflowList = workflows.filter((workflow) => workflow.workspaceId === workspace.id);
                    const count = workspaceWorkflowList.length;
                    const inProgressCount = workspaceWorkflowList.filter((workflow) => workflow.status === 'in_progress').length;
                    const completedCount = workspaceWorkflowList.filter((workflow) => workflow.status === 'completed').length;
                    const canDeleteWorkspace = count === 0 && workspaces.length > 1;
                    const deleteDisabledReason = count > 0
                      ? '已有流程，不能删除'
                      : '至少保留一个目录';
                    const latestUpdatedAt = [workspace.updated_at, ...workspaceWorkflowList.map((workflow) => workflow.updated_at)]
                      .filter(Boolean)
                      .sort((a, b) => String(b).localeCompare(String(a)))[0];

                    return (
                      <Card
                        key={workspace.id}
                        className={`min-w-0 overflow-hidden ${appCardClassName}`}
                      >
                        <CardContent className="flex h-full flex-col gap-4 p-4">
                          <div className="flex min-w-0 items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="truncate text-base font-semibold">{workspace.name}</h3>
                              <p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted-foreground">
                                {workspace.description || '未填写目录说明'}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <StatusBadge tone="neutral" className="text-xs">
                                {count} 个流程
                              </StatusBadge>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8 text-muted-foreground"
                                    aria-label={`${workspace.name} 更多操作`}
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                  {canDeleteWorkspace ? (
                                    <DropdownMenuItem
                                      variant="destructive"
                                      onSelect={() => handleDeleteWorkspace(workspace.id)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      删除目录
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem disabled>
                                      <Trash2 className="h-4 w-4" />
                                      {deleteDisabledReason}
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-border/50 bg-muted/20 text-center text-xs">
                            <div className="min-w-0 border-r border-border/50 p-2">
                              <p className="font-semibold">{count}</p>
                              <p className="mt-0.5 text-muted-foreground">全部</p>
                            </div>
                            <div className="min-w-0 border-r border-border/50 p-2">
                              <p className="font-semibold text-primary">{inProgressCount}</p>
                              <p className="mt-0.5 text-muted-foreground">进行中</p>
                            </div>
                            <div className="min-w-0 p-2">
                              <p className="font-semibold text-emerald-500">{completedCount}</p>
                              <p className="mt-0.5 text-muted-foreground">已完成</p>
                            </div>
                          </div>

                          <div className="mt-auto flex flex-col gap-3">
                            <p className="truncate text-xs text-muted-foreground">
                              最近更新：{formatSnapshotTime(latestUpdatedAt)}
                            </p>
                            <div className="flex items-center gap-2">
                              <Button
                                className="min-w-0 flex-1 gap-2"
                                onClick={() => openWorkspaceSpace(workspace.id)}
                              >
                                进入空间
                                <ArrowRight className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
              <div className="flex flex-col gap-3 border-b border-border/40 pb-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">工作目录 / {openedWorkspace.name}</p>
                  <h2 className="mt-1 text-base font-semibold">工作流空间</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    当前目录内的全部工作流都集中在这里维护。
                  </p>
                </div>
                <StatusBadge tone="brand" className="w-fit text-xs">
                  {workspaceWorkflows.length} 个工作流
                </StatusBadge>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <Card className={appCardClassName}>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">全部工作流</p>
                    <p className="mt-2 text-2xl font-semibold">{workspaceWorkflows.length}</p>
                  </CardContent>
                </Card>
                <Card className={appCardClassName}>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">进行中</p>
                    <p className="mt-2 text-2xl font-semibold text-primary">{inProgressWorkflowCount}</p>
                  </CardContent>
                </Card>
                <Card className={appCardClassName}>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">已完成</p>
                    <p className="mt-2 text-2xl font-semibold text-emerald-500">{completedWorkflowCount}</p>
                  </CardContent>
                </Card>
                <Card className={appCardClassName}>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">启用步骤</p>
                    <p className="mt-2 text-2xl font-semibold">{totalEnabledStepCount}</p>
                  </CardContent>
                </Card>
              </div>

              {workspaceWorkflows.length === 0 ? (
                <ProductEmptyState
                  icon={<Play />}
                  title="当前目录暂无工作流"
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
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                    <label className="text-sm font-medium">编排方式</label>
                    <div className="space-y-2">
                      {selectedSkills.map((skill, idx) => (
                        <div
                          key={skill.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/20 p-2"
                        >
                          <div className="flex min-w-0 items-center gap-2">
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

        {/* Create Workspace Dialog */}
        <Dialog open={workspaceDialogOpen} onOpenChange={setWorkspaceDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新建工作目录</DialogTitle>
              <DialogDescription>工作流必须创建在某个工作目录内，便于按项目归档。</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">目录名称</label>
                <Input
                  placeholder="如：搜索体验优化专项"
                  value={newWorkspaceName}
                  onChange={(event) => setNewWorkspaceName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">目录说明</label>
                <Input
                  placeholder="简要说明目录对应的项目范围"
                  value={newWorkspaceDesc}
                  onChange={(event) => setNewWorkspaceDesc(event.target.value)}
                />
              </div>
              <Button className="w-full" disabled={!newWorkspaceName.trim()} onClick={handleCreateWorkspace}>
                创建目录
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
                  <div className="space-y-2">
                    {getVisibleSteps(editingWorkflow).map((step, idx) => (
                      <div
                        key={step.id}
                        className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 p-3"
                      >
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
                            {step.status === 'completed' ? '已完成' : step.status === 'in_progress' ? '进行中' : '未开始'}
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
      </div>
    );
  }

  // Active workflow view - Pipeline + Chat
  const visibleWorkflowSteps = getVisibleSteps(activeWorkflow);
  const currentStep = visibleWorkflowSteps[activeStepIndex] || visibleWorkflowSteps[0];
  const currentSkill = skills.find((s) => s.id === currentStep?.skill_id);
  const previousSteps = currentStep
    ? visibleWorkflowSteps.filter((step) => step.step_index < currentStep.step_index && step.output)
    : [];
  const currentContextSelection = currentStep
    ? getContextSelection(activeWorkflow, currentStep.id)
    : defaultContextSelection;
  const disabledAutoInjectedStepIds = currentContextSelection.disabledAutoInjectedStepIds || [];
  const autoInjectedPreviousSteps = previousSteps.filter((step) => !disabledAutoInjectedStepIds.includes(step.id));
  const autoInjectedPreviousStepIds = new Set(autoInjectedPreviousSteps.map((step) => step.id));
  const disabledAutoInjectedPreviousSteps = previousSteps.filter((step) => disabledAutoInjectedStepIds.includes(step.id));
  const reviewMaterials: ReviewMaterial[] = activeWorkflow.steps
    .filter((step) => !step.isRemoved && step.status === 'completed' && step.output)
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
  const parallelPeerSteps = currentStep?.parallelGroupId
    ? visibleWorkflowSteps.filter(
        (step) => step.parallelGroupId === currentStep.parallelGroupId && step.id !== currentStep.id && step.output
      )
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
  const currentStepReadyToConfirm = Boolean(
    currentStep?.status === 'in_progress' && chatMessages.some((message) => message.role === 'assistant'),
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
  const workflowStepGroups = Object.values(
    visibleWorkflowSteps.reduce<Record<string, WorkflowStep[]>>((groups, step) => {
      const key = step.runMode === 'parallel' && step.parallelGroupId
        ? `parallel-${step.parallelGroupId}`
        : `serial-${step.id}`;
      groups[key] = [...(groups[key] || []), step];
      return groups;
    }, {})
  );
  const renderStepOutputPreview = (step: WorkflowStep, options: { expanded?: boolean } = {}) => (
    <Card key={step.id} className={`${appCardClassName} mb-2`}>
      <CardContent className="p-3">
        <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
          <p className="min-w-0 truncate text-xs font-medium">{step.name}</p>
          {step.output && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 shrink-0 gap-1 px-1.5 text-[11px]"
              onClick={() => downloadStepOutput(step.name, step.output || '')}
            >
              <Download className="h-3 w-3" />
              下载
            </Button>
          )}
        </div>
        {step.output ? (
          <div className={`mt-3 min-w-0 overflow-hidden ${options.expanded ? '' : 'max-h-56'}`}>
            <CompactMarkdown
              content={buildStepOutputMarkdown(activeWorkflow, step)}
              className="text-xs leading-6 [&_p]:text-xs [&_li]:text-xs [&_table]:text-[11px]"
            />
          </div>
        ) : (
          <p className="mt-1 break-words text-xs text-muted-foreground">暂无产物。</p>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-auto lg:flex-row lg:overflow-hidden">
      {/* Left: Pipeline Panel */}
      <div className="flex max-h-80 min-h-0 w-full shrink-0 flex-col border-b border-border/40 lg:max-h-none lg:w-64 lg:border-b-0 lg:border-r xl:w-80">
        <div className="border-b border-border/40 p-4">
          <Button variant="ghost" size="sm" onClick={() => { setActiveWorkflow(null); setActiveStepIndex(-1); setChatMessages([]); }}>
            ← 返回列表
          </Button>
          <h2 className="mt-2 truncate font-semibold">{activeWorkflow.name}</h2>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{activeWorkflow.description}</p>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-3 p-4">
            {workflowStepGroups.map((group) => {
              const isParallelGroup = group.length > 1;
              const groupCompletedCount = group.filter((step) => step.status === 'completed').length;

              return (
                <div
                  key={isParallelGroup ? group[0].parallelGroupId : group[0].id}
                  className={isParallelGroup ? 'rounded-xl border border-border/50 bg-muted/20 p-2' : ''}
                >
                  {isParallelGroup && (
                    <div className="flex min-w-0 items-center justify-between gap-2 px-2 pb-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-muted-foreground">{group[0].parallelGroupName || '并行任务组'}</p>
                        <p className="text-[11px] text-muted-foreground/80">可自由切换并行推进</p>
                      </div>
                      <Badge variant="outline" className="text-[11px]">
                        并行 {groupCompletedCount}/{group.length}
                      </Badge>
                    </div>
                  )}

                  <div className="flex flex-col gap-1">
                    {group.map((step) => {
                      const idx = visibleWorkflowSteps.findIndex((item) => item.id === step.id);
                      const isActive = idx === activeStepIndex;
                      const isDisabled = step.status === 'pending' && !isActive;
                      const showNodeConfirm = step.id === currentStep?.id && currentStepReadyToConfirm;

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
                              {getStepIcon(step.status)}
                              <span className={`min-w-0 truncate text-sm font-medium ${isActive ? 'text-primary' : ''}`}>
                                {step.name}
                              </span>
                              {step.runMode === 'parallel' && (
                                <Badge variant="secondary" className="ml-auto text-[10px]">并行</Badge>
                              )}
                            </div>
                            {step.output && (
                              <p className="text-xs text-emerald-500/80 mt-1 ml-7 line-clamp-2">
                                已完成 — {compactMarkdownPreview(step.output, 50)}...
                              </p>
                            )}
                            {showNodeConfirm && (
                              <p className="mt-2 ml-7 text-[11px] leading-4 text-muted-foreground">
                                AI 已产出结果，可确认沉淀为 Markdown 文档。
                              </p>
                            )}
                          </button>
                          {showNodeConfirm && (
                            <div className="border-t border-primary/20 px-3 pb-3 pt-2">
                              <Button
                                size="sm"
                                className="h-8 w-full gap-1.5 text-xs"
                                onClick={() => {
                                  void handleConfirmStep();
                                }}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                确认完成
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
                const nextWorkflow: Workflow = {
                  ...activeWorkflow,
                  status: 'in_progress',
                  steps: activeWorkflow.steps.map((step) => (
                    step.id === currentStep.id
                      ? { ...step, status: 'in_progress', updated_at: updatedAt }
                      : step
                  )),
                  updated_at: updatedAt,
                };
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

        {/* Chat Messages */}
        <ScrollArea className="min-h-0 min-w-0 flex-1 p-4">
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
                      onClick={() => {
                        if (currentStep.output) {
                          navigator.clipboard.writeText(currentStep.output);
                        }
                      }}
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
                <CompactMarkdown content={currentStep.output} />
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
            <div className="min-w-0 max-w-full space-y-4 overflow-hidden">
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex min-w-0 max-w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`min-w-0 max-w-[min(100%,42rem)] overflow-hidden break-words rounded-lg p-3 text-sm md:max-w-[min(80%,42rem)] ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/50 border border-border/40'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      <CompactMarkdown content={msg.content} />
                    ) : (
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    )}
                  </div>
                </div>
              ))}
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
                <div className="rounded-lg border border-border/50 bg-background/60 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium">本轮将注入的上下文</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        知识库会按当前问题检索片段；产物和本地文件会直接作为上下文发送。
                      </p>
                    </div>
                    {unavailableKnowledgeBaseCount > 0 && (
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
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedContextCount === 0 && unavailableKnowledgeBaseCount === 0 ? (
                      <span className="text-xs text-muted-foreground">未选择补充上下文。</span>
                    ) : null}
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
                                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                                  {kb.description || '未填写知识库说明'}
                                </p>
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
                          <div className="mt-3 flex flex-col gap-2">
                            {previousSteps.map((step) => {
                              const enabled = !disabledAutoInjectedStepIds.includes(step.id);
                              return (
                                <div
                                  key={step.id}
                                  className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${
                                    enabled ? 'border-primary/50 bg-primary/10' : 'border-border/50 bg-muted/20'
                                  }`}
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

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="输入你的问题或指令..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onPaste={handlePasteContextFiles}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
              disabled={isStreaming}
              className="min-w-0 flex-1"
            />
            <Button className="sm:w-auto" onClick={handleSendMessage} disabled={isStreaming || !chatInput.trim()}>
              {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Right: Context Panel */}
      <div className="flex max-h-[32rem] min-h-0 w-full shrink-0 flex-col overflow-hidden border-t border-border/40 lg:h-full lg:max-h-none lg:w-72 lg:border-l lg:border-t-0 xl:w-80">
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
            <TabsList className="mt-3 grid h-8 w-full grid-cols-4">
              <TabsTrigger value="skill" className="text-xs">Skill</TabsTrigger>
              <TabsTrigger value="outputs" className="text-xs">产出</TabsTrigger>
              <TabsTrigger value="review" className="text-xs">审核</TabsTrigger>
              <TabsTrigger value="archive" className="text-xs">沉淀</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="skill" className="min-h-0 flex-1 overflow-hidden">
            <div className="flex h-full min-w-0 flex-col gap-4 overflow-y-auto p-4">
              {currentSkill ? (
                <Card className={appCardClassName}>
                  <CardContent className="p-3">
                    <p className="text-sm font-medium">{currentSkill.name}</p>
                    <p className="mt-2 break-words text-xs leading-5 text-muted-foreground">{currentSkill.description}</p>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {currentSkill.tools.map((tool) => (
                        <Badge key={tool} variant="secondary" className="text-xs">{tool}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
                  选择一个步骤后查看 Skill 信息。
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
                    renderStepOutputPreview(currentStep, { expanded: true })
                  ) : (
                    <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
                      当前步骤确认完成后，会在这里展示本步骤产出。
                    </p>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h4 className="min-w-0 truncate text-xs font-medium text-muted-foreground">前序步骤产出</h4>
                    <Badge variant="outline" className="shrink-0 text-[11px]">{previousSteps.length} 个</Badge>
                  </div>
                  {previousSteps.length > 0 ? (
                    previousSteps.map((step) => renderStepOutputPreview(step))
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
                    {parallelPeerSteps.map((step) => renderStepOutputPreview(step))}
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
                    <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card/70 p-3">
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">{activeWorkflow.name} 最终产出</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            来自最后一个步骤{finalWorkflowOutputSteps.length > 1 ? '组' : ''}的已确认产物。
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 shrink-0 gap-1.5 text-xs"
                          onClick={() => downloadWorkflowFinalOutput(activeWorkflow, finalWorkflowOutputSteps)}
                        >
                          <Download className="h-3.5 w-3.5" />
                          下载
                        </Button>
                      </div>
                      <div className="flex flex-col gap-2">
                        {finalWorkflowOutputSteps.map((step) => renderStepOutputPreview(step))}
                      </div>
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
                      最后一个步骤确认完成后，这里会自动汇总为工作流最终产出。
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
