'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

interface DashboardStats {
  totalSkills: number;
  totalWorkflows: number;
  activeWorkflows: number;
  totalKnowledgeBases: number;
  completedPrds: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalSkills: 4,
    totalWorkflows: 3,
    activeWorkflows: 1,
    totalKnowledgeBases: 4,
    completedPrds: 2,
  });

  const recentWorkflows = [
    { id: '1', name: '电商平台 v3.0 规划', status: 'in_progress', steps: 4, completedSteps: 1, updatedAt: '2小时前' },
    { id: '2', name: '支付系统重构需求', status: 'completed', steps: 3, completedSteps: 3, updatedAt: '1天前' },
    { id: '3', name: '会员体系升级', status: 'draft', steps: 0, completedSteps: 0, updatedAt: '3天前' },
  ];

  const recentSkills = [
    { id: '1', name: '竞品分析', scope: 'official', version: '1.2.0' },
    { id: '2', name: '市场洞察', scope: 'team', version: '1.0.0' },
    { id: '3', name: '用户需求拆解', scope: 'personal', version: '2.0.0' },
    { id: '4', name: '技术可行性评估', scope: 'team', version: '1.1.0' },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-8 overflow-auto p-4 md:p-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">欢迎回来</h1>
        <p className="text-muted-foreground mt-1">这是你的 AI Native 产品规划工作台</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="border-border/60">
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
        <Card className="border-border/60">
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
        <Card className="border-border/60">
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
        <Card className="border-border/60">
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
        <Card className="border-border/60">
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
          <Card className="border-border/60 hover:shadow-md transition-shadow cursor-pointer group">
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
          <Card className="border-border/60 hover:shadow-md transition-shadow cursor-pointer group">
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
          <Card className="border-border/60 hover:shadow-md transition-shadow cursor-pointer group">
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
        <Card className="border-border/60">
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
              {recentWorkflows.map((wf) => (
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
                        {wf.completedSteps}/{wf.steps} 步骤完成 · {wf.updatedAt}
                      </p>
                    </div>
                  </div>
                  <Badge variant={wf.status === 'completed' ? 'default' : wf.status === 'in_progress' ? 'secondary' : 'outline'}>
                    {wf.status === 'completed' ? '已完成' : wf.status === 'in_progress' ? '进行中' : '草稿'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60">
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
              {recentSkills.map((skill) => (
                <div key={skill.id} className="flex min-w-0 items-center justify-between gap-3 rounded-lg p-3 transition-colors hover:bg-muted/50">
                  <div className="flex min-w-0 items-center gap-3">
                    <FileCode2 className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{skill.name}</p>
                      <p className="text-xs text-muted-foreground">v{skill.version}</p>
                    </div>
                  </div>
                  <Badge
                    variant={skill.scope === 'official' ? 'default' : skill.scope === 'team' ? 'secondary' : 'outline'}
                  >
                    {skill.scope === 'official' ? '官方' : skill.scope === 'team' ? '团队' : '个人'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
