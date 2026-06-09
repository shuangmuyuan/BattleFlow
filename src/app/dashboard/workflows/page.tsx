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
}

interface Workflow {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  status: 'draft' | 'in_progress' | 'completed';
  steps: WorkflowStep[];
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
  name: string;
  type: string;
  size: number;
  isImage: boolean;
  previewUrl?: string;
}

interface ReviewedOutputFile {
  id: string;
  stepId: string;
  name: string;
  type: string;
  size: number;
}

interface Workspace {
  id: string;
  name: string;
  description: string;
}

const knowledgeBaseOptions: KnowledgeBaseOption[] = [
  { id: 'company-methodology', name: '产品方法论库', description: 'PRD、竞品分析、需求拆解方法论' },
  { id: 'industry-research', name: '行业研究库', description: '电商、社交、直播业务研究材料' },
  { id: 'customer-feedback', name: '用户反馈库', description: '访谈纪要、工单反馈、调研问卷' },
];

const initialWorkspaces: Workspace[] = [
  { id: 'ecommerce-v3', name: '电商平台 v3.0', description: '下一版本核心能力规划' },
  { id: 'member-growth', name: '会员增长项目', description: '会员体系与增长策略规划' },
  { id: 'payment-refactor', name: '支付重构专项', description: '支付链路与风控体验优化' },
];

