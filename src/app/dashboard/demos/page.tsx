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
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

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

const mockDemos: Demo[] = [
  {
    id: '1',
    name: '电商平台 v3.0 首页原型',
    sourceWorkflow: '电商平台 v3.0 规划',
    type: 'web',
    fidelity: 'mid',
    status: 'completed',
    createdAt: '2024-01-15 14:30',
    previewUrl: '#',
  },
  {
    id: '2',
    name: '用户中心移动端页面',
    sourceWorkflow: '电商平台 v3.0 规划',
    type: 'mobile',
    fidelity: 'high',
    status: 'completed',
    createdAt: '2024-01-14 10:15',
    previewUrl: '#',
  },
  {
    id: '3',
    name: '商品详情页组件库',
    sourceWorkflow: '商品模块重构',
    type: 'component',
    fidelity: 'low',
    status: 'generating',
    createdAt: '2024-01-16 09:00',
  },
];

const typeConfig = {
  web: { label: 'Web 页面', icon: Globe, color: 'text-blue-400' },
  mobile: { label: '移动端', icon: Smartphone, color: 'text-green-400' },
  component: { label: '组件库', icon: Component, color: 'text-orange-400' },
};

const fidelityConfig = {
  low: { label: '低保真', color: 'bg-yellow-500/20 text-yellow-400' },
  mid: { label: '中保真', color: 'bg-blue-500/20 text-blue-400' },
  high: { label: '高保真', color: 'bg-purple-500/20 text-purple-400' },
};

