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
  PageHeader,
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
        const statsData = await statsRes.json();
        const skillsData = await skillsRes.json();
        const workflows = Array.isArray(statsData.recentWorkflows) ? statsData.recentWorkflows : [];
        const skills = Array.isArray(skillsData.skills) ? skillsData.skills : [];
        if (!ignore) {
          setRecentWorkflows(workflows);
          setRecentSkills(skills.slice(0, 5));
          setStats({
            totalSkills: statsData.skillCount || skills.length || 0,
            totalWorkflows: statsData.workflowCount || workflows.length || 0,
            activeWorkflows: workflows.filter((workflow: { status?: string }) => workflow.status === 'in_progress').length,
            totalKnowledgeBases: statsData.knowledgeBaseCount || 0,
            completedPrds: workflows.filter((workflow: { status?: string }) => workflow.status === 'completed').length,
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
    <div className="flex h-full min-h-0 flex-col gap-8 overflow-auto p-4 md:p-6">
      <PageHeader
        title="工作台"
        description="汇总 Skill、工作流和知识资产状态，快速进入产品规划核心任务。"
      />

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className={appCardClassName}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <FileCode2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.totalSkills}</p>
              <p className="text-xs text-muted-foreground">Skills</p>
            </div>
          </CardContent>
        </Card>
        <Card className={appCardClassName}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Play className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.totalWorkflows}</p>
              <p className="text-xs text-muted-foreground">工作流</p>
            </div>
          </CardContent>
        </Card>
        <Card className={appCardClassName}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <TrendingUp className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.activeWorkflows}</p>
              <p className="text-xs text-muted-foreground">进行中</p>
            </div>
          </CardContent>
        </Card>
        <Card className={appCardClassName}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <BookOpen className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.totalKnowledgeBases}</p>
              <p className="text-xs text-muted-foreground">知识库</p>
            </div>
          </CardContent>
        </Card>
        <Card className={appCardClassName}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <FileText className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.completedPrds}</p>
              <p className="text-xs text-muted-foreground">PRD 产出</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Link href="/dashboard/workflows">
          <Card className={`${appCardClassName} cursor-pointer group`}>
            <CardContent className="flex min-w-0 items-center justify-between gap-4 p-6">
              <div className="flex min-w-0 items-center gap-3">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Play className="h-6 w-6 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold">新建工作流</p>
                  <p className="text-sm text-muted-foreground">编排 Skill 产出 PRD</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/skills">
          <Card className={`${appCardClassName} cursor-pointer group`}>
            <CardContent className="flex min-w-0 items-center justify-between gap-4 p-6">
              <div className="flex min-w-0 items-center gap-3">
                <div className="p-3 rounded-lg bg-blue-500/10">
                  <FileCode2 className="h-6 w-6 text-blue-500" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold">管理 Skills</p>
                  <p className="text-sm text-muted-foreground">导入和更新 Skill</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/knowledge">
          <Card className={`${appCardClassName} cursor-pointer group`}>
            <CardContent className="flex min-w-0 items-center justify-between gap-4 p-6">
              <div className="flex min-w-0 items-center gap-3">
                <div className="p-3 rounded-lg bg-emerald-500/10">
                  <BookOpen className="h-6 w-6 text-emerald-500" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold">知识库</p>
                  <p className="text-sm text-muted-foreground">管理和检索知识</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Recent Workflows & Skills */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className={appCardClassName}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">最近工作流</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/workflows">查看全部</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {recentWorkflows.length === 0 && !loading ? (
                <ProductEmptyState
                  icon={<Play />}
                  title="暂无最近工作流"
                  description="创建工作流后，最近更新会显示在这里。"
                  className="min-h-48 border-0 bg-muted/30"
                />
              ) : recentWorkflows.map((wf) => (
                <div key={wf.id} className="flex min-w-0 flex-col gap-3 rounded-lg p-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    {wf.status === 'completed' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : wf.status === 'in_progress' ? (
                      <Clock className="h-4 w-4 text-blue-500" />
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

        <Card className={appCardClassName}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">最近使用的 Skills</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/skills">查看全部</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {recentSkills.length === 0 && !loading ? (
                <ProductEmptyState
                  icon={<FileCode2 />}
                  title="暂无最近 Skill"
                  description="导入或发布 Skill 后，常用能力会显示在这里。"
                  className="min-h-48 border-0 bg-muted/30"
                />
              ) : recentSkills.map((skill) => (
                <div key={skill.id} className="flex min-w-0 items-center justify-between gap-3 rounded-lg p-3 transition-colors hover:bg-muted/50">
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
