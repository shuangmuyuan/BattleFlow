'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Rocket,
  Plus,
  Eye,
  Clock,
  CheckCircle2,
  Loader2,
  Sparkles,
  FileText,
  ExternalLink,
  RefreshCcw,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PageHeader,
  ProductEmptyState,
  StatusBadge,
  appCardClassName,
} from '@/components/battleflow/ui';

interface WorkflowStep {
  id: string;
  name: string;
  status: string;
  output?: string | null;
  validationStatus?: string | null;
  isRemoved?: boolean;
  updated_at?: string;
}

interface WorkflowDemoHandoff {
  id: string;
  workflowId: string;
  stepId: string;
  title?: string;
  documentTitle?: string;
  studioUrl?: string;
  directStudioUrl?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

interface Workflow {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  demoHandoffs?: WorkflowDemoHandoff[];
  updated_at?: string;
}

interface DemoListItem {
  id: string;
  name: string;
  sourceWorkflow: string;
  sourceStep: string;
  status: DemoStatus;
  createdAt: string;
  studioUrl: string;
}

interface DemoHandoffResponse {
  error?: string;
  workflow?: Workflow;
  handoff?: WorkflowDemoHandoff | null;
  reused?: boolean;
}

type DemoStatus = 'generating' | 'completed' | 'failed';

const statusConfig: Record<DemoStatus, {
  label: string;
  tone: 'brand' | 'success' | 'danger';
  icon: LucideIcon;
  animate: boolean;
}> = {
  generating: { label: '生成中', tone: 'brand', icon: Loader2, animate: true },
  completed: { label: '已完成', tone: 'success', icon: CheckCircle2, animate: false },
  failed: { label: '生成失败', tone: 'danger', icon: Clock, animate: false },
};

function isStepDemoEligible(step: WorkflowStep) {
  return Boolean(
    !step.isRemoved
      && step.status === 'completed'
      && step.output?.trim()
      && (!step.validationStatus || step.validationStatus === 'passed'),
  );
}

function getEligibleDemoSteps(workflow?: Workflow) {
  if (!workflow) return [];
  return workflow.steps.filter(isStepDemoEligible);
}

function getStepName(workflow: Workflow, stepId: string) {
  return workflow.steps.find((step) => step.id === stepId)?.name || '未命名节点';
}

function getDemoUrl(handoff?: WorkflowDemoHandoff | null) {
  return handoff?.directStudioUrl || handoff?.studioUrl || '';
}

function getReusableHandoff(workflow?: Workflow, stepId?: string) {
  if (!workflow || !stepId) return undefined;
  return (workflow.demoHandoffs || []).find((handoff) => (
    handoff.stepId === stepId && Boolean(getDemoUrl(handoff))
  ));
}

function mapHandoffStatus(handoff: WorkflowDemoHandoff): DemoStatus {
  if (getDemoUrl(handoff)) return 'completed';
  const status = (handoff.status || '').toLowerCase();
  if (status.includes('fail') || status.includes('error')) return 'failed';
  return 'generating';
}

function formatDate(value?: string) {
  if (!value) return '未记录时间';
  return value.slice(0, 10);
}

function buildDemoItems(workflows: Workflow[]): DemoListItem[] {
  return workflows
    .flatMap((workflow) => (workflow.demoHandoffs || []).map((handoff) => ({
      id: handoff.id,
      name: handoff.title || handoff.documentTitle || getStepName(workflow, handoff.stepId),
      sourceWorkflow: workflow.name,
      sourceStep: getStepName(workflow, handoff.stepId),
      status: mapHandoffStatus(handoff),
      createdAt: formatDate(handoff.created_at || handoff.updated_at),
      studioUrl: getDemoUrl(handoff),
    })))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function pickDefaultWorkflow(workflows: Workflow[]) {
  return workflows.find((workflow) => getEligibleDemoSteps(workflow).length > 0) || workflows[0];
}

export default function DemosPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [selectedStepId, setSelectedStepId] = useState('');
  const [generating, setGenerating] = useState(false);

  const loadWorkflows = useCallback(async () => {
    setLoading(true);
    setLoadError('');

    try {
      const response = await fetch('/api/workflows', { cache: 'no-store' });
      const data = await response.json() as { workflows?: Workflow[]; error?: string };

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load workflows');
      }

      setWorkflows(Array.isArray(data.workflows) ? data.workflows : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : '工作流加载失败';
      setLoadError(message);
      toast.error('工作流加载失败', { description: message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkflows();
  }, [loadWorkflows]);

  useEffect(() => {
    if (workflows.length === 0) {
      setSelectedWorkflowId('');
      setSelectedStepId('');
      return;
    }

    const selectedWorkflow = workflows.find((workflow) => workflow.id === selectedWorkflowId);
    const nextWorkflow = selectedWorkflow || pickDefaultWorkflow(workflows);
    if (!nextWorkflow) return;

    if (nextWorkflow.id !== selectedWorkflowId) {
      setSelectedWorkflowId(nextWorkflow.id);
      setSelectedStepId(getEligibleDemoSteps(nextWorkflow)[0]?.id || '');
      return;
    }

    const nextSteps = getEligibleDemoSteps(nextWorkflow);
    if (selectedStepId && nextSteps.some((step) => step.id === selectedStepId)) return;
    setSelectedStepId(nextSteps[0]?.id || '');
  }, [selectedStepId, selectedWorkflowId, workflows]);

  const selectedWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.id === selectedWorkflowId),
    [selectedWorkflowId, workflows],
  );
  const selectableSteps = useMemo(() => getEligibleDemoSteps(selectedWorkflow), [selectedWorkflow]);
  const selectedStep = useMemo(
    () => selectableSteps.find((step) => step.id === selectedStepId),
    [selectableSteps, selectedStepId],
  );
  const selectedExistingHandoff = useMemo(
    () => getReusableHandoff(selectedWorkflow, selectedStepId),
    [selectedStepId, selectedWorkflow],
  );
  const demos = useMemo(() => buildDemoItems(workflows), [workflows]);
  const generatingCount = demos.filter((demo) => demo.status === 'generating').length + (generating ? 1 : 0);
  const completedCount = demos.filter((demo) => demo.status === 'completed').length;

  const handleWorkflowChange = (workflowId: string) => {
    const workflow = workflows.find((item) => item.id === workflowId);
    setSelectedWorkflowId(workflowId);
    setSelectedStepId(getEligibleDemoSteps(workflow)[0]?.id || '');
  };

  const openCreateDialog = () => {
    setGenerating(false);
    setCreateDialogOpen(true);
    if (!loading && workflows.length === 0) {
      void loadWorkflows();
    }
  };

  const handleGenerate = async () => {
    if (!selectedWorkflow || !selectedStep) {
      toast.error('请选择可生成 Demo 的工作流节点');
      return;
    }

    const reusableUrl = getDemoUrl(selectedExistingHandoff);
    if (reusableUrl) {
      window.open(reusableUrl, '_blank', 'noopener,noreferrer');
      setCreateDialogOpen(false);
      return;
    }

    setGenerating(true);

    try {
      const response = await fetch('/api/demos/handoffs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workflowId: selectedWorkflow.id,
          stepId: selectedStep.id,
        }),
      });
      const data = await response.json().catch(() => ({})) as DemoHandoffResponse;

      if (!response.ok) {
        throw new Error(data.error || 'Demo generation failed');
      }

      const updatedWorkflow = data.workflow;
      if (updatedWorkflow?.id) {
        setWorkflows((prev) => {
          const exists = prev.some((workflow) => workflow.id === updatedWorkflow.id);
          return exists
            ? prev.map((workflow) => (workflow.id === updatedWorkflow.id ? updatedWorkflow : workflow))
            : [updatedWorkflow, ...prev];
        });
      }

      toast.success(data.reused ? '已找到 Demo' : 'Demo 生成成功', {
        description: getDemoUrl(data.handoff) ? '可在列表中打开。' : undefined,
      });
      setCreateDialogOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Demo 生成失败';
      toast.error('Demo 生成失败', { description: message });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Demo 生成"
        meta={<StatusBadge tone="success">服务已接入</StatusBadge>}
        action={(
          <Button className="w-full gap-2 sm:w-auto" onClick={openCreateDialog}>
            <Plus className="h-4 w-4" />
            新建 Demo
          </Button>
        )}
      />

      <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className={appCardClassName}>
              <CardContent className="p-4">
                <div className="text-2xl font-bold">{demos.length}</div>
                <div className="mt-1 text-xs text-muted-foreground">Demo 总数</div>
              </CardContent>
            </Card>
            <Card className={appCardClassName}>
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-success">{completedCount}</div>
                <div className="mt-1 text-xs text-muted-foreground">已完成</div>
              </CardContent>
            </Card>
            <Card className={appCardClassName}>
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-brand">{generatingCount}</div>
                <div className="mt-1 text-xs text-muted-foreground">生成中</div>
              </CardContent>
            </Card>
          </div>

          {loadError && (
            <div className="flex flex-col gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span className="text-destructive">{loadError}</span>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void loadWorkflows()}>
                <RefreshCcw className="h-3.5 w-3.5" />
                重试
              </Button>
            </div>
          )}

          {loading ? (
            <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-border/60 text-sm text-muted-foreground">
              正在加载 Demo 数据...
            </div>
          ) : demos.length > 0 ? (
            <div className="flex flex-col gap-3">
              {demos.map((demo) => {
                const config = statusConfig[demo.status];
                const StatusIcon = config.icon;

                return (
                  <Card key={demo.id} className={appCardClassName}>
                    <CardContent className="p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 flex-1 items-start gap-4">
                          <div className="rounded-lg bg-brand/10 p-2.5 text-brand">
                            <Rocket className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <h3 className="truncate font-medium">{demo.name}</h3>
                              <StatusBadge tone={config.tone}>
                                <StatusIcon className={`h-4 w-4 ${config.animate ? 'animate-spin' : ''}`} />
                                {config.label}
                              </StatusBadge>
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex min-w-0 items-center gap-1">
                                <FileText className="h-3 w-3" />
                                <span className="truncate">{demo.sourceWorkflow} / {demo.sourceStep}</span>
                              </span>
                              <span>{demo.createdAt}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 lg:ml-4 lg:justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs"
                            disabled={!demo.studioUrl}
                            onClick={() => demo.studioUrl && window.open(demo.studioUrl, '_blank', 'noopener,noreferrer')}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            打开
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <ProductEmptyState
              icon={<Rocket />}
              title="暂无 Demo"
              description="选择已完成的工作流节点，生成第一个 Demo。"
              action={(
                <Button className="gap-2" onClick={openCreateDialog}>
                  <Plus className="h-4 w-4" />
                  新建 Demo
                </Button>
              )}
            />
          )}
        </div>
      </div>

      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) setGenerating(false);
        }}
      >
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-lg flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border/40 px-6 py-5 pr-12">
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-primary" />
              新建 Demo
            </DialogTitle>
            <DialogDescription className="sr-only">
              选择工作流和节点生成 Demo。
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <FieldGroup className="gap-5">
              <Field>
                <FieldLabel>工作流</FieldLabel>
                <Select
                  value={selectedWorkflowId}
                  onValueChange={handleWorkflowChange}
                  disabled={loading || workflows.length === 0 || generating}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={loading ? '正在加载工作流...' : '选择工作流'} />
                  </SelectTrigger>
                  <SelectContent>
                    {workflows.map((workflow) => (
                      <SelectItem key={workflow.id} value={workflow.id}>
                        {workflow.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel>节点</FieldLabel>
                <Select
                  value={selectedStepId}
                  onValueChange={setSelectedStepId}
                  disabled={!selectedWorkflow || selectableSteps.length === 0 || generating}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={selectableSteps.length > 0 ? '选择节点' : '暂无可生成节点'} />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableSteps.map((step) => (
                      <SelectItem key={step.id} value={step.id}>
                        {step.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedWorkflow && selectableSteps.length === 0 && (
                  <p className="text-xs text-muted-foreground">当前工作流暂无已完成且有产物的节点。</p>
                )}
                {selectedExistingHandoff && (
                  <p className="text-xs text-muted-foreground">该节点已有 Demo，可直接打开。</p>
                )}
              </Field>

              <div className="flex flex-col-reverse gap-3 sm:flex-row">
                <Button
                  variant="outline"
                  disabled={generating}
                  onClick={() => setCreateDialogOpen(false)}
                >
                  取消
                </Button>
                <Button
                  className="flex-1 gap-2"
                  disabled={!selectedWorkflow || !selectedStep || generating}
                  onClick={() => void handleGenerate()}
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : selectedExistingHandoff ? (
                    <ExternalLink className="h-4 w-4" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {generating ? '生成中' : selectedExistingHandoff ? '打开 Demo' : '生成 Demo'}
                </Button>
              </div>
            </FieldGroup>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
