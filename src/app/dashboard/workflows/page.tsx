'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
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
  ChevronRight,
  CheckCircle2,
  Circle,
  Clock,
  ArrowRight,
  MessageSquare,
  Save,
  Flag,
  FileText,
  Sparkles,
  Loader2,
  BookOpen,

  Rocket,
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
  status: 'pending' | 'in_progress' | 'completed';
  output: string | null;
}

interface Workflow {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'in_progress' | 'completed';
  steps: WorkflowStep[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function WorkflowsPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(-1);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [newWorkflowDesc, setNewWorkflowDesc] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<Skill[]>([]);
  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false);
  const [milestoneName, setMilestoneName] = useState('');

  const chatEndRef = useRef<HTMLDivElement>(null);

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
        name: '电商平台 v3.0 规划',
        description: '电商平台下一版本的核心功能规划',
        status: 'in_progress',
        steps: [
          { id: 's1', name: '市场洞察', skill_id: '1', step_index: 0, status: 'completed', output: '## 市场洞察报告\n\n### 行业趋势\n- 社交电商增长迅猛，年增长率达35%\n- 直播带货成为主流消费场景\n- 用户对个性化推荐期望持续提升\n\n### 市场规模\n- 中国电商市场预计2025年达到18万亿\n- 社交电商细分市场约2.5万亿\n\n### 机会点\n1. 社交分享裂变体系\n2. AI驱动的个性化推荐\n3. 短视频/直播内容整合' },
          { id: 's2', name: '竞品分析', skill_id: '2', step_index: 1, status: 'in_progress', output: null },
          { id: 's3', name: '用户需求拆解', skill_id: '3', step_index: 2, status: 'pending', output: null },
          { id: 's4', name: '技术可行性评估', skill_id: '4', step_index: 3, status: 'pending', output: null },
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

  const handleSendMessage = useCallback(async () => {
    if (!chatInput.trim() || isStreaming) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsStreaming(true);

    try {
      const currentStep = activeWorkflow?.steps[activeStepIndex];
      const stepContext = activeWorkflow?.steps
        .filter((s, i) => i < activeStepIndex && s.output)
        .map((s) => ({ step_name: s.name, step_output: s.output })) || [];

      const skillDef = skills.find((s) => s.id === currentStep?.skill_id);

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...chatMessages, { role: 'user', content: userMessage }].map((m) => ({
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
  }, [chatInput, chatMessages, isStreaming, activeWorkflow, activeStepIndex, skills]);

  const handleConfirmStep = () => {
    if (!activeWorkflow || activeStepIndex < 0) return;

    const lastAssistantMsg = [...chatMessages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistantMsg) return;

    setActiveWorkflow((prev) => {
      if (!prev) return prev;
      const newSteps = [...prev.steps];
      newSteps[activeStepIndex] = {
        ...newSteps[activeStepIndex],
        status: 'completed',
        output: lastAssistantMsg.content,
      };
      // Move to next step
      if (activeStepIndex + 1 < newSteps.length) {
        newSteps[activeStepIndex + 1] = {
          ...newSteps[activeStepIndex + 1],
          status: 'in_progress',
        };
      }
      return { ...prev, steps: newSteps };
    });

    // Move to next step if exists
    if (activeStepIndex + 1 < (activeWorkflow?.steps.length || 0)) {
      setActiveStepIndex(activeStepIndex + 1);
      setChatMessages([]);
    }
  };

  const handleCreateWorkflow = () => {
    if (!newWorkflowName || selectedSkills.length === 0) return;

    const newWorkflow: Workflow = {
      id: `wf-${Date.now()}`,
      name: newWorkflowName,
      description: newWorkflowDesc,
      status: 'in_progress',
      steps: selectedSkills.map((skill, idx) => ({
        id: `step-${Date.now()}-${idx}`,
        name: skill.name,
        skill_id: skill.id,
        step_index: idx,
        status: idx === 0 ? 'in_progress' as const : 'pending' as const,
        output: null,
      })),
    };

    setWorkflows((prev) => [newWorkflow, ...prev]);
    setActiveWorkflow(newWorkflow);
    setActiveStepIndex(0);
    setChatMessages([]);
    setCreateDialogOpen(false);
    setNewWorkflowName('');
    setNewWorkflowDesc('');
    setSelectedSkills([]);
  };

  const handleSaveMilestone = () => {
    if (!milestoneName) return;
    setMilestoneDialogOpen(false);
    setMilestoneName('');
    // In production, this would call the API
  };

  // If no active workflow, show workflow list
  if (!activeWorkflow) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-6 border-b border-border/40">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">工作流</h1>
            <p className="text-muted-foreground text-sm mt-1">创建规划工作流，编排 Skill 步骤，协作产出 PRD</p>
          </div>
          <Button className="gap-2" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            新建工作流
          </Button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {workflows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Play className="h-12 w-12 mb-4 opacity-30" />
              <p>暂无工作流</p>
              <p className="text-sm mt-1">点击"新建工作流"开始你的第一个规划</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {workflows.map((wf) => (
                <Card
                  key={wf.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => {
                    setActiveWorkflow(wf);
                    const firstInProgress = wf.steps.findIndex((s) => s.status === 'in_progress');
                    setActiveStepIndex(firstInProgress >= 0 ? firstInProgress : 0);
                    setChatMessages([]);
                  }}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{wf.name}</CardTitle>
                      <Badge
                        variant={wf.status === 'completed' ? 'default' : wf.status === 'in_progress' ? 'secondary' : 'outline'}
                      >
                        {wf.status === 'completed' ? '已完成' : wf.status === 'in_progress' ? '进行中' : '草稿'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{wf.description}</p>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-1">
                      {wf.steps.map((step, idx) => (
                        <div key={step.id} className="flex items-center">
                          {getStepIcon(step.status)}
                          {idx < wf.steps.length - 1 && <ArrowRight className="h-3 w-3 mx-1 text-muted-foreground" />}
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {wf.steps.filter((s) => s.status === 'completed').length}/{wf.steps.length} 步骤已完成
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
              <DialogDescription>选择 Skill 并编排为线性流水线</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
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
                          } else {
                            setSelectedSkills((prev) => [...prev, skill]);
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
                  <label className="text-sm font-medium">编排顺序（可拖拽调整）</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedSkills.map((skill, idx) => (
                      <div key={skill.id} className="flex items-center gap-1">
                        <Badge variant="secondary" className="gap-1">
                          {idx + 1}. {skill.name}
                        </Badge>
                        {idx < selectedSkills.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <Button
                className="w-full"
                disabled={!newWorkflowName || selectedSkills.length === 0}
                onClick={handleCreateWorkflow}
              >
                创建工作流
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Active workflow view - Pipeline + Chat
  const currentStep = activeWorkflow.steps[activeStepIndex];
  const currentSkill = skills.find((s) => s.id === currentStep?.skill_id);
  const previousSteps = activeWorkflow.steps.filter((_, i) => i < activeStepIndex && activeWorkflow.steps[i].output);

  return (
    <div className="flex h-full">
      {/* Left: Pipeline Panel */}
      <div className="w-80 border-r border-border/40 flex flex-col">
        <div className="p-4 border-b border-border/40">
          <Button variant="ghost" size="sm" onClick={() => { setActiveWorkflow(null); setActiveStepIndex(-1); setChatMessages([]); }}>
            ← 返回列表
          </Button>
          <h2 className="font-semibold mt-2">{activeWorkflow.name}</h2>
          <p className="text-xs text-muted-foreground mt-1">{activeWorkflow.description}</p>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-1">
            {activeWorkflow.steps.map((step, idx) => (
              <div
                key={step.id}
                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                  idx === activeStepIndex ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/50'
                }`}
                onClick={() => {
                  if (step.status !== 'pending' || idx === activeStepIndex) {
                    setActiveStepIndex(idx);
                    setChatMessages([]);
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  {getStepIcon(step.status)}
                  <span className={`text-sm font-medium ${idx === activeStepIndex ? 'text-primary' : ''}`}>
                    {step.name}
                  </span>
                </div>
                {step.output && (
                  <p className="text-xs text-emerald-500/80 mt-1 ml-7 line-clamp-2">
                    已完成 — {step.output.slice(0, 50).replace(/[#*\n]/g, ' ')}...
                  </p>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="p-4 border-t border-border/40 space-y-2">
          <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => setMilestoneDialogOpen(true)}>
            <Flag className="h-3.5 w-3.5" />
            标记里程碑
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            disabled={!activeWorkflow.steps.every((s) => s.status === 'completed')}
            onClick={async () => {
              try {
                const completedSteps = activeWorkflow.steps.filter((s) => s.status === 'completed' && s.output);
                if (completedSteps.length === 0) return;

                // Generate PRD content locally
                let prdContent = `# ${activeWorkflow.name}\n\n`;
                prdContent += `> 由 PlanFlow AI 生成 | ${new Date().toLocaleDateString('zh-CN')}\n\n---\n\n`;
                prdContent += `## 项目概述\n\n${activeWorkflow.description}\n\n---\n\n`;

                for (const step of completedSteps) {
                  prdContent += `## ${step.name}\n\n${step.output}\n\n---\n\n`;
                }

                // Create downloadable file
                const blob = new Blob([prdContent], { type: 'text/markdown;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `${activeWorkflow.name}-PRD.md`;
                link.click();
                URL.revokeObjectURL(url);
              } catch (err) {
                console.error('PRD generation error:', err);
              }
            }}
          >
            <FileText className="h-3.5 w-3.5" />
            生成 PRD
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            disabled={!activeWorkflow.steps.every((s) => s.status === 'completed')}
            onClick={() => router.push('/dashboard/demos')}
          >
            <Rocket className="h-3.5 w-3.5" />
            生成 Demo
          </Button>
        </div>
      </div>

      {/* Center: Chat Panel */}
      <div className="flex-1 flex flex-col">
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
              <p className="text-sm text-muted-foreground">当前步骤的 AI 协作已产出结果，确认后将自动推进到下一步</p>
              <Button className="gap-2 bg-[#6C5CE7] hover:bg-[#5A4BD6]" onClick={handleConfirmStep}>
                <CheckCircle2 className="h-4 w-4" />
                确认完成，进入下一步
              </Button>
            </div>
          </div>
        )}

        {/* Chat Input */}
        <div className="p-4 border-t border-border/40">
          <div className="flex gap-2">
            <Input
              placeholder="输入你的问题或指令..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
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
      <div className="w-72 border-l border-border/40 flex flex-col">
        <div className="p-4 border-b border-border/40">
          <h3 className="font-semibold text-sm">上下文面板</h3>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {/* Current Skill Info */}
            {currentSkill && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2">当前 Skill</h4>
                <Card className="border-border/40">
                  <CardContent className="p-3">
                    <p className="font-medium text-sm">{currentSkill.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{currentSkill.description}</p>
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
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2">前序步骤产出</h4>
                {previousSteps.map((step) => (
                  <Card key={step.id} className="border-border/40 mb-2">
                    <CardContent className="p-3">
                      <p className="font-medium text-xs">{step.name}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-4">{step.output}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Knowledge Base Quick Search */}
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2">知识库</h4>
              <Button variant="outline" size="sm" className="w-full gap-2">
                <BookOpen className="h-3.5 w-3.5" />
                查询知识库
              </Button>
            </div>

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

      {/* Milestone Dialog */}
      <Dialog open={milestoneDialogOpen} onOpenChange={setMilestoneDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>标记里程碑</DialogTitle>
            <DialogDescription>为当前工作流状态创建里程碑快照</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">里程碑名称</label>
              <Input
                placeholder="如：评审通过版、定稿版"
                value={milestoneName}
                onChange={(e) => setMilestoneName(e.target.value)}
              />
            </div>
            <Button className="w-full" onClick={handleSaveMilestone} disabled={!milestoneName}>
              创建里程碑
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
