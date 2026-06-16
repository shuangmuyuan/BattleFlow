'use client';

import { useState } from 'react';
import {
  Rocket,
  Plus,
  Globe,
  Smartphone,
  Component,
  Eye,
  Clock,
  CheckCircle2,
  Loader2,
  Sparkles,
  ChevronRight,
  FileText,
  Monitor,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  PageHeader,
  ProductEmptyState,
  StatusBadge,
  appCardClassName,
} from '@/components/battleflow/ui';

interface Demo {
  id: string;
  name: string;
  sourceWorkflow: string;
  type: 'web' | 'mobile' | 'component';
  fidelity: 'low' | 'mid' | 'high';
  status: 'generating' | 'completed' | 'failed';
  createdAt: string;
  previewUrl?: string;
}

const mockDemos: Demo[] = [];

const typeConfig = {
  web: { label: 'Web 页面', icon: Globe },
  mobile: { label: '移动端', icon: Smartphone },
  component: { label: '组件库', icon: Component },
};

const fidelityLabels = {
  low: '低保真',
  mid: '中保真',
  high: '高保真',
};

const statusConfig = {
  generating: { label: '生成中', tone: 'brand' as const, icon: Loader2, animate: true },
  completed: { label: '已完成', tone: 'success' as const, icon: CheckCircle2, animate: false },
  failed: { label: '生成失败', tone: 'danger' as const, icon: Clock, animate: false },
};

