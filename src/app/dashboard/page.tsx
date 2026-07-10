'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileCode2,
  Play,
  BookOpen,
  FileText,
  ArrowRight,
  TrendingUp,
  Clock,
  CheckCircle2,
  LayoutDashboard,
  Plus,
} from 'lucide-react';
import Link from 'next/link';
import {
  ProductEmptyState,
  SectionTitle,
  StatusBadge,
  appCardClassName,
  appPageClassName,
} from '@/components/battleflow/ui';

interface DashboardStats {
  totalSkills: number;
  totalWorkflows: number;
  activeWorkflows: number;
  totalKnowledgeBases: number;
  completedPrds: number;
}

interface DashboardStatsResponse {
  skillCount?: number;
  workflowCount?: number;
  activeWorkflowCount?: number;
  knowledgeBaseCount?: number;
  completedPrdCount?: number;
  recentWorkflows?: RecentWorkflow[];
  recentSkills?: Array<{ id: string; name: string; scope?: string; version?: string }>;
}

interface RecentWorkflow {
  id: string;
  workspaceId?: string;
  name: string;
  status: string;
  updated_at?: string;
}

const recentListViewportClassName = 'h-full max-h-[21rem] min-h-0 rounded-md';
const recentListContentClassName = 'flex min-h-full flex-col gap-2 pr-3';

