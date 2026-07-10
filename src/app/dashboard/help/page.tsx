'use client';

import {
  BookOpen,
  Database,
  FileUp,
  MessageSquare,
  Play,
  Route,
  ShieldCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PageHeader, appCardClassName, appPageClassName } from '@/components/battleflow/ui';
import { cn } from '@/lib/utils';

const guideSections = [
  {
    title: '准备 Skill 和知识',
    description: '从 Skill 仓库选择方法包，知识库中补充 PDF、Excel、Word 或 Markdown 资料。',
    icon: Database,
    steps: ['导入或发布可复用 Skill', '上传业务资料到知识库', '进入工作流后按步骤选择需要注入的上下文'],
  },
  {
    title: '创建工作流',
    description: '在工作目录中新建工作流，至少选择 3 个 Skill，并设置串行或并行执行关系。',
    icon: Route,
    steps: ['连续并行步骤会组成同一任务组', '点击“新组”可拆分为下一阶段并行组', '后续串行步骤会等待上一组完成后继续'],
  },
  {
    title: '补充上下文并对话',
    description: '在每个步骤里发送问题、附件或截图，系统会把可读资料交给运行时处理。',
    icon: MessageSquare,
    steps: ['发送后输入框会清空附件和文本', '切换步骤或刷新页面后会恢复当前工作流位置', '正在执行的步骤会保留聊天记录和处理状态'],
  },
  {
    title: '确认产物并继续',
    description: '步骤产物通过校验后会保存为后续步骤上下文，未通过时可继续修订。',
    icon: ShieldCheck,
    steps: ['查看右侧产出和审核结果', '补充修改意见后重新生成', '确认通过后自动推进到下一任务组'],
  },
];

const quickTips = [
  { label: '权限', value: '个人创建的工作流默认仅本人可见，需共享后其他成员才能访问。' },
  { label: '文件', value: '上下文支持文本、PDF、Excel、Word 和图片；知识库支持可抽取文本的资料。' },
  { label: '执行', value: '并行任务可以同时推进，页面刷新后会按 URL 和本地状态恢复位置。' },
];

export default function DashboardHelpPage() {
  return (
    <div className={`${appPageClassName} content-enter`}>
      <PageHeader
        icon={<BookOpen />}
        title="使用说明"
        description="按 Skill、知识、工作流、产物四个环节组织产品规划工作。"
        meta={<Badge variant="secondary">BattleFlow Guide</Badge>}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            {guideSections.map((section, index) => {
              const Icon = section.icon;

              return (
                <Card key={section.title} className={cn(appCardClassName, 'rounded-lg')}>
                  <CardHeader className="gap-3">
                    <div className="flex items-start gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                        <Icon className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <CardTitle className="text-base leading-6">
                          {index + 1}. {section.title}
                        </CardTitle>
                        <CardDescription className="mt-1 leading-6">
                          {section.description}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ol className="space-y-2 text-sm text-muted-foreground">
                      {section.steps.map((step) => (
                        <li key={step} className="flex gap-2">
                          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
                          <span className="leading-6">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="space-y-4">
            <Card className={cn(appCardClassName, 'rounded-lg')}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Play className="size-4 text-brand" />
                  快速开始
                </CardTitle>
                <CardDescription>首次使用建议按顺序完成。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 leading-6">
                  先进入工作流目录，选择一个空间并创建工作流；进入步骤后补充上下文，再发送问题或附件生成产物。
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 leading-6">
                  如需跨阶段并行，在连续并行步骤之间打开“新组”，即可表达“2、3 并行，完成后 4、5 并行”。
                </div>
              </CardContent>
            </Card>

            <Card className={cn(appCardClassName, 'rounded-lg')}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BookOpen className="size-4 text-brand" />
                  注意事项
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {quickTips.map((tip) => (
                  <div key={tip.label} className="flex gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                    <Badge variant="outline" className="h-6 shrink-0">
                      {tip.label}
                    </Badge>
                    <p className="text-sm leading-6 text-muted-foreground">{tip.value}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className={cn(appCardClassName, 'rounded-lg')}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileUp className="size-4 text-brand" />
                  文件上传
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-muted-foreground">
                  PDF、Excel、Word 会先抽取文本再作为上下文；图片会作为运行时附件发送，不会展示在右侧上下文面板中。
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
