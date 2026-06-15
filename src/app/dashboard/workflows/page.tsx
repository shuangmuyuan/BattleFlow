'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ClipboardEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  History,
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

const knowledgeBaseOptions: KnowledgeBaseOption[] = [
  { id: 'company-methodology', name: '产品方法论库', description: 'PRD、竞品分析、需求拆解方法论' },
  { id: 'industry-research', name: '行业研究库', description: '电商、社交、直播业务研究材料' },
  { id: 'customer-feedback', name: '用户反馈库', description: '访谈纪要、工单反馈、调研问卷' },
];

const defaultContextSelection: WorkflowContextSelection = {
  knowledgeBaseIds: ['industry-research'],
  reviewMaterialIds: [],
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
  const [selectedKnowledgeBaseIds, setSelectedKnowledgeBaseIds] = useState<string[]>(['industry-research']);
  const [selectedReviewMaterialIds, setSelectedReviewMaterialIds] = useState<string[]>([]);
  const [uploadedContextFiles, setUploadedContextFiles] = useState<UploadedContextFile[]>([]);
  const [reviewedOutputFiles, setReviewedOutputFiles] = useState<ReviewedOutputFile[]>([]);
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
  const [supplementalContextOpen, setSupplementalContextOpen] = useState(false);
  const [snapshotDialogOpen, setSnapshotDialogOpen] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<WorkflowStepSnapshot | null>(null);
  const [archivedReviewStepIds, setArchivedReviewStepIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reviewedOutputInputRef = useRef<HTMLInputElement>(null);

  const getVisibleSteps = (workflow: Workflow) => workflow.steps.filter((step) => !step.isRemoved);

  const getContextSelection = (workflow: Workflow, stepId?: string): WorkflowContextSelection => (
    stepId && workflow.contextSelections?.[stepId]
      ? workflow.contextSelections[stepId]
      : defaultContextSelection
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

  const openWorkflow = (workflow: Workflow) => {
    setActiveWorkflow(workflow);
    const visibleSteps = getVisibleSteps(workflow);
    const firstInProgress = visibleSteps.findIndex((step) => step.status === 'in_progress');
    const nextStepIndex = firstInProgress >= 0 ? firstInProgress : 0;
    setActiveStepIndex(nextStepIndex);
    syncWorkflowSupportingState(workflow, nextStepIndex);
    setChatMessages([]);
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

  useEffect(() => {
    loadWorkflowState();
  }, [loadWorkflowState]);

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

  const downloadStepOutput = (stepName: string, output: string) => {
    const fileName = `${activeWorkflow?.name || '工作流'}-${stepName}.md`.replace(/[\\/:*?"<>|]/g, '-');
    const content = `# ${stepName}\n\n${output}`;
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

    const selectedKnowledgeBases = knowledgeBaseOptions
      .filter((kb) => knowledgeBaseIds.includes(kb.id))
      .map((kb) => `知识库：${kb.name}（${kb.description}）`);
    const stepContextFiles = (workflow.contextFiles || [])
      .filter((file) => file.stepId === step.id)
      .map((file) => summarizeWorkflowFile(file, 800));
    const selectedStepMaterials = workflow.steps
      .filter((item) => !item.isRemoved && selectedReviewIds.has(item.id) && item.output)
      .map((item) => `${item.name}产物\n${item.output?.slice(0, 1200)}${(item.output?.length || 0) > 1200 ? '\n...（已截断）' : ''}`);
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
      reviewedMaterials: [...selectedStepMaterials, ...selectedUploadedMaterials, ...currentStepReviewedFiles],
      reviewComment: reviewComment || undefined,
      created_at: createdAt,
    };
  };

  const handleSendMessage = useCallback(async () => {
    if (!chatInput.trim() || isStreaming) return;

    const userMessage = chatInput.trim();
    const currentStepForContext = activeWorkflow ? getVisibleSteps(activeWorkflow)[activeStepIndex] : undefined;
    const currentStepContextFiles = currentStepForContext
      ? uploadedContextFiles.filter((file) => file.stepId === currentStepForContext.id)
      : [];
    const selectedKnowledgeBases = knowledgeBaseOptions.filter((kb) => selectedKnowledgeBaseIds.includes(kb.id));
    const selectedReviewMaterials = activeWorkflow?.steps
      .filter((step) => !step.isRemoved && selectedReviewMaterialIds.includes(step.id) && step.output)
      .map((step) => ({
        name: step.name,
        source: '工作流已评审产物',
        summary: step.output?.slice(0, 400) || '',
      })) || [];
    const selectedUploadedReviewMaterials = reviewedOutputFiles
      .filter((file) => selectedReviewMaterialIds.includes(file.id))
      .map((file) => ({
        name: file.name,
        source: '本地上传审核产物',
        summary: summarizeWorkflowFile(file, 1200),
      }));
    const contextSummary = [
      selectedKnowledgeBases.length > 0
        ? `选中的知识库：${selectedKnowledgeBases.map((kb) => `${kb.name}（${kb.description}）`).join('；')}`
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

    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsStreaming(true);

    try {
      const currentStep = activeWorkflow ? getVisibleSteps(activeWorkflow)[activeStepIndex] : undefined;
      const stepContext = activeWorkflow?.steps
        .filter((s) => currentStep && !s.isRemoved && s.step_index < currentStep.step_index && s.output)
        .map((s) => ({ step_name: s.name, step_output: s.output })) || [];

      const skillDef = skills.find((s) => s.id === currentStep?.skill_id);

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...chatMessages, { role: 'user', content: messageWithContext }].map((m) => ({
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
          step_context: stepContext,
          selected_knowledge_bases: selectedKnowledgeBases,
          selected_review_materials: [...selectedReviewMaterials, ...selectedUploadedReviewMaterials],
          uploaded_files: currentStepContextFiles.map(({ previewUrl, ...file }) => file),
        }),
      });

      if (!response.ok || !response.body) throw new Error('Chat request failed');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      setChatMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

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
              setChatMessages((prev) => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1] = {
                  role: 'assistant',
                  content: assistantContent,
                };
                return newMessages;
              });
            }
            if (data.done) break;
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '抱歉，对话出现了问题，请重试。' },
      ]);
    } finally {
      setIsStreaming(false);
    }
  }, [
    chatInput,
    chatMessages,
    isStreaming,
    activeWorkflow,
    activeStepIndex,
    skills,
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

    const { workflow: nextWorkflow, nextActiveStepIndex } = completeWorkflowStep(
      activeWorkflow,
      currentStep.id,
      lastAssistantMsg.content,
    );
    const snapshotCreatedAt = new Date().toISOString();
    const stepSnapshot = buildStepSnapshot(activeWorkflow, currentStep, lastAssistantMsg.content, snapshotCreatedAt);
    const workflowWithSnapshot = {
      ...nextWorkflow,
      stepSnapshots: [stepSnapshot, ...(nextWorkflow.stepSnapshots || [])],
      updated_at: snapshotCreatedAt,
    };

    setWorkflows((prev) => prev.map((workflow) => (workflow.id === workflowWithSnapshot.id ? workflowWithSnapshot : workflow)));
    setActiveWorkflow(workflowWithSnapshot);
    setActiveStepIndex(nextActiveStepIndex);
    syncWorkflowSupportingState(workflowWithSnapshot, nextActiveStepIndex);
    setChatMessages([]);
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
    const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) || null;
    const workspaceWorkflows = workflows.filter((workflow) => workflow.workspaceId === activeWorkspaceId);
    const editingWorkflow = editingWorkflowId
      ? workspaceWorkflows.find((workflow) => workflow.id === editingWorkflowId) || null
      : null;

    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b border-border/40 p-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">工作流</h1>
            <p className="text-muted-foreground text-sm mt-1">先建立工作目录，再在目录内创建规划工作流</p>
          </div>
        </div>

        {errorMessage && (
          <div className="mx-6 mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        <div className="shrink-0 border-b border-border/40 px-6 py-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">1. 工作目录</h2>
              <p className="text-xs text-muted-foreground mt-1">先新建或选择工作目录，工作流只能在目录内创建和查看。</p>
            </div>
            <div className="flex items-center gap-2">
              {activeWorkspace && (
                <Badge variant="secondary" className="text-xs">
                  当前目录：{activeWorkspace.name}
                </Badge>
              )}
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setWorkspaceDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                新建目录
              </Button>
            </div>
          </div>
          {workspaces.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/70 p-5 text-center">
              <p className="text-sm font-medium">暂无工作目录</p>
              <p className="mt-1 text-xs text-muted-foreground">请先创建工作目录，再继续创建工作流。</p>
              <Button size="sm" className="mt-3 gap-1.5" onClick={() => setWorkspaceDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                新建目录
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {workspaces.map((workspace) => {
                const selected = workspace.id === activeWorkspaceId;
                const count = workflows.filter((workflow) => workflow.workspaceId === workspace.id).length;

                return (
                  <button
                    key={workspace.id}
                    type="button"
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      selected ? 'border-primary bg-primary/10' : 'border-border/60 hover:border-primary/50 hover:bg-muted/40'
                    }`}
                    onClick={() => {
                      setActiveWorkspaceId(workspace.id);
                      setEditingWorkflowId(null);
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{workspace.name}</p>
                      <div className="flex items-center gap-1">
                        <Badge variant={selected ? 'default' : 'outline'} className="text-[10px]">
                          {count} 个流程
                        </Badge>
                        {count === 0 && workspaces.length > 1 && (
                          <span
                            role="button"
                            tabIndex={0}
                            className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteWorkspace(workspace.id);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                event.stopPropagation();
                                handleDeleteWorkspace(workspace.id);
                              }
                            }}
                            aria-label={`删除目录 ${workspace.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{workspace.description}</p>
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-4 flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 p-3">
            <div>
              <h2 className="text-sm font-semibold">2. 当前目录内创建工作流</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {activeWorkspace ? `创建位置：${activeWorkspace.name}` : '请先创建或选择工作目录'}
              </p>
            </div>
            <Button className="gap-2" disabled={!activeWorkspace} onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              新建工作流
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-6">
          {!activeWorkspace ? (
            <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
              <Plus className="mb-4 h-12 w-12 opacity-30" />
              <p>请先新建工作目录</p>
              <p className="mt-1 text-sm">工作流必须归属到一个工作目录后才能创建</p>
            </div>
          ) : workspaceWorkflows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Play className="h-12 w-12 mb-4 opacity-30" />
              <p>暂无工作流</p>
              <p className="text-sm mt-1">在当前工作目录内新建工作流</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {workspaceWorkflows.map((wf) => {
                const visibleSteps = getVisibleSteps(wf);
                const removedStepCount = wf.steps.filter((step) => step.isRemoved).length;
                const completedStepCount = visibleSteps.filter((step) => step.status === 'completed').length;
                const compactSteps = visibleSteps.length > 6
                  ? visibleSteps.slice(0, 5)
                  : visibleSteps;
                const trailingStep = visibleSteps.length > 6 ? visibleSteps[visibleSteps.length - 1] : null;
                const hiddenStepCount = visibleSteps.length - compactSteps.length - (trailingStep ? 1 : 0);
                const progressItems = trailingStep ? [...compactSteps, trailingStep] : compactSteps;

                return (
                  <Card
                    key={wf.id}
                    className="min-w-0 cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
                    onClick={() => openWorkflow(wf)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                        <CardTitle className="min-w-24 flex-1 truncate text-base">{wf.name}</CardTitle>
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <Badge
                            variant={wf.status === 'completed' ? 'default' : wf.status === 'in_progress' ? 'secondary' : 'outline'}
                          >
                            {wf.status === 'completed' ? '已完成' : wf.status === 'in_progress' ? '进行中' : '草稿'}
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 px-2 text-xs"
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
                            className="h-7 gap-1 px-2 text-xs"
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
                            className="h-7 gap-1 px-2 text-xs"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleCloneWorkflow(wf);
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                            克隆
                          </Button>
                        </div>
                      </div>
                      <p className="truncate text-sm text-muted-foreground">{wf.description}</p>
                    </CardHeader>
                    <CardContent className="min-w-0 overflow-hidden">
                      <div className="flex max-w-full flex-wrap items-center gap-x-1 gap-y-1">
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
              })}
            </div>
          )}
        </div>

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
                  {skills.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
                      暂无可用 Skill，请先到 Skill 仓库导入或发布 Skill。
                    </div>
                  ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {skills.map((skill) => {
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
          <DialogContent className="flex max-w-3xl flex-col gap-0 overflow-hidden p-0">
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
                  <div className="grid grid-cols-2 gap-2">
                    {skills.map((skill) => (
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
  const reviewMaterials: ReviewMaterial[] = activeWorkflow.steps
    .filter((step) => !step.isRemoved && step.status === 'completed' && step.output)
    .map((step) => ({
      id: step.id,
      name: `${step.name}产物`,
      source: activeWorkflow.name,
      summary: step.output?.slice(0, 120).replace(/[#*\n]/g, ' ') || '',
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
  const currentStepSnapshots = currentStep
    ? (activeWorkflow.stepSnapshots || [])
      .filter((snapshot) => snapshot.stepId === currentStep.id)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    : [];
  const currentReviewComment = currentStep ? reviewComments[currentStep.id]?.trim() || '' : '';
  const canArchiveReviewedOutput = currentReviewedOutputFiles.length > 0 || currentReviewComment.length > 0;
  const isReviewedOutputArchived = currentStep ? archivedReviewStepIds.includes(currentStep.id) : false;
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
  const workflowStepGroups = Object.values(
    visibleWorkflowSteps.reduce<Record<string, WorkflowStep[]>>((groups, step) => {
      const key = step.runMode === 'parallel' && step.parallelGroupId
        ? `parallel-${step.parallelGroupId}`
        : `serial-${step.id}`;
      groups[key] = [...(groups[key] || []), step];
      return groups;
    }, {})
  );

  return (
    <div className="flex h-full min-w-0 flex-col overflow-auto lg:flex-row lg:overflow-hidden">
      {/* Left: Pipeline Panel */}
      <div className="flex max-h-80 w-full shrink-0 flex-col border-b border-border/40 lg:max-h-none lg:w-80 lg:border-b-0 lg:border-r">
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

                      return (
                        <div
                          key={step.id}
                          className={`p-3 rounded-lg transition-colors ${
                            isActive ? 'bg-primary/10 border border-primary/30' : isDisabled ? 'opacity-60' : 'hover:bg-muted/50 cursor-pointer'
                          }`}
                          onClick={() => {
                            if (!isDisabled) {
                              setActiveStepIndex(idx);
                              syncWorkflowSupportingState(activeWorkflow, idx);
                              setChatMessages([]);
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
                              已完成 — {step.output.slice(0, 50).replace(/[#*\n]/g, ' ')}...
                            </p>
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
      <div className="flex min-h-[70vh] min-w-0 flex-1 flex-col lg:min-h-0">
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
          {currentStep?.status === 'completed' && chatMessages.length === 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                // Re-enter conversation mode for this completed step
                setActiveWorkflow((prev) => {
                  if (!prev) return prev;
                  const newSteps = [...prev.steps];
                  newSteps[activeStepIndex] = { ...newSteps[activeStepIndex], status: 'in_progress' };
                  return { ...prev, steps: newSteps };
                });
                setChatMessages([]);
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
              <span>前序步骤产出已作为上下文输入:</span>
              {previousSteps.map((s, i) => (
                <Badge key={s.id} variant="outline" className="text-xs">
                  {s.name}
                  {i < previousSteps.length - 1 && ' →'}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Chat Messages */}
        <ScrollArea className="min-h-0 flex-1 p-4">
          {currentStep?.status === 'completed' && currentStep.output && chatMessages.length === 0 ? (
            /* Show completed step output */
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <h3 className="font-semibold">本步骤已完成</h3>
              </div>
              <div className="min-w-0 rounded-lg border border-border/40 bg-muted/50 p-4">
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
                <div className="prose prose-sm max-w-none whitespace-pre-wrap break-words text-sm leading-relaxed dark:prose-invert">
                  {currentStep.output}
                </div>
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
            <div className="space-y-4">
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`min-w-0 max-w-[min(80%,42rem)] break-words rounded-lg p-3 text-sm ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/50 border border-border/40'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>
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

        {/* Confirm Step Bar - show when AI has responded */}
        {currentStep?.status === 'in_progress' && chatMessages.some((m) => m.role === 'assistant') && (
          <div className="border-t border-primary/30 bg-primary/5 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                当前步骤的 AI 协作已产出结果，确认后将保存产出{currentStep.runMode === 'parallel' ? '，可继续切换其他并行任务' : '并推进到下一步'}
              </p>
              <Button className="shrink-0 gap-2" onClick={handleConfirmStep}>
                <CheckCircle2 className="h-4 w-4" />
                确认完成
              </Button>
            </div>
          </div>
        )}

        {/* Chat Input */}
        <div className="flex flex-col gap-3 border-t border-border/40 p-4">
          <div className="flex flex-col gap-3 rounded-lg border border-border/40 bg-muted/20 p-3">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 text-left"
              onClick={() => setSupplementalContextOpen((prev) => !prev)}
              aria-expanded={supplementalContextOpen}
            >
              <div className="flex min-w-0 items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">补充上下文</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {selectedKnowledgeBaseIds.length} 个知识库 · {selectedReviewMaterialIds.length} 个评审材料 · {currentContextFiles.length} 个本地文件
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-muted-foreground">{supplementalContextOpen ? '收起' : '展开'}</span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${supplementalContextOpen ? 'rotate-180' : ''}`} />
              </div>
            </button>
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
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">为当前步骤补充可引用的上下文材料。</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    上传文件
                  </Button>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Database className="h-3.5 w-3.5" />
                    <span>选择知识库</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {knowledgeBaseOptions.map((kb) => {
                      const selected = selectedKnowledgeBaseIds.includes(kb.id);
                      return (
                        <Button
                          key={kb.id}
                          type="button"
                          variant={selected ? 'default' : 'outline'}
                          size="sm"
                          className="h-7 text-xs"
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
                          {kb.name}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ClipboardCheck className="h-3.5 w-3.5" />
                    <span>选择工作流内已评审材料</span>
                  </div>
                  {reviewMaterials.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {reviewMaterials.map((material) => {
                        const selected = selectedReviewMaterialIds.includes(material.id);
                        return (
                          <Button
                            key={material.id}
                            type="button"
                            variant={selected ? 'default' : 'outline'}
                            size="sm"
                            className="h-7 max-w-full text-xs"
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
                            {material.name}
                          </Button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">当前工作流暂无已完成产物。</p>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Paperclip className="h-3.5 w-3.5" />
                    <span>本地文件</span>
                    <span className="text-muted-foreground/70">支持 .txt、.md、图片，可直接复制粘贴图片到输入框</span>
                  </div>
                  {currentContextFiles.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {currentContextFiles.map((file) => (
                        <div
                          key={file.id}
                          className="inline-flex max-w-full items-center gap-2 rounded-md border border-border/50 bg-background/60 px-2 py-1 text-xs"
                        >
                          {file.isImage ? (
                            <ImageIcon className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          <span className="truncate max-w-40">{file.name}</span>
                          <span className="text-muted-foreground">{formatFileSize(file.size)}</span>
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => removeContextFile(file.id)}
                            aria-label={`移除 ${file.name}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">暂无上传文件。</p>
                  )}
                </div>
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
      <div className="flex max-h-[32rem] w-full shrink-0 flex-col overflow-hidden border-t border-border/40 lg:max-h-none lg:w-80 lg:border-l lg:border-t-0">
        <div className="border-b border-border/40 p-4">
          <h3 className="font-semibold text-sm">上下文面板</h3>
        </div>
        <ScrollArea className="flex-1">
          <div className="min-w-0 p-4 space-y-4">
            {/* Current Skill Info */}
            {currentSkill && (
              <div className="min-w-0">
                <h4 className="text-xs font-medium text-muted-foreground mb-2">当前 Skill</h4>
                <Card className="border-border/40">
                  <CardContent className="p-3">
                    <p className="font-medium text-sm">{currentSkill.name}</p>
                    <p className="mt-1 break-words text-xs text-muted-foreground">{currentSkill.description}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {currentSkill.tools.map((tool) => (
                        <Badge key={tool} variant="secondary" className="text-xs">{tool}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Previous Step Outputs */}
            {previousSteps.length > 0 && (
              <div className="min-w-0">
                <h4 className="text-xs font-medium text-muted-foreground mb-2">前序步骤产出</h4>
                {previousSteps.map((step) => (
                  <Card key={step.id} className="border-border/40 mb-2">
                    <CardContent className="p-3">
                      <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
                        <p className="min-w-0 truncate font-medium text-xs">{step.name}</p>
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
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-4">{step.output}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Parallel Peer Outputs */}
            {parallelPeerSteps.length > 0 && (
              <div className="min-w-0">
                <h4 className="text-xs font-medium text-muted-foreground mb-2">并行任务产出</h4>
                {parallelPeerSteps.map((step) => (
                  <Card key={step.id} className="border-border/40 mb-2">
                    <CardContent className="p-3">
                      <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
                        <p className="min-w-0 truncate font-medium text-xs">{step.name}</p>
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
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-4">{step.output}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Step Snapshots */}
            {currentStep && (
              <div className="min-w-0">
                <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
                  <h4 className="min-w-0 truncate text-xs font-medium text-muted-foreground">历史快照</h4>
                  <Badge variant="outline" className="shrink-0 text-[11px]">
                    {currentStepSnapshots.length} 条
                  </Badge>
                </div>
                <Card className="border-border/40">
                  <CardContent className="space-y-2 p-3">
                    {currentStepSnapshots.length > 0 ? (
                      currentStepSnapshots.map((snapshot) => (
                        <button
                          key={snapshot.id}
                          type="button"
                          className="w-full rounded-md border border-border/50 bg-background/60 p-2 text-left transition-colors hover:border-primary/50 hover:bg-muted/40"
                          onClick={() => {
                            setSelectedSnapshot(snapshot);
                            setSnapshotDialogOpen(true);
                          }}
                        >
                          <div className="flex min-w-0 items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <History className="h-3.5 w-3.5 shrink-0 text-primary" />
                              <span className="truncate text-xs font-medium">{formatSnapshotTime(snapshot.created_at)}</span>
                            </div>
                            <span className="shrink-0 text-[11px] text-muted-foreground">查看</span>
                          </div>
                          <p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">
                            {snapshot.output.replace(/[#*\n]/g, ' ').slice(0, 120)}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground/80">
                            上下文 {snapshot.contextFiles.length} · 审核材料 {snapshot.reviewedMaterials.length}
                          </p>
                        </button>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        确认完成当前步骤后，会自动保存产出、上下文和审核反馈快照。
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Reviewed Output Upload */}
            {currentStep && (
              <div className="min-w-0">
                <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
                  <h4 className="min-w-0 truncate text-xs font-medium text-muted-foreground">产物审核反馈</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 shrink-0 gap-1.5 text-xs"
                    onClick={() => reviewedOutputInputRef.current?.click()}
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    上传已审核产物
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
                <Card className="border-border/40">
                  <CardContent className="space-y-3 p-3">
                    <p className="break-words text-xs text-muted-foreground">
                      下载产物并在本地完成评审后，上传已审核版本，同时填写审核评论，后续可用于优化 Skill。
                    </p>

                    {currentReviewedOutputFiles.length > 0 ? (
                      <div className="space-y-2">
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
                      <p className="text-xs text-muted-foreground">暂无已审核产物。</p>
                    )}

                    <textarea
                      className="min-h-20 w-full rounded-md border border-border/60 bg-background/60 px-3 py-2 text-xs outline-none placeholder:text-muted-foreground focus:border-primary/50"
                      placeholder="填写审核评论，例如：结论是否充分、哪些地方需要补充、Skill 输出模板是否需要调整..."
                      value={reviewComments[currentStep.id] || ''}
                      onChange={(event) => updateReviewComment(currentStep.id, event.target.value)}
                    />

                    <div className="flex min-w-0 items-center justify-between gap-2 border-t border-border/40 pt-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium">归档知识库</p>
                        <p className="mt-0.5 break-words text-[11px] leading-snug text-muted-foreground">
                          {isReviewedOutputArchived
                            ? '已归档，可在后续上下文中选择引用。'
                            : '将已审核产物和评论沉淀为可复用材料。'}
                        </p>
                      </div>
                      <Button
                        variant={isReviewedOutputArchived ? 'secondary' : 'outline'}
                        size="sm"
                        className="h-7 shrink-0 gap-1.5 text-xs"
                        disabled={!canArchiveReviewedOutput || isReviewedOutputArchived}
                        onClick={() => archiveReviewedOutput(currentStep.id)}
                      >
                        <Save className="h-3.5 w-3.5" />
                        {isReviewedOutputArchived ? '已归档' : '归档'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Save to Knowledge Base */}
            {currentStep?.output && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2">沉淀到知识库</h4>
                <Button variant="outline" size="sm" className="w-full gap-2">
                  <Save className="h-3.5 w-3.5" />
                  保存产出物
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <Dialog
        open={snapshotDialogOpen}
        onOpenChange={(open) => {
          setSnapshotDialogOpen(open);
          if (!open) setSelectedSnapshot(null);
        }}
      >
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border/40 px-6 py-5 pr-12">
            <DialogTitle>{selectedSnapshot?.stepName || '步骤快照'}</DialogTitle>
            <DialogDescription>
              {selectedSnapshot
                ? `${formatSnapshotTime(selectedSnapshot.created_at)} 确认时保存的产出、上下文和审核反馈。`
                : '查看步骤确认时保存的历史记录。'}
            </DialogDescription>
          </DialogHeader>

          {selectedSnapshot && (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <section className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">步骤产出</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => downloadStepOutput(selectedSnapshot.stepName, selectedSnapshot.output)}
                  >
                    <Download className="h-3.5 w-3.5" />
                    下载
                  </Button>
                </div>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-border/50 bg-muted/30 p-3 font-sans text-xs leading-relaxed">
                  {selectedSnapshot.output}
                </pre>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">确认时上下文</h3>
                {selectedSnapshot.contextFiles.length > 0 ? (
                  <div className="space-y-2">
                    {selectedSnapshot.contextFiles.map((item, index) => (
                      <pre
                        key={`${selectedSnapshot.id}-context-${index}`}
                        className="whitespace-pre-wrap rounded-md border border-border/40 bg-background/60 p-2 font-sans text-xs leading-relaxed text-muted-foreground"
                      >
                        {item}
                      </pre>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed border-border/50 p-3 text-xs text-muted-foreground">
                    该快照未记录补充上下文。
                  </p>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">审核材料</h3>
                {selectedSnapshot.reviewedMaterials.length > 0 ? (
                  <div className="space-y-2">
                    {selectedSnapshot.reviewedMaterials.map((item, index) => (
                      <pre
                        key={`${selectedSnapshot.id}-review-${index}`}
                        className="whitespace-pre-wrap rounded-md border border-border/40 bg-background/60 p-2 font-sans text-xs leading-relaxed text-muted-foreground"
                      >
                        {item}
                      </pre>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed border-border/50 p-3 text-xs text-muted-foreground">
                    该快照未关联审核材料。
                  </p>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">审核评论</h3>
                {selectedSnapshot.reviewComment ? (
                  <p className="whitespace-pre-wrap rounded-md border border-border/40 bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                    {selectedSnapshot.reviewComment}
                  </p>
                ) : (
                  <p className="rounded-md border border-dashed border-border/50 p-3 text-xs text-muted-foreground">
                    该快照未填写审核评论。
                  </p>
                )}
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