function getWorkflowHref(workflow: RecentWorkflow) {
  const params = new URLSearchParams();
  if (workflow.workspaceId) {
    params.set('workspaceId', workflow.workspaceId);
  }
  params.set('workflowId', workflow.id);
  return `/dashboard/workflows?${params.toString()}`;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalSkills: 0,
    totalWorkflows: 0,
    activeWorkflows: 0,
    totalKnowledgeBases: 0,
    completedPrds: 0,
  });
  const [recentWorkflows, setRecentWorkflows] = useState<RecentWorkflow[]>([]);
  const [recentSkills, setRecentSkills] = useState<Array<{ id: string; name: string; scope?: string; version?: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function loadDashboard() {
      setLoading(true);
      try {
        const [statsRes, skillsRes] = await Promise.all([
          fetch('/api/dashboard/stats', { cache: 'no-store' }),
          fetch('/api/skills', { cache: 'no-store' }),
        ]);
        const statsData = await statsRes.json() as DashboardStatsResponse;
        const skillsData = await skillsRes.json();
        const workflows = Array.isArray(statsData.recentWorkflows) ? statsData.recentWorkflows : [];
        const skills = Array.isArray(statsData.recentSkills)
          ? statsData.recentSkills
          : Array.isArray(skillsData.skills)
            ? skillsData.skills
            : [];
        if (!ignore) {
          setRecentWorkflows(workflows);
          setRecentSkills(skills);
          setStats({
            totalSkills: statsData.skillCount ?? skills.length,
            totalWorkflows: statsData.workflowCount ?? workflows.length,
            activeWorkflows: statsData.activeWorkflowCount
              ?? workflows.filter((workflow) => workflow.status === 'in_progress').length,
            totalKnowledgeBases: statsData.knowledgeBaseCount ?? 0,
            completedPrds: statsData.completedPrdCount ?? 0,
          });
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    void loadDashboard();
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <div className={`${appPageClassName} content-enter`}>
      <div className="flex shrink-0 flex-col gap-4 border-b border-border/70 bg-card/45 px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-brand/20 bg-brand/10 text-brand shadow-sm">
            <LayoutDashboard className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-info">PRODUCT PLANNING DESK</p>
            <h1 className="truncate text-xl font-semibold text-foreground md:text-2xl">工作台</h1>
            <p className="mt-1 text-sm text-muted-foreground">掌握团队资产与执行状态，继续最重要的产品规划任务。</p>
          </div>
        </div>
        <Button asChild className="w-full sm:w-auto">
          <Link href="/dashboard/workflows">
            <Plus className="size-4" />
            新建工作流
          </Link>
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4 md:p-5">
        <div className="flex min-h-full flex-col gap-4">

      {/* Stats */}
      <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card className={`${appCardClassName} overflow-hidden`}>
          <CardContent className="flex h-20 items-center gap-3 p-3">
            <div className="rounded-md border border-info/20 bg-info/10 p-2">
              <FileCode2 className="h-5 w-5 text-info" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.totalSkills}</p>
              <p className="text-xs text-muted-foreground">Skills</p>
            </div>
          </CardContent>
        </Card>
        <Card className={appCardClassName}>
          <CardContent className="flex h-20 items-center gap-3 p-3">
            <div className="rounded-md border border-brand/20 bg-brand/10 p-2">
              <Play className="h-5 w-5 text-brand" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.totalWorkflows}</p>
              <p className="text-xs text-muted-foreground">工作流</p>
            </div>
          </CardContent>
        </Card>
        <Card className={appCardClassName}>
          <CardContent className="flex h-20 items-center gap-3 p-3">
            <div className="rounded-md border border-warning/20 bg-warning/10 p-2">
              <TrendingUp className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.activeWorkflows}</p>
              <p className="text-xs text-muted-foreground">进行中</p>
            </div>
          </CardContent>
        </Card>
        <Card className={appCardClassName}>
          <CardContent className="flex h-20 items-center gap-3 p-3">
            <div className="rounded-md border border-success/20 bg-success/10 p-2">
              <BookOpen className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.totalKnowledgeBases}</p>
              <p className="text-xs text-muted-foreground">知识库</p>
            </div>
          </CardContent>
        </Card>
        <Card className={appCardClassName}>
          <CardContent className="flex h-20 items-center gap-3 p-3">
            <div className="rounded-md border border-border bg-muted p-2">
              <FileText className="h-5 w-5 text-foreground/70" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.completedPrds}</p>
              <p className="text-xs text-muted-foreground">PRD 产出</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="space-y-3">
        <SectionTitle title="快捷入口" description="从高频任务直接开始，不必穿过多层页面。" />
        <div className="grid shrink-0 grid-cols-1 gap-3 md:grid-cols-3">
        <Link href="/dashboard/workflows">
          <Card className={`${appCardClassName} cursor-pointer group`}>
            <CardContent className="flex h-20 min-w-0 items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="rounded-md border border-brand/20 bg-brand/10 p-2.5">
                  <Play className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">新建工作流</p>
                  <p className="text-xs text-muted-foreground">编排 Skill 产出 PRD</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/skills">
          <Card className={`${appCardClassName} cursor-pointer group`}>
            <CardContent className="flex h-20 min-w-0 items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="rounded-md border border-info/20 bg-info/10 p-2.5">
                  <FileCode2 className="h-5 w-5 text-info" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">管理 Skills</p>
                  <p className="text-xs text-muted-foreground">导入和更新 Skill</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/knowledge">
          <Card className={`${appCardClassName} cursor-pointer group`}>
            <CardContent className="flex h-20 min-w-0 items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="rounded-md border border-success/20 bg-success/10 p-2.5">
                  <BookOpen className="h-5 w-5 text-success" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">知识库</p>
                  <p className="text-xs text-muted-foreground">管理和检索知识</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
            </CardContent>
          </Card>
        </Link>
        </div>
      </div>

      {/* Recent Workflows & Skills */}
      <div className="grid min-h-[22rem] flex-1 grid-cols-1 gap-4 lg:grid-cols-2 lg:[grid-auto-rows:minmax(0,1fr)]">
        <Card className={`${appCardClassName} flex min-h-0 flex-col overflow-hidden`}>
          <CardHeader className="shrink-0 px-4 py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="flex size-7 items-center justify-center rounded-sm bg-brand/10 text-brand"><Play className="size-4" /></span>
                最近工作流
              </CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/workflows">查看全部</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-hidden px-4 pb-4 pt-0">
            <ScrollArea className={recentListViewportClassName}>
              <div className={recentListContentClassName}>
                {recentWorkflows.length === 0 && !loading ? (
                  <ProductEmptyState
                    icon={<Play />}
                    title="暂无最近工作流"
                    description="创建工作流后，最近更新会显示在这里。"
                    className="min-h-32 border-0 bg-muted/30"
                  />
                ) : recentWorkflows.map((wf) => (
                  <Link
                    key={wf.id}
                    href={getWorkflowHref(wf)}
                    className="group flex min-w-0 items-center justify-between gap-3 rounded-md border border-transparent p-2.5 transition-colors hover:border-border/60 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    aria-label={`打开工作流 ${wf.name}`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {wf.status === 'completed' ? (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      ) : wf.status === 'in_progress' ? (
                        <Clock className="h-4 w-4 text-warning" />
                      ) : (
                        <Play className="h-4 w-4 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{wf.name}</p>
                        <p className="text-xs text-muted-foreground">
                          更新于 {wf.updated_at ? new Date(wf.updated_at).toLocaleDateString('zh-CN') : '-'}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge tone={wf.status === 'completed' ? 'success' : wf.status === 'in_progress' ? 'brand' : 'neutral'}>
                        {wf.status === 'completed' ? '已完成' : wf.status === 'in_progress' ? '进行中' : '草稿'}
                      </StatusBadge>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                    </div>
                  </Link>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className={`${appCardClassName} flex min-h-0 flex-col overflow-hidden`}>
          <CardHeader className="shrink-0 px-4 py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="flex size-7 items-center justify-center rounded-sm bg-info/10 text-info"><FileCode2 className="size-4" /></span>
                最近使用的 Skills
              </CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/skills">查看全部</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-hidden px-4 pb-4 pt-0">
            <ScrollArea className={recentListViewportClassName}>
              <div className={recentListContentClassName}>
                {recentSkills.length === 0 && !loading ? (
                  <ProductEmptyState
                    icon={<FileCode2 />}
                    title="暂无最近 Skill"
                    description="导入或发布 Skill 后，常用能力会显示在这里。"
                    className="min-h-32 border-0 bg-muted/30"
                  />
                ) : recentSkills.map((skill) => (
                  <div key={skill.id} className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-transparent p-2.5 transition-colors hover:border-border/60 hover:bg-muted/50">
                    <div className="flex min-w-0 items-center gap-3">
                      <FileCode2 className="h-4 w-4 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{skill.name}</p>
                        <p className="text-xs text-muted-foreground">v{skill.version}</p>
                      </div>
                    </div>
                    <StatusBadge tone={skill.scope === 'official' ? 'brand' : skill.scope === 'team' ? 'success' : 'neutral'}>
                      {skill.scope === 'official' ? '官方' : skill.scope === 'team' ? '团队' : '个人'}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
        </div>
      </div>
    </div>
  );
}