export default function DemosPage() {
  const [demos] = useState<Demo[]>(mockDemos);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [demoName, setDemoName] = useState('');
  const [demoDesc, setDemoDesc] = useState('');
  const [selectedType, setSelectedType] = useState<'web' | 'mobile' | 'component'>('web');
  const [selectedFidelity, setSelectedFidelity] = useState<'low' | 'mid' | 'high'>('mid');
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      setGenerating(false);
      setGenerated(true);
    }, 3000);
  };

  const resetDialog = () => {
    setDemoName('');
    setDemoDesc('');
    setSelectedType('web');
    setSelectedFidelity('mid');
    setGenerating(false);
    setGenerated(false);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Demo 生成"
        description="从已完成的规划产物生成可演示原型，帮助团队快速验证产品方向。"
        meta={<StatusBadge tone="warning">生成服务待接入</StatusBadge>}
        action={(
          <Button
            className="w-full gap-2 sm:w-auto"
            onClick={() => {
              resetDialog();
              setCreateDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            新建 Demo
          </Button>
        )}
      />

      <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
        <div className="flex flex-col gap-6">

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className={appCardClassName}>
          <CardContent className="p-4">
          <div className="text-2xl font-bold">{demos.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Demo 总数</div>
          </CardContent>
        </Card>
        <Card className={appCardClassName}>
          <CardContent className="p-4">
          <div className="text-2xl font-bold text-success">
            {demos.filter((d) => d.status === 'completed').length}
          </div>
          <div className="text-xs text-muted-foreground mt-1">已完成</div>
          </CardContent>
        </Card>
        <Card className={appCardClassName}>
          <CardContent className="p-4">
          <div className="text-2xl font-bold text-brand">
            {demos.filter((d) => d.status === 'generating').length}
          </div>
          <div className="text-xs text-muted-foreground mt-1">生成中</div>
          </CardContent>
        </Card>
      </div>

      {/* Demo List */}
      <div className="flex flex-col gap-3">
        {demos.map((demo) => {
          const tConfig = typeConfig[demo.type];
          const fidelityLabel = fidelityLabels[demo.fidelity];
          const sConfig = statusConfig[demo.status];
          const TypeIcon = tConfig.icon;
          const StatusIcon = sConfig.icon;

          return (
            <Card
              key={demo.id}
              className={appCardClassName}
            >
              <CardContent className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  {/* Icon */}
                  <div className="rounded-lg bg-brand/10 p-2.5 text-brand">
                    <TypeIcon className="h-5 w-5" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h3 className="font-medium truncate">{demo.name}</h3>
                      <StatusBadge tone="neutral">{fidelityLabel}</StatusBadge>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex min-w-0 items-center gap-1">
                        <FileText className="h-3 w-3" />
                        <span className="truncate">来自：{demo.sourceWorkflow}</span>
                      </span>
                      <span>{demo.createdAt}</span>
                    </div>
                  </div>
                </div>

                {/* Status & Actions */}
                <div className="flex flex-wrap items-center gap-3 lg:ml-4 lg:justify-end">
                  <StatusBadge tone={sConfig.tone}>
                    <StatusIcon className={`h-4 w-4 ${sConfig.animate ? 'animate-spin' : ''}`} />
                    {sConfig.label}
                  </StatusBadge>
                  {demo.status === 'completed' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="ghost" size="sm" className="gap-1.5 text-xs" disabled>
                        <Eye className="h-3.5 w-3.5" />
                        预览
                      </Button>
                      <Button variant="ghost" size="sm" className="gap-1.5 text-xs" disabled>
                        <Download className="h-3.5 w-3.5" />
                        导出
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Progress bar for generating */}
              {demo.status === 'generating' && (
                  <div className="mt-3">
                    <Progress value={45} className="h-1.5 animate-pulse" />
                </div>
              )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Empty hint if no demos */}
      {demos.length === 0 && (
        <ProductEmptyState
          icon={<Rocket />}
          title="暂无 Demo"
          description="从工作流的 PRD 产出物生成第一个交互原型。生成服务接入前，可先整理输入材料。"
          action={(
            <Button className="gap-2" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              新建 Demo
            </Button>
          )}
        />
      )}
        </div>
      </div>

      {/* Create Demo Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border/40 px-6 py-5 pr-12">
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-primary" />
              新建 Demo 生成
            </DialogTitle>
            <DialogDescription>
              基于 PRD 文档自动生成交互式原型页面
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <FieldGroup className="gap-5">
            {/* Basic Info */}
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel>Demo 名称</FieldLabel>
                <Input
                  placeholder="例如：电商平台首页原型"
                  value={demoName}
                  onChange={(e) => setDemoName(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel>描述（可选）</FieldLabel>
                <Textarea
                  placeholder="描述这个 Demo 的目标和关注点..."
                  value={demoDesc}
                  onChange={(e) => setDemoDesc(e.target.value)}
                  rows={3}
                />
              </Field>
            </FieldGroup>

            {/* Source Selection */}
            <Field>
              <FieldLabel>关联工作流</FieldLabel>
              <div className="rounded-lg border border-border/50 p-3 text-sm text-muted-foreground">
                请先在「工作流」中完成 PRD 生成，此处可选择已完成的 PRD 作为输入
                <div className="mt-2 flex items-center gap-1 text-xs text-primary">
                  <ChevronRight className="h-3 w-3" />
                  前往工作流
                </div>
              </div>
            </Field>

            {/* Type Selection */}
            <Field>
              <FieldLabel>原型类型</FieldLabel>
              <ToggleGroup
                type="single"
                value={selectedType}
                onValueChange={(value) => value && setSelectedType(value as 'web' | 'mobile' | 'component')}
                className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3"
              >
                {([
                  { key: 'web' as const, label: 'Web 页面', desc: '桌面端网页原型', icon: Globe },
                  { key: 'mobile' as const, label: '移动端页面', desc: 'H5 / 小程序原型', icon: Smartphone },
                  { key: 'component' as const, label: '组件库', desc: 'UI 组件展示', icon: Component },
                ]).map((type) => (
                  <ToggleGroupItem
                    key={type.key}
                    value={type.key}
                    className="h-auto flex-col items-start justify-start rounded-lg border border-border/50 bg-muted/30 p-3 text-left data-[state=on]:border-primary data-[state=on]:bg-primary/10"
                  >
                    <type.icon className="h-4 w-4 mb-1.5" />
                    <div className="text-sm font-medium">{type.label}</div>
                    <div className="text-xs mt-0.5 opacity-70">{type.desc}</div>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>

            {/* Fidelity Selection */}
            <Field>
              <FieldLabel>交互保真度</FieldLabel>
              <ToggleGroup
                type="single"
                value={selectedFidelity}
                onValueChange={(value) => value && setSelectedFidelity(value as 'low' | 'mid' | 'high')}
                className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3"
              >
                {([
                  { key: 'low' as const, label: '低保真', desc: '线框图 + 基础布局' },
                  { key: 'mid' as const, label: '中保真', desc: '视觉还原 + 关键交互' },
                  { key: 'high' as const, label: '高保真', desc: '完整交互 + 动效模拟' },
                ]).map((level) => (
                  <ToggleGroupItem
                    key={level.key}
                    value={level.key}
                    className="h-auto flex-col rounded-lg border border-border/50 bg-muted/30 p-2.5 text-center data-[state=on]:border-primary data-[state=on]:bg-primary/10"
                  >
                    <div className="text-sm font-medium">{level.label}</div>
                    <div className="text-xs mt-0.5 opacity-70">{level.desc}</div>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>

            {/* Generating status */}
            {generating && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 text-primary animate-spin" />
                  <div>
                    <div className="text-sm font-medium">正在生成 Demo...</div>
                    <div className="text-xs text-muted-foreground mt-0.5">AI 正在解析 PRD 并构建交互原型</div>
                  </div>
                </div>
                <Progress value={60} className="mt-3 h-1.5 animate-pulse" />
              </div>
            )}

            {generated && (
              <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <div>
                    <div className="text-sm font-medium">Demo 生成完成</div>
                    <div className="text-xs text-muted-foreground mt-0.5">可在列表中预览交互原型</div>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              {!generating && !generated && (
                <>
                  <Button
                    className="flex-1 gap-2"
                    disabled
                    onClick={handleGenerate}
                  >
                    <Sparkles className="h-4 w-4" />
                    生成服务待接入
                  </Button>
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    取消
                  </Button>
                </>
              )}
              {generated && (
                <>
                  <Button variant="outline" className="flex-1" onClick={() => setCreateDialogOpen(false)}>
                    返回列表
                  </Button>
                  <Button className="flex-1 gap-2" disabled>
                    <Monitor className="h-4 w-4" />
                    预览 Demo（即将支持）
                  </Button>
                </>
              )}
            </div>
          </FieldGroup>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