export default function WorkflowsPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(initialWorkspaces);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(initialWorkspaces[0].id);
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
  const [archivedReviewStepIds, setArchivedReviewStepIds] = useState<string[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reviewedOutputInputRef = useRef<HTMLInputElement>(null);

  const getVisibleSteps = (workflow: Workflow) => workflow.steps.filter((step) => !step.isRemoved);

  const updateWorkflowById = useCallback((workflowId: string, updater: (workflow: Workflow) => Workflow) => {
    setWorkflows((prev) => prev.map((workflow) => (
      workflow.id === workflowId ? updater(workflow) : workflow
    )));
    setActiveWorkflow((prev) => {
      if (!prev || prev.id !== workflowId) return prev;
      return updater(prev);
    });
  }, []);

  // Load demo data
  useEffect(() => {
    const demoSkills: Skill[] = [
      {
        id: '1',
        name: '市场洞察',
        description: '从行业趋势、市场规模、用户需求变化等维度洞察市场机会',
        methodology: '1. 行业趋势扫描\n2. 市场规模估算\n3. 用户需求变化分析\n4. 机会点提炼',
        tools: ['web_search', 'knowledge_query', 'data_query'],
        outputs: { format: 'structured_report', sections: ['trends', 'market_size', 'user_needs', 'opportunities'] },
        checklist: ['引用数据来源', '趋势有量化支撑', '机会点可执行'],
        tags: ['市场', '洞察'],
      },
      {
        id: '2',
        name: '竞品分析',
        description: '系统性分析竞品产品功能、市场定位和差异化策略',
        methodology: '1. 确定竞品范围\n2. 功能矩阵对比\n3. 用户体验评估\n4. 差异化策略制定',
        tools: ['web_search', 'knowledge_query'],
        outputs: { format: 'structured_report', sections: ['overview', 'feature_matrix', 'swot', 'strategy'] },
        checklist: ['至少包含3个竞品', '功能对比完整', '有明确差异化结论'],
        tags: ['竞品', '分析'],
      },
      {
        id: '3',
        name: '用户需求拆解',
        description: '将高层业务需求拆解为可执行的用户故事和验收标准',
        methodology: '1. 业务目标确认\n2. 用户角色识别\n3. 核心场景梳理\n4. 用户故事编写\n5. 验收标准定义',
        tools: ['knowledge_query'],
        outputs: { format: 'user_stories', sections: ['personas', 'stories', 'acceptance_criteria'] },
        checklist: ['每个故事有验收标准', '覆盖所有角色', '优先级已标注'],
        tags: ['需求', '拆解'],
      },
      {
        id: '4',
        name: '技术可行性评估',
        description: '评估需求的技术实现可行性，识别技术风险和约束',
        methodology: '1. 技术栈匹配分析\n2. 现有能力边界评估\n3. 技术风险识别\n4. 实现路径建议',
        tools: ['data_query', 'knowledge_query', 'api_call'],
        outputs: { format: 'assessment', sections: ['capability_analysis', 'risks', 'recommendations'] },
        checklist: ['覆盖所有技术维度', '风险有缓解方案', '实现路径有工时估算'],
        tags: ['技术', '评估'],
      },
    ];

    setSkills(demoSkills);

    // Demo workflows
    setWorkflows([
      {
        id: 'demo-1',
        workspaceId: 'ecommerce-v3',
        name: '电商平台 v3.0 规划',
        description: '电商平台下一版本的核心功能规划',
        status: 'in_progress',
        steps: [
          { id: 's1', name: '市场洞察', skill_id: '1', step_index: 0, runMode: 'serial', status: 'completed', output: '## 市场洞察报告\n\n### 行业趋势\n- 社交电商增长迅猛，年增长率达35%\n- 直播带货成为主流消费场景\n- 用户对个性化推荐期望持续提升\n\n### 市场规模\n- 中国电商市场预计2025年达到18万亿\n- 社交电商细分市场约2.5万亿\n\n### 机会点\n1. 社交分享裂变体系\n2. AI驱动的个性化推荐\n3. 短视频/直播内容整合' },
          { id: 's2', name: '竞品分析', skill_id: '2', step_index: 1, runMode: 'parallel', parallelGroupId: 'analysis', parallelGroupName: '方案分析并行组', status: 'in_progress', output: null },
          { id: 's3', name: '用户需求拆解', skill_id: '3', step_index: 1, runMode: 'parallel', parallelGroupId: 'analysis', parallelGroupName: '方案分析并行组', status: 'in_progress', output: null },
          { id: 's4', name: '技术可行性评估', skill_id: '4', step_index: 1, runMode: 'parallel', parallelGroupId: 'analysis', parallelGroupName: '方案分析并行组', status: 'in_progress', output: null },
        ],
      },
    ]);
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const getStepIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
      case 'in_progress':
        return <Clock className="h-5 w-5 text-blue-500 animate-pulse" />;
      default:
        return <Circle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const toggleSelection = (id: string, selectedIds: string[], setSelectedIds: (ids: string[]) => void) => {
    setSelectedIds(
      selectedIds.includes(id)
        ? selectedIds.filter((selectedId) => selectedId !== id)
        : [...selectedIds, id]
    );
  };

  const addUploadedContextFiles = useCallback((files: File[]) => {
    if (files.length === 0) return;

    setUploadedContextFiles((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: `file-${Date.now()}-${file.name}-${Math.random().toString(16).slice(2)}`,
        name: file.name || '粘贴图片',
        type: file.type || 'unknown',
        size: file.size,
        isImage: file.type.startsWith('image/'),
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      })),
    ]);
  }, []);

  const addReviewedOutputFiles = useCallback((files: File[], stepId?: string) => {
    if (!stepId || files.length === 0) return;

    setReviewedOutputFiles((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: `reviewed-${Date.now()}-${file.name}-${Math.random().toString(16).slice(2)}`,
        stepId,
        name: file.name,
        type: file.type || 'unknown',
        size: file.size,
      })),
    ]);
  }, []);


  const handlePasteContextFiles = useCallback((event: ClipboardEvent<HTMLInputElement>) => {
    const files = Array.from(event.clipboardData.files);
    if (files.length > 0) {
      addUploadedContextFiles(files);
    }
  }, [addUploadedContextFiles]);

  const formatFileSize = (size: number) => {
    if (size < 1024) return `${size}B`;
    if (size < 1024 * 1024) return `${Math.ceil(size / 1024)}KB`;
    return `${(size / 1024 / 1024).toFixed(1)}MB`;
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

  const handleSendMessage = useCallback(async () => {
    if (!chatInput.trim() || isStreaming) return;

    const userMessage = chatInput.trim();
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
        summary: `${file.name}，${file.type || 'unknown'}，${Math.ceil(file.size / 1024)}KB`,
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
      uploadedContextFiles.length > 0
        ? `用户上传/粘贴的文件：${uploadedContextFiles.map((file) => `${file.name}（${file.type || 'unknown'}，${Math.ceil(file.size / 1024)}KB）`).join('；')}`
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
          model_id: 'doubao-seed-2-0-pro-260215',
          skill_definition: skillDef ? {
            name: skillDef.name,
            methodology: skillDef.methodology,
            outputs: skillDef.outputs,
            checklist: skillDef.checklist,
            tools: skillDef.tools,
          } : undefined,
          step_context: stepContext,
          selected_knowledge_bases: selectedKnowledgeBases,
          selected_review_materials: [...selectedReviewMaterials, ...selectedUploadedReviewMaterials],
          uploaded_files: uploadedContextFiles.map(({ previewUrl, ...file }) => file),
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
            try {
              const data = JSON.parse(line.slice(6));
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
              if (data.error) throw new Error(data.error);
            } catch {
              // Skip non-JSON lines
            }
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

  const handleConfirmStep = () => {
    if (!activeWorkflow || activeStepIndex < 0) return;

    const lastAssistantMsg = [...chatMessages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistantMsg) return;

    const currentStep = getVisibleSteps(activeWorkflow)[activeStepIndex];
    const currentStepId = currentStep.id;
    let nextActiveStepIndex = activeStepIndex;

    setActiveWorkflow((prev) => {
      if (!prev) return prev;
      const newSteps = [...prev.steps];
      const currentStepActualIndex = newSteps.findIndex((step) => step.id === currentStepId);
      if (currentStepActualIndex < 0) return prev;

      newSteps[currentStepActualIndex] = {
        ...newSteps[currentStepActualIndex],
        status: 'completed',
        output: lastAssistantMsg.content,
      };

      if (currentStep.runMode === 'parallel' && currentStep.parallelGroupId) {
        const groupSteps = newSteps.filter((step) => !step.isRemoved && step.parallelGroupId === currentStep.parallelGroupId);
        const groupCompleted = groupSteps.every((step) => step.status === 'completed');
        if (groupCompleted) {
          const nextStepIndex = Math.min(
            ...newSteps
              .filter((step) => !step.isRemoved && step.step_index > currentStep.step_index)
              .map((step) => step.step_index)
          );
          if (Number.isFinite(nextStepIndex)) {
            newSteps.forEach((step, index) => {
              if (step.step_index === nextStepIndex && step.status === 'pending') {
                newSteps[index] = { ...step, status: 'in_progress' };
                nextActiveStepIndex = index;
              }
            });
          }
        } else {
          const visibleNewSteps = newSteps.filter((step) => !step.isRemoved);
          const nextParallelStep = visibleNewSteps.findIndex(
            (step) => step.parallelGroupId === currentStep.parallelGroupId && step.status === 'in_progress'
          );
          nextActiveStepIndex = nextParallelStep >= 0 ? nextParallelStep : activeStepIndex;
        }
      } else {
        const nextStepIndex = Math.min(
          ...newSteps
            .filter((step) => !step.isRemoved && step.step_index > currentStep.step_index)
            .map((step) => step.step_index)
        );
        if (Number.isFinite(nextStepIndex)) {
          newSteps.forEach((step, index) => {
            if (step.step_index === nextStepIndex && step.status === 'pending') {
              newSteps[index] = { ...step, status: 'in_progress' };
              if (nextActiveStepIndex === activeStepIndex) nextActiveStepIndex = index;
            }
          });
        }
      }
      return { ...prev, steps: newSteps };
    });

    setActiveStepIndex(nextActiveStepIndex);
    setChatMessages([]);
  };

  const handleCreateWorkflow = () => {
    if (!activeWorkspaceId || !newWorkflowName || selectedSkills.length === 0) return;

    let stepIndex = 0;
    let parallelGroupCounter = 0;
    const steps: WorkflowStep[] = selectedSkills.map((skill, idx) => {
      const mode = selectedSkillModes[skill.id] || 'serial';
      const previousMode = idx > 0 ? selectedSkillModes[selectedSkills[idx - 1].id] || 'serial' : 'serial';
      const nextMode = idx < selectedSkills.length - 1 ? selectedSkillModes[selectedSkills[idx + 1].id] || 'serial' : 'serial';

      if (mode === 'serial') {
        if (idx > 0) stepIndex += 1;
        return {
          id: `step-${Date.now()}-${idx}`,
          name: skill.name,
          skill_id: skill.id,
          step_index: stepIndex,
          runMode: 'serial' as const,
          status: stepIndex === 0 ? 'in_progress' as const : 'pending' as const,
          output: null,
        };
      }

      if (previousMode !== 'parallel') {
        if (idx > 0) stepIndex += 1;
        parallelGroupCounter += 1;
      }

      const groupId = `parallel-${Date.now()}-${parallelGroupCounter}`;
      const groupName = `并行任务组 ${parallelGroupCounter}`;
      const currentStepIndex = stepIndex;
      if (nextMode !== 'parallel') {
        // The next serial step should depend on this parallel group.
        stepIndex += 0;
      }

      return {
        id: `step-${Date.now()}-${idx}`,
        name: skill.name,
        skill_id: skill.id,
        step_index: currentStepIndex,
        runMode: 'parallel' as const,
        parallelGroupId: groupId,
        parallelGroupName: groupName,
        status: currentStepIndex === 0 ? 'in_progress' as const : 'pending' as const,
        output: null,
      };
    });

    const newWorkflow: Workflow = {
      id: `wf-${Date.now()}`,
      workspaceId: activeWorkspaceId,
      name: newWorkflowName,
      description: newWorkflowDesc,
      status: 'in_progress',
      steps,
    };

    setWorkflows((prev) => [newWorkflow, ...prev]);
    setActiveWorkflow(newWorkflow);
    setActiveStepIndex(0);
    setChatMessages([]);
    setCreateDialogOpen(false);
    setNewWorkflowName('');
    setNewWorkflowDesc('');
    setSelectedSkills([]);
    setSelectedSkillModes({});
  };

  const handleCreateWorkspace = () => {
    if (!newWorkspaceName.trim()) return;

    const workspace: Workspace = {
      id: `workspace-${Date.now()}`,
      name: newWorkspaceName.trim(),
      description: newWorkspaceDesc.trim() || '未填写目录说明',
    };

    setWorkspaces((prev) => [...prev, workspace]);
    setActiveWorkspaceId(workspace.id);
    setWorkspaceDialogOpen(false);
    setNewWorkspaceName('');
    setNewWorkspaceDesc('');
  };

  const handleDeleteWorkspace = (workspaceId: string) => {
    const workflowCount = workflows.filter((workflow) => workflow.workspaceId === workspaceId).length;
    if (workflowCount > 0 || workspaces.length <= 1) return;

    setWorkspaces((prev) => {
      const next = prev.filter((workspace) => workspace.id !== workspaceId);
      if (activeWorkspaceId === workspaceId) {
        setActiveWorkspaceId(next[0]?.id || '');
      }
      return next;
    });
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
      steps: workflow.steps.map((step, index) => ({
        ...step,
        id: `step-clone-${timestamp}-${index}`,
        status: step.id === firstVisibleStepId ? 'in_progress' : 'pending',
        output: null,
        removedAt: step.isRemoved ? new Date().toISOString() : undefined,
      })),
    };

    setWorkflows((prev) => [clonedWorkflow, ...prev]);
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

  // If no active workflow, show workflow list
  if (!activeWorkflow) {
    const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) || null;
    const workspaceWorkflows = workflows.filter((workflow) => workflow.workspaceId === activeWorkspaceId);
    const editingWorkflow = editingWorkflowId
      ? workspaceWorkflows.find((workflow) => workflow.id === editingWorkflowId) || null
      : null;

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-6 border-b border-border/40">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">工作流</h1>
            <p className="text-muted-foreground text-sm mt-1">先建立工作目录，再在目录内创建规划工作流</p>
          </div>
        </div>

        <div className="border-b border-border/40 px-6 py-4">
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

        <div className="flex-1 overflow-auto p-6">
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
              {workspaceWorkflows.map((wf) => (
                <Card
                  key={wf.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => {
                    setActiveWorkflow(wf);
                    const visibleSteps = getVisibleSteps(wf);
                    const firstInProgress = visibleSteps.findIndex((s) => s.status === 'in_progress');
                    setActiveStepIndex(firstInProgress >= 0 ? firstInProgress : 0);
                    setChatMessages([]);
                  }}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{wf.name}</CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={wf.status === 'completed' ? 'default' : wf.status === 'in_progress' ? 'secondary' : 'outline'}
                        >
                          {wf.status === 'completed' ? '已完成' : wf.status === 'in_progress' ? '进行中' : '草稿'}
                        </Badge>
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
                    <p className="text-sm text-muted-foreground">{wf.description}</p>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-1">
                      {getVisibleSteps(wf).map((step, idx, steps) => (
                        <div key={step.id} className="flex items-center">
                          {getStepIcon(step.status)}
                          {idx < steps.length - 1 && <ArrowRight className="h-3 w-3 mx-1 text-muted-foreground" />}
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {getVisibleSteps(wf).filter((s) => s.status === 'completed').length}/{getVisibleSteps(wf).length} 步骤已完成
                      {wf.steps.some((step) => step.isRemoved) && (
                        <span className="ml-2">已移除 {wf.steps.filter((step) => step.isRemoved).length} 个</span>
                      )}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Create Workflow Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>新建工作流</DialogTitle>
              <DialogDescription>选择 Skill 并配置串行或并行执行方式</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
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
                <div className="grid grid-cols-2 gap-2">
                  {skills.map((skill) => {
                    const isSelected = selectedSkills.find((s) => s.id === skill.id);
                    const orderIndex = isSelected ? selectedSkills.findIndex((s) => s.id === skill.id) : -1;
                    return (
                      <div
                        key={skill.id}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
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
                      </div>
                    );
                  })}
                </div>
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
                    连续标记为并行的 Skill 会组成同一个并行任务组，可分别推进；后续串行步骤会等待该并行组汇聚后继续。
                  </p>
                </div>
              )}
              <Button
                className="w-full"
                disabled={!activeWorkspace || !newWorkflowName || selectedSkills.length === 0}
                onClick={handleCreateWorkflow}
              >
                创建工作流
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
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>编辑工作流</DialogTitle>
              <DialogDescription>
                已有人执行过的步骤会软删除保留，可随时原样恢复，不破坏历史产物。
              </DialogDescription>
            </DialogHeader>

            {editingWorkflow && (
              <div className="space-y-5 mt-4">
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
  const currentReviewComment = currentStep ? reviewComments[currentStep.id]?.trim() || '' : '';
  const canArchiveReviewedOutput = currentReviewedOutputFiles.length > 0 || currentReviewComment.length > 0;
  const isReviewedOutputArchived = currentStep ? archivedReviewStepIds.includes(currentStep.id) : false;
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
    <div className="flex h-full min-w-0">
      {/* Left: Pipeline Panel */}
      <div className="w-80 shrink-0 border-r border-border/40 flex flex-col">
        <div className="p-4 border-b border-border/40">
          <Button variant="ghost" size="sm" onClick={() => { setActiveWorkflow(null); setActiveStepIndex(-1); setChatMessages([]); }}>
            ← 返回列表
          </Button>
          <h2 className="font-semibold mt-2">{activeWorkflow.name}</h2>
          <p className="text-xs text-muted-foreground mt-1">{activeWorkflow.description}</p>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {workflowStepGroups.map((group) => {
              const isParallelGroup = group.length > 1;
              const groupCompletedCount = group.filter((step) => step.status === 'completed').length;

              return (
                <div
                  key={isParallelGroup ? group[0].parallelGroupId : group[0].id}
                  className={isParallelGroup ? 'rounded-xl border border-border/50 bg-muted/20 p-2' : ''}
                >
                  {isParallelGroup && (
                    <div className="flex items-center justify-between px-2 pb-2">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">{group[0].parallelGroupName || '并行任务组'}</p>
                        <p className="text-[11px] text-muted-foreground/80">可自由切换并行推进</p>
                      </div>
                      <Badge variant="outline" className="text-[11px]">
                        并行 {groupCompletedCount}/{group.length}
                      </Badge>
                    </div>
                  )}

                  <div className="space-y-1">
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
                              setChatMessages([]);
                            }
                          }}
                        >
                          <div className="flex items-center gap-2">
                            {getStepIcon(step.status)}
                            <span className={`text-sm font-medium ${isActive ? 'text-primary' : ''}`}>
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
      <div className="min-w-0 flex-1 flex flex-col">
        {/* Chat Header */}
        <div className="p-4 border-b border-border/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-primary" />
            <div>
              <h3 className="font-semibold text-sm">{currentStep?.name || '选择步骤开始对话'}</h3>
              <p className="text-xs text-muted-foreground">
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
          <div className="px-4 py-2 bg-muted/30 border-b border-border/30">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
        <ScrollArea className="flex-1 p-4">
          {currentStep?.status === 'completed' && currentStep.output && chatMessages.length === 0 ? (
            /* Show completed step output */
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <h3 className="font-semibold">本步骤已完成</h3>
              </div>
              <div className="bg-muted/50 border border-border/40 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-sm text-primary">{currentStep.name} — 产出物</h4>
                  <div className="flex items-center gap-1">
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
                <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap">
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
              <div className="bg-muted/50 p-4 rounded-lg max-w-lg text-left text-sm">
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
                    className={`max-w-[80%] rounded-lg p-3 text-sm ${
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
          <div className="px-4 py-3 border-t border-[#6C5CE7]/30 bg-[#6C5CE7]/5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                当前步骤的 AI 协作已产出结果，确认后将保存产出{currentStep.runMode === 'parallel' ? '，可继续切换其他并行任务' : '并推进到下一步'}
              </p>
              <Button className="gap-2 bg-[#6C5CE7] hover:bg-[#5A4BD6]" onClick={handleConfirmStep}>
                <CheckCircle2 className="h-4 w-4" />
                确认完成
              </Button>
            </div>
          </div>
        )}

        {/* Chat Input */}
        <div className="p-4 border-t border-border/40 space-y-3">
          <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-3">
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
                    {selectedKnowledgeBaseIds.length} 个知识库 · {selectedReviewMaterialIds.length} 个评审材料 · {uploadedContextFiles.length} 个本地文件
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
                addUploadedContextFiles(Array.from(event.target.files || []));
                event.target.value = '';
              }}
            />

            {supplementalContextOpen && (
              <div className="space-y-3 border-t border-border/40 pt-3">
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

                <div className="space-y-2">
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
                          onClick={() => toggleSelection(kb.id, selectedKnowledgeBaseIds, setSelectedKnowledgeBaseIds)}
                        >
                          {kb.name}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
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
                            onClick={() => toggleSelection(material.id, selectedReviewMaterialIds, setSelectedReviewMaterialIds)}
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

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Paperclip className="h-3.5 w-3.5" />
                    <span>本地文件</span>
                    <span className="text-muted-foreground/70">支持 .txt、.md、图片，可直接复制粘贴图片到输入框</span>
                  </div>
                  {uploadedContextFiles.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {uploadedContextFiles.map((file) => (
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
                            onClick={() => setUploadedContextFiles((prev) => prev.filter((item) => item.id !== file.id))}
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

          <div className="flex gap-2">
            <Input
              placeholder="输入你的问题或指令..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onPaste={handlePasteContextFiles}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
              disabled={isStreaming}
              className="flex-1"
            />
            <Button onClick={handleSendMessage} disabled={isStreaming || !chatInput.trim()}>
              {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Right: Context Panel */}
      <div className="w-80 shrink-0 overflow-hidden border-l border-border/40 flex flex-col">
        <div className="p-4 border-b border-border/40">
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
                      addReviewedOutputFiles(Array.from(event.target.files || []), currentStep.id);
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
                              onClick={() => setReviewedOutputFiles((prev) => prev.filter((item) => item.id !== file.id))}
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
                      onChange={(event) => setReviewComments((prev) => ({
                        ...prev,
                        [currentStep.id]: event.target.value,
                      }))}
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
                        onClick={() => setArchivedReviewStepIds((prev) => (
                          prev.includes(currentStep.id) ? prev : [...prev, currentStep.id]
                        ))}
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

    </div>
  );
}