const statusConfig = {
  generating: { label: '生成中', color: 'text-primary', icon: Loader2, animate: true },
  completed: { label: '已完成', color: 'text-green-400', icon: CheckCircle2, animate: false },
  failed: { label: '生成失败', color: 'text-red-400', icon: Clock, animate: false },
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
    <div className="h-full min-h-0 space-y-6 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Demo 生成</h1>
          <p className="text-sm text-muted-foreground mt-1">
            基于 PRD 文档自动生成交互式原型，快速验证产品方案
          </p>
        </div>
        <Button
          className="gap-2"
          onClick={() => {
            resetDialog();
            setCreateDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          新建 Demo
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl bg-card border border-border/50 p-4">
          <div className="text-2xl font-bold">{demos.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Demo 总数</div>
        </div>
        <div className="rounded-xl bg-card border border-border/50 p-4">
          <div className="text-2xl font-bold text-green-400">
            {demos.filter((d) => d.status === 'completed').length}
          </div>
          <div className="text-xs text-muted-foreground mt-1">已完成</div>
        </div>
        <div className="rounded-xl bg-card border border-border/50 p-4">
          <div className="text-2xl font-bold text-primary">
            {demos.filter((d) => d.status === 'generating').length}
          </div>
          <div className="text-xs text-muted-foreground mt-1">生成中</div>
        </div>
      </div>

      {/* Demo List */}
      <div className="space-y-3">
        {demos.map((demo) => {
          const tConfig = typeConfig[demo.type];
          const fConfig = fidelityConfig[demo.fidelity];
          const sConfig = statusConfig[demo.status];
          const TypeIcon = tConfig.icon;
          const StatusIcon = sConfig.icon;

          return (
            <div
              key={demo.id}
              className="rounded-xl bg-card border border-border/50 p-5 hover:border-primary/30 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  {/* Icon */}
                  <div className={`rounded-lg bg-muted/50 p-2.5 ${tConfig.color}`}>
                    <TypeIcon className="h-5 w-5" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium truncate">{demo.name}</h3>
                      <Badge variant="secondary" className={fConfig.color}>
                        {fConfig.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        来自：{demo.sourceWorkflow}
                      </span>
                      <span>{demo.createdAt}</span>
                    </div>
                  </div>
                </div>

                {/* Status & Actions */}
                <div className="flex items-center gap-3 ml-4">
                  <div className={`flex items-center gap-1.5 text-sm ${sConfig.color}`}>
                    <StatusIcon className={`h-4 w-4 ${sConfig.animate ? 'animate-spin' : ''}`} />
                    {sConfig.label}
                  </div>
                  {demo.status === 'completed' && (
                    <div className="flex items-center gap-2">
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
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '45%' }} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty hint if no demos */}
      {demos.length === 0 && (
        <div className="text-center py-16">
          <Rocket className="h-12 w-12 text-muted-foreground/50 mx-auto" />
          <h3 className="text-lg font-medium mt-4">暂无 Demo</h3>
          <p className="text-sm text-muted-foreground mt-1">从工作流的 PRD 产出物生成你的第一个交互原型</p>
          <Button className="mt-4 gap-2" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            新建 Demo
          </Button>
        </div>
      )}

      {/* Create Demo Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-primary" />
              新建 Demo 生成
            </DialogTitle>
            <DialogDescription>
              基于 PRD 文档自动生成交互式原型页面
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 mt-4">
            {/* Basic Info */}
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Demo 名称</label>
                <Input
                  placeholder="例如：电商平台首页原型"
                  value={demoName}
                  onChange={(e) => setDemoName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">描述（可选）</label>
                <Textarea
                  placeholder="描述这个 Demo 的目标和关注点..."
                  value={demoDesc}
                  onChange={(e) => setDemoDesc(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            {/* Source Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">关联工作流</label>
              <div className="rounded-lg border border-border/50 p-3 text-sm text-muted-foreground">
                请先在「工作流」中完成 PRD 生成，此处可选择已完成的 PRD 作为输入
                <div className="mt-2 flex items-center gap-1 text-xs text-primary">
                  <ChevronRight className="h-3 w-3" />
                  前往工作流
                </div>
              </div>
            </div>

            {/* Type Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">原型类型</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: 'web' as const, label: 'Web 页面', desc: '桌面端网页原型', icon: Globe },
                  { key: 'mobile' as const, label: '移动端页面', desc: 'H5 / 小程序原型', icon: Smartphone },
                  { key: 'component' as const, label: '组件库', desc: 'UI 组件展示', icon: Component },
                ]).map((type) => (
                  <div
                    key={type.key}
                    className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                      selectedType === type.key
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border/50 bg-muted/30 text-muted-foreground hover:border-primary/50'
                    }`}
                    onClick={() => setSelectedType(type.key)}
                  >
                    <type.icon className="h-4 w-4 mb-1.5" />
                    <div className="text-sm font-medium">{type.label}</div>
                    <div className="text-xs mt-0.5 opacity-70">{type.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Fidelity Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">交互保真度</label>
              <div className="flex gap-2">
                {([
                  { key: 'low' as const, label: '低保真', desc: '线框图 + 基础布局' },
                  { key: 'mid' as const, label: '中保真', desc: '视觉还原 + 关键交互' },
                  { key: 'high' as const, label: '高保真', desc: '完整交互 + 动效模拟' },
                ]).map((level) => (
                  <div
                    key={level.key}
                    className={`flex-1 rounded-lg border p-2.5 text-center cursor-pointer transition-colors ${
                      selectedFidelity === level.key
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border/50 bg-muted/30 text-muted-foreground hover:border-primary/50'
                    }`}
                    onClick={() => setSelectedFidelity(level.key)}
                  >
                    <div className="text-sm font-medium">{level.label}</div>
                    <div className="text-xs mt-0.5 opacity-70">{level.desc}</div>
                  </div>
                ))}
              </div>
            </div>

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
                <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '60%' }} />
                </div>
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
            <div className="flex gap-3">
              {!generating && !generated && (
                <>
                  <Button
                    className="flex-1 gap-2"
                    disabled={!demoName.trim()}
                    onClick={handleGenerate}
                  >
                    <Sparkles className="h-4 w-4" />
                    开始生成
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
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
