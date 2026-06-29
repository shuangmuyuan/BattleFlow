'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  FileCode2,
  Play,
  BookOpen,
  FileText,
  ArrowRight,
  TrendingUp,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import Link from 'next/link';
import {
  ProductEmptyState,
  StatusBadge,
  appCardClassName,
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
  recentWorkflows?: Array<{ id: string; name: string; status: string; updated_at?: string }>;
  recentSkills?: Array<{ id: string; name: string; scope?: string; version?: string }>;
}

const RECENT_LIST_LIMIT = 5;
const recentListViewportClassName = 'flex max-h-[19.5rem] min-h-0 flex-col gap-2 overflow-y-auto pr-2 [scrollbar-gutter:stable]';

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalSkills: 0,
    totalWorkflows: 0,
    activeWorkflows: 0,
    totalKnowledgeBases: 0,
    completedPrds: 0,
  });
  const [recentWorkflows, setRecentWorkflows] = useState<Array<{ id: string; name: string; status: string; updated_at?: string }>>([]);
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
          setRecentSkills(skills.slice(0, RECENT_LIST_LIMIT));
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

  const visibleRecentWorkflows = recentWorkflows.slice(0, RECENT_LIST_LIMIT);
  const visibleRecentSkills = recentSkills.slice(0, RECENT_LIST_LIMIT);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-3 md:p-4">
      <div className="flex shrink-0 flex-col gap-1 border-b border-border/60 pb-3">
        <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">工作台</h1>
        <p className="text-sm text-muted-foreground">汇总 Skill、工作流和知识资产状态，快速进入产品规划核心任务。</p>
      </div>

      {/* Stats */}
      <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card className={appCardClassName}>
          <CardContent className="flex h-20 items-center gap-3 p-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <FileCode2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.totalSkills}</p>
              <p className="text-xs text-muted-foreground">Skills</p>
            </div>
          </CardContent>
        </Card>
        <Card className={appCardClassName}>
          <CardContent className="flex h-20 items-center gap-3 p-3">
            <div className="rounded-lg bg-brand/10 p-2">
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
            <div className="rounded-lg bg-warning/10 p-2">
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
            <div className="rounded-lg bg-success/10 p-2">
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
            <div className="rounded-lg bg-muted p-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.completedPrds}</p>
              <p className="text-xs text-muted-foreground">PRD 产出</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid shrink-0 grid-cols-1 gap-3 md:grid-cols-3">
        <Link href="/dashboard/workflows">
          <Card className={`${appCardClassName} cursor-pointer group`}>
            <CardContent className="flex h-20 min-w-0 items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2.5">
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
                <div className="rounded-lg bg-brand/10 p-2.5">
                  <FileCode2 className="h-5 w-5 text-brand" />
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
                <div className="rounded-lg bg-success/10 p-2.5">
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

      {/* Recent Workflows & Skills */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-2">
        <Card className={`${appCardClassName} flex min-h-0 flex-col overflow-hidden`}>
          <CardHeader className="shrink-0 px-4 py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">最近工作流</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/workflows">查看全部</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-hidden px-4 pb-4 pt-0">
            <div className={recentListViewportClassName}>
              {visibleRecentWorkflows.length === 0 && !loading ? (
                <ProductEmptyState
                  icon={<Play />}
                  title="暂无最近工作流"
                  description="创建工作流后，最近更新会显示在这里。"
                  className="min-h-32 border-0 bg-muted/30"
                />
              ) : visibleRecentWorkflows.map((wf) => (
                <div key={wf.id} className="flex min-w-0 items-center justify-between gap-3 rounded-lg p-2.5 transition-colors hover:bg-muted/50">
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
                  <StatusBadge tone={wf.status === 'completed' ? 'success' : wf.status === 'in_progress' ? 'brand' : 'neutral'}>
                    {wf.status === 'completed' ? '已完成' : wf.status === 'in_progress' ? '进行中' : '草稿'}
                  </StatusBadge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className={`${appCardClassName} flex min-h-0 flex-col overflow-hidden`}>
          <CardHeader className="shrink-0 px-4 py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">最近使用的 Skills</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/skills">查看全部</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-hidden px-4 pb-4 pt-0">
            <div className={recentListViewportClassName}>
              {recentSkills.length === 0 && !loading ? (
                <ProductEmptyState
                  icon={<FileCode2 />}
                  title="暂无最近 Skill"
                  description="导入或发布 Skill 后，常用能力会显示在这里。"
                  className="min-h-32 border-0 bg-muted/30"
                />
              ) : visibleRecentSkills.map((skill) => (
                <div key={skill.id} className="flex min-w-0 items-center justify-between gap-3 rounded-lg p-2.5 transition-colors hover:bg-muted/50">
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
