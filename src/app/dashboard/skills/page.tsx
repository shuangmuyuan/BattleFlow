'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Archive, CheckCircle2, Download, FileCode2, GitBranch, GitPullRequest, Globe, MoreVertical, RotateCcw, Search, Star, Tag, Upload, XCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

type SkillScope = 'personal' | 'team' | 'official';
type SkillSourceType = 'local' | 'registry' | 'git';
type SkillStatus = 'imported' | 'pending_review' | 'published' | 'rejected' | 'archived';
type VersionBump = 'patch' | 'minor' | 'major';

interface SkillVersion {
  version: string;
  updated_at: string;
  changelog: string;
}

interface SkillReview {
  source_skill_id: string;
  source_version: string;
  submitted_at: string;
  submitted_note?: string;
  reviewed_at?: string;
  review_note?: string;
  decision?: 'approved' | 'rejected';
}

interface Skill {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  tags: string[];
  source_type: SkillSourceType;
  source_uri?: string;
  methodology: string;
  tools: string[];
  outputs: Record<string, unknown>;
  checklist: string[];
  prompt_template?: string;
  scope: SkillScope;
  status: SkillStatus;
  updated_at: string;
  skill_md: string;
  meta_json: Record<string, unknown>;
  changelog: string;
  attachments: string[];
  versions: SkillVersion[];
  review?: SkillReview;
}

interface ApiSkillResponse {
  skill?: Skill;
  skills?: Skill[];
  error?: string;
}

const scopeLabels: Record<SkillScope, string> = {
  personal: '个人私有',
  team: '团队共享',
  official: '官方模板',
};

const statusLabels: Record<SkillStatus, string> = {
  imported: '已导入',
  pending_review: '待审核',
  published: '已发布',
  rejected: '已拒绝',
  archived: '已归档',
};

const sourceLabels: Record<SkillSourceType, string> = {
  local: '本地导入',
  registry: '注册中心',
  git: 'Git 同步',
};

const versionBumpLabels: Record<VersionBump, string> = {
  patch: '小修订',
  minor: '能力增强',
  major: '不兼容变更',
};

const versionBumpDescriptions: Record<VersionBump, string> = {
  patch: '修正文案、提示词、模板细节或小问题，例如 1.0.0 → 1.0.1。',
  minor: '新增能力、模板章节、工具或适用场景，例如 1.0.0 → 1.1.0。',
  major: '改变输入输出契约、执行方式或不兼容旧用法，例如 1.0.0 → 2.0.0。',
};

const codeBlockClassName = 'w-full max-w-full min-w-0 overflow-x-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/30 p-4 font-mono';

function formatDate(value: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return '操作失败';
}

function getSourceIcon(type: SkillSourceType) {
  switch (type) {
    case 'git':
      return <GitBranch />;
    case 'registry':
      return <Globe />;
    default:
      return <FileCode2 />;
  }
}

function ScopeBadge({ scope }: { scope: SkillScope }) {
  if (scope === 'official') {
    return (
      <Badge>
        <Star />
        {scopeLabels[scope]}
      </Badge>
    );
  }

  return (
    <Badge variant={scope === 'team' ? 'secondary' : 'outline'}>
      {scopeLabels[scope]}
    </Badge>
  );
}

function StatusBadge({ status }: { status: SkillStatus }) {
  const variant = status === 'published' ? 'default' : status === 'pending_review' ? 'secondary' : status === 'rejected' ? 'destructive' : 'outline';
  return <Badge variant={variant}>{statusLabels[status]}</Badge>;
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | SkillScope>('all');
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [detailSkill, setDetailSkill] = useState<Skill | null>(null);
  const [versionSkill, setVersionSkill] = useState<Skill | null>(null);
  const [downloadNotice, setDownloadNotice] = useState<{ fileName: string; previewUrl: string } | null>(null);
  const [reviewRequestSkill, setReviewRequestSkill] = useState<Skill | null>(null);
  const [reviewRequestNote, setReviewRequestNote] = useState('');
  const [reviewDecisionSkill, setReviewDecisionSkill] = useState<Skill | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'approved' | 'rejected'>('approved');
  const [reviewDecisionNote, setReviewDecisionNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [importSource, setImportSource] = useState<SkillSourceType>('local');
  const [importScope, setImportScope] = useState<'personal' | 'team'>('personal');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [serverPath, setServerPath] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [versionBump, setVersionBump] = useState<VersionBump>('patch');
  const [importChangelogNote, setImportChangelogNote] = useState('');

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const res = await fetch('/api/skills', { cache: 'no-store' });
      const data = (await res.json()) as ApiSkillResponse;
      if (!res.ok) throw new Error(data.error || 'Failed to fetch skills');
      setSkills(data.skills || []);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  const filteredSkills = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return skills.filter((skill) => {
      const matchesSearch =
        !query ||
        skill.name.toLowerCase().includes(query) ||
        skill.description.toLowerCase().includes(query) ||
        skill.tags.some((tag) => tag.toLowerCase().includes(query));
      const matchesTab = activeTab === 'all' || skill.scope === activeTab;
      return matchesSearch && matchesTab;
    });
  }, [activeTab, searchQuery, skills]);

  const skillCounts = useMemo(() => {
    return skills.reduce(
      (counts, skill) => {
        counts.all += 1;
        counts[skill.scope] += 1;
        return counts;
      },
      { all: 0, official: 0, team: 0, personal: 0 },
    );
  }, [skills]);

  const updateSkillInState = (skill: Skill) => {
    setSkills((prev) => {
      const exists = prev.some((item) => item.id === skill.id);
      const next = exists
        ? prev.map((item) => (item.id === skill.id ? skill : item))
        : [skill, ...prev];
      return next.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    });
    setDetailSkill((prev) => (prev?.id === skill.id ? skill : prev));
    setVersionSkill((prev) => (prev?.id === skill.id ? skill : prev));
    setReviewDecisionSkill((prev) => (prev?.id === skill.id ? skill : prev));
  };

  const runSkillAction = async (body: Record<string, unknown>, success: string) => {
    setActionLoading(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as ApiSkillResponse;
      if (!res.ok) throw new Error(data.error || 'Skill operation failed');
      if (data.skill) updateSkillInState(data.skill);
      if (data.skills) await fetchSkills();
      setSuccessMessage(success);
      return true;
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      return false;
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestReview = async () => {
    if (!reviewRequestSkill) return;
    const ok = await runSkillAction(
      { action: 'publish_request', id: reviewRequestSkill.id, note: reviewRequestNote },
      '已创建团队审核副本，个人 Skill 已保留',
    );
    if (ok) {
      setReviewRequestSkill(null);
      setReviewRequestNote('');
    }
  };

  const handleReviewDecision = async () => {
    if (!reviewDecisionSkill) return;
    const ok = await runSkillAction(
      {
        action: reviewDecision === 'approved' ? 'approve_publish' : 'reject_review',
        id: reviewDecisionSkill.id,
        note: reviewDecisionNote,
      },
      reviewDecision === 'approved' ? '已通过审核并发布到团队仓库' : '已拒绝该团队审核',
    );
    if (ok) {
      setReviewDecisionSkill(null);
      setReviewDecisionNote('');
      setReviewDecision('approved');
    }
  };

  const handleImport = async () => {
    setActionLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      let res: Response;
      if (importSource === 'local' && selectedFile) {
        const formData = new FormData();
        formData.set('action', 'import_upload');
        formData.set('scope', importScope);
        formData.set('version_bump', versionBump);
        formData.set('changelog_note', importChangelogNote.trim());
        formData.set('file', selectedFile);
        res = await fetch('/api/skills', { method: 'POST', body: formData });
      } else if (importSource === 'local') {
        if (!serverPath.trim()) throw new Error('请选择 zip 包或填写远端 Skill 目录路径');
        res = await fetch('/api/skills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'import_path',
            path: serverPath.trim(),
            scope: importScope,
            version_bump: versionBump,
            changelog_note: importChangelogNote.trim(),
          }),
        });
      } else if (importSource === 'git') {
        if (!importUrl.trim()) throw new Error('请填写 Git 仓库地址');
        res = await fetch('/api/skills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'import_git',
            url: importUrl.trim(),
            scope: importScope,
            version_bump: versionBump,
            changelog_note: importChangelogNote.trim(),
          }),
        });
      } else {
        res = await fetch('/api/skills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'import_registry',
            url: importUrl.trim(),
            scope: importScope,
            version_bump: versionBump,
            changelog_note: importChangelogNote.trim(),
          }),
        });
      }

      const data = (await res.json()) as ApiSkillResponse;
      if (!res.ok) throw new Error(data.error || 'Import failed');

      await fetchSkills();
      setImportDialogOpen(false);
      setSelectedFile(null);
      setServerPath('');
      setImportUrl('');
      setImportChangelogNote('');
      const importedSummary = (data.skills || []).map((skill) => `${skill.name} v${skill.version}`).join('、');
      setSuccessMessage(importedSummary ? `已导入/更新 ${importedSummary}` : '未导入 Skill');
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (skill: Skill) => {
    setActionLoading(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const res = await fetch(`/api/skills?id=${encodeURIComponent(skill.id)}`, { method: 'DELETE' });
      const data = (await res.json()) as ApiSkillResponse;
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      setSkills((prev) => prev.filter((item) => item.id !== skill.id));
      setDetailSkill((prev) => (prev?.id === skill.id ? null : prev));
      setVersionSkill((prev) => (prev?.id === skill.id ? null : prev));
      setSuccessMessage(`已移除 ${skill.name}`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setActionLoading(false);
    }
  };

  const getDownloadUrl = (skill: Skill, version: SkillVersion) => {
    return `/api/skills?id=${encodeURIComponent(skill.id)}&downloadVersion=${encodeURIComponent(version.version)}`;
  };

  const getPreviewUrl = (skill: Skill, version: SkillVersion) => {
    return `${getDownloadUrl(skill, version)}&inline=1`;
  };

  const getDownloadFileName = (skill: Skill, version: SkillVersion) => {
    return `${skill.name}-v${version.version}.md`.replace(/[\\/:*?"<>|]/g, '-');
  };

  const renderSourceMeta = (skill: Skill) => {
    const source = skill.source_uri || sourceLabels[skill.source_type];
    return source.length > 72 ? `${source.slice(0, 72)}...` : source;
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border/40 p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Skill 仓库</h1>
          <p className="mt-1 text-sm text-muted-foreground">导入、审核、发布和追踪产品规划 Skill</p>
        </div>
        <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Upload data-icon="inline-start" />
              导入 Skill
            </Button>
          </DialogTrigger>
          <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0">
            <DialogHeader className="border-b border-border/40 px-6 py-5 pr-12">
              <DialogTitle>导入 Skill</DialogTitle>
              <DialogDescription>
                支持上传 zip 包、填写远端目录路径或同步 Git 仓库。远程注册中心 API 先保留入口。
              </DialogDescription>
            </DialogHeader>

            <FieldGroup className="min-h-0 flex-1 gap-5 overflow-y-auto px-6 py-4">
              <Field>
                <FieldLabel>导入目标</FieldLabel>
                <ToggleGroup
                  type="single"
                  value={importScope}
                  onValueChange={(value) => value && setImportScope(value as 'personal' | 'team')}
                  className="justify-start"
                >
                  <ToggleGroupItem value="personal">个人私有</ToggleGroupItem>
                  <ToggleGroupItem value="team">提交团队审核</ToggleGroupItem>
                </ToggleGroup>
                <FieldDescription>
                  个人 Skill 导入后立即可用；团队 Skill 会进入待审核状态。
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel>来源</FieldLabel>
                <Tabs value={importSource} onValueChange={(value) => setImportSource(value as SkillSourceType)}>
                  <TabsList>
                    <TabsTrigger value="local">本地 / 路径</TabsTrigger>
                    <TabsTrigger value="git">Git 仓库</TabsTrigger>
                    <TabsTrigger value="registry">注册中心</TabsTrigger>
                  </TabsList>
                  <TabsContent value="local" className="mt-4">
                    <FieldGroup className="gap-4">
                      <Field>
                        <FieldLabel htmlFor="skill-package">上传 zip 包</FieldLabel>
                        <Input
                          id="skill-package"
                          type="file"
                          accept=".zip"
                          onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                        />
                        <FieldDescription>
                          zip 内应包含 skill.md、meta.json、CHANGELOG.md，或包含 registry.json 的批量包。
                        </FieldDescription>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="server-path">远端目录路径</FieldLabel>
                        <Input
                          id="server-path"
                          placeholder="/root/data/skill-packages/market-insight"
                          value={serverPath}
                          onChange={(event) => setServerPath(event.target.value)}
                        />
                        <FieldDescription>
                          用于在服务器上调试导入目录或 registry.json，允许根目录限制在项目目录和 /root/data。
                        </FieldDescription>
                      </Field>
                    </FieldGroup>
                  </TabsContent>
                  <TabsContent value="git" className="mt-4">
                    <Field>
                      <FieldLabel htmlFor="git-url">Git 仓库地址</FieldLabel>
                      <Input
                        id="git-url"
                        placeholder="https://github.com/org/skill-library.git"
                        value={importUrl}
                        onChange={(event) => setImportUrl(event.target.value)}
                      />
                      <FieldDescription>
                        仓库根目录可以是单个 Skill 包、registry.json、Claude plugin；也可以追加 #skills/path 导入子目录。
                      </FieldDescription>
                    </Field>
                  </TabsContent>
                  <TabsContent value="registry" className="mt-4">
                    <Alert>
                      <AlertCircle />
                      <AlertTitle>接口预留</AlertTitle>
                      <AlertDescription>
                        远程注册中心 API 会保留入口，本阶段先落地本地包和 Git 仓库两种来源。
                      </AlertDescription>
                    </Alert>
                  </TabsContent>
                </Tabs>
              </Field>

              <Field>
                <FieldLabel>版本更新方式</FieldLabel>
                <ToggleGroup
                  type="single"
                  value={versionBump}
                  onValueChange={(value) => value && setVersionBump(value as VersionBump)}
                  className="flex-wrap justify-start"
                >
                  <ToggleGroupItem value="patch">小修订</ToggleGroupItem>
                  <ToggleGroupItem value="minor">能力增强</ToggleGroupItem>
                  <ToggleGroupItem value="major">不兼容变更</ToggleGroupItem>
                </ToggleGroup>
                <FieldDescription>
                  新 Skill 首次导入保留包内版本；如果导入包与已有 Skill ID 相同，平台会自动按“{versionBumpLabels[versionBump]}”递增版本号，{versionBumpDescriptions[versionBump]}
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="skill-changelog">变更说明</FieldLabel>
                <Textarea
                  id="skill-changelog"
                  placeholder="例如：补充 TR1 AI 上下文输出规则，优化 Story 验收标准模板。"
                  value={importChangelogNote}
                  onChange={(event) => setImportChangelogNote(event.target.value)}
                />
                <FieldDescription>
                  当本次导入更新已有 Skill 时，会写入版本历史；留空时平台自动生成一条升级说明。
                </FieldDescription>
              </Field>

              {errorMessage && (
                <FieldError>{errorMessage}</FieldError>
              )}

              <Button onClick={handleImport} disabled={actionLoading}>
                <Upload data-icon="inline-start" />
                {actionLoading ? '导入中...' : '确认导入'}
              </Button>
            </FieldGroup>
          </DialogContent>
        </Dialog>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="flex flex-col gap-6 p-6">
          {successMessage && (
            <Alert>
              <CheckCircle2 />
              <AlertTitle>操作完成</AlertTitle>
              <AlertDescription>{successMessage}</AlertDescription>
            </Alert>
          )}

          {errorMessage && !importDialogOpen && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>操作失败</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <div className="relative min-w-72 flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索 Skill 名称、描述或标签..."
                className="pl-10"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'all' | SkillScope)}>
              <TabsList>
                <TabsTrigger value="all">全部 {skillCounts.all}</TabsTrigger>
                <TabsTrigger value="official">官方 {skillCounts.official}</TabsTrigger>
                <TabsTrigger value="team">团队 {skillCounts.team}</TabsTrigger>
                <TabsTrigger value="personal">个人 {skillCounts.personal}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {loading ? (
            <div className="py-20 text-center text-muted-foreground">加载中...</div>
          ) : filteredSkills.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileCode2 />
                </EmptyMedia>
                <EmptyTitle>暂无匹配 Skill</EmptyTitle>
                <EmptyDescription>可以上传 zip 包，或从 Git 仓库导入一批 Skill。</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => setImportDialogOpen(true)}>
                  <Upload data-icon="inline-start" />
                  导入 Skill
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredSkills.map((skill) => (
                <Card
                  key={skill.id}
                  className="cursor-pointer border-border/60 transition-shadow hover:shadow-md"
                  onClick={() => setDetailSkill(skill)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        {getSourceIcon(skill.source_type)}
                        <CardTitle className="truncate text-base">{skill.name}</CardTitle>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`${skill.name} 操作菜单`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <MoreVertical />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(event) => {
                              event.stopPropagation();
                              setDownloadNotice(null);
                              setVersionSkill(skill);
                            }}
                          >
                            <GitBranch />
                            版本管理
                          </DropdownMenuItem>
                          {skill.scope === 'personal' && (
                            <DropdownMenuItem
                              onClick={(event) => {
                                event.stopPropagation();
                                setReviewRequestSkill(skill);
                                setReviewRequestNote('');
                              }}
                            >
                              <GitPullRequest />
                              提交团队审核
                            </DropdownMenuItem>
                          )}
                          {skill.status === 'pending_review' && (
                            <>
                              <DropdownMenuItem
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setReviewDecisionSkill(skill);
                                  setReviewDecision('approved');
                                  setReviewDecisionNote('');
                                }}
                              >
                                <CheckCircle2 />
                                审核通过
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setReviewDecisionSkill(skill);
                                  setReviewDecision('rejected');
                                  setReviewDecisionNote('');
                                }}
                              >
                                <XCircle />
                                审核拒绝
                              </DropdownMenuItem>
                            </>
                          )}
                          {skill.scope !== 'official' && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleDelete(skill);
                                }}
                              >
                                <Archive />
                                移除
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <CardDescription className="line-clamp-2">{skill.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <ScopeBadge scope={skill.scope} />
                      <StatusBadge status={skill.status} />
                      <Badge variant="outline">v{skill.version}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {sourceLabels[skill.source_type]} · {skill.author} · 更新于 {formatDate(skill.updated_at)}
                    </div>
                    {skill.review && (
                      <div className="text-xs text-muted-foreground">
                        来源 {skill.review.source_skill_id} v{skill.review.source_version} · 提交于 {formatDate(skill.review.submitted_at)}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {skill.tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          <Tag />
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    {skill.tools.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        <span>工具</span>
                        {skill.tools.map((tool) => (
                          <Badge key={tool} variant="secondary">
                            {tool}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!detailSkill} onOpenChange={(open) => !open && setDetailSkill(null)}>
        <DialogContent className="max-h-[85vh] w-[min(92vw,56rem)] max-w-[92vw] overflow-hidden">
          {detailSkill && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  {getSourceIcon(detailSkill.source_type)}
                  <DialogTitle className="text-xl">{detailSkill.name}</DialogTitle>
                  <Badge variant="outline">v{detailSkill.version}</Badge>
                  <ScopeBadge scope={detailSkill.scope} />
                  <StatusBadge status={detailSkill.status} />
                </div>
                <DialogDescription>{detailSkill.description}</DialogDescription>
              </DialogHeader>

              <Tabs defaultValue="overview" className="min-w-0">
                <TabsList>
                  <TabsTrigger value="overview">概要</TabsTrigger>
                  <TabsTrigger value="skill-md">skill.md</TabsTrigger>
                  <TabsTrigger value="meta">meta.json</TabsTrigger>
                  <TabsTrigger value="changes">变更记录</TabsTrigger>
                </TabsList>
                <ScrollArea className="mt-4 max-h-[62vh] min-w-0 pr-4">
                  <TabsContent value="overview" className="flex flex-col gap-5">
                    <div className="grid gap-3 rounded-lg border p-4 text-sm md:grid-cols-2">
                      <div>
                        <div className="text-muted-foreground">来源</div>
                        <div className="mt-1 break-all">{renderSourceMeta(detailSkill)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">更新时间</div>
                        <div className="mt-1">{formatDate(detailSkill.updated_at)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">作者</div>
                        <div className="mt-1">{detailSkill.author}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">附件</div>
                        <div className="mt-1">{detailSkill.attachments.length || 0} 个资源</div>
                      </div>
                      {detailSkill.review && (
                        <>
                          <div>
                            <div className="text-muted-foreground">审核来源</div>
                            <div className="mt-1 break-all">
                              {detailSkill.review.source_skill_id} v{detailSkill.review.source_version}
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">提交时间</div>
                            <div className="mt-1">{formatDate(detailSkill.review.submitted_at)}</div>
                          </div>
                          <div className="md:col-span-2">
                            <div className="text-muted-foreground">提交说明</div>
                            <div className="mt-1 whitespace-pre-wrap">
                              {detailSkill.review.submitted_note || '未填写'}
                            </div>
                          </div>
                          {detailSkill.review.reviewed_at && (
                            <div>
                              <div className="text-muted-foreground">审核时间</div>
                              <div className="mt-1">{formatDate(detailSkill.review.reviewed_at)}</div>
                            </div>
                          )}
                          {detailSkill.review.decision && (
                            <div>
                              <div className="text-muted-foreground">审核结论</div>
                              <div className="mt-1">
                                {detailSkill.review.decision === 'approved' ? '通过' : '拒绝'}
                              </div>
                            </div>
                          )}
                          {detailSkill.review.review_note && (
                            <div className="md:col-span-2">
                              <div className="text-muted-foreground">审核意见</div>
                              <div className="mt-1 whitespace-pre-wrap">{detailSkill.review.review_note}</div>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div>
                      <h4 className="mb-2 text-sm font-semibold">方法论框架</h4>
                      <Textarea readOnly value={detailSkill.methodology} className="min-h-36 resize-none font-mono text-sm" />
                    </div>

                    <div>
                      <h4 className="mb-2 text-sm font-semibold">Prompt 模板</h4>
                      <Textarea readOnly value={detailSkill.prompt_template || '未定义'} className="min-h-24 resize-none font-mono text-sm" />
                    </div>

                    <div>
                      <h4 className="mb-2 text-sm font-semibold">质量 Checklist</h4>
                      <div className="flex flex-col gap-2">
                        {detailSkill.checklist.map((item) => (
                          <div key={item} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                            <CheckCircle2 className="mt-0.5 text-muted-foreground" />
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="skill-md" className="min-w-0">
                    <pre className={`${codeBlockClassName} text-sm`}>
                      {detailSkill.skill_md || '未提供 skill.md'}
                    </pre>
                  </TabsContent>

                  <TabsContent value="meta" className="min-w-0">
                    <pre className={`${codeBlockClassName} text-xs`}>
                      {JSON.stringify(detailSkill.meta_json, null, 2)}
                    </pre>
                  </TabsContent>

                  <TabsContent value="changes" className="min-w-0">
                    <pre className={`${codeBlockClassName} text-sm`}>
                      {detailSkill.changelog || '暂无 CHANGELOG.md'}
                    </pre>
                  </TabsContent>
                </ScrollArea>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!reviewRequestSkill} onOpenChange={(open) => {
        if (!open) {
          setReviewRequestSkill(null);
          setReviewRequestNote('');
        }
      }}>
        <DialogContent className="max-w-lg">
          {reviewRequestSkill && (
            <>
              <DialogHeader>
                <DialogTitle>提交团队审核</DialogTitle>
                <DialogDescription>
                  会创建一条团队待审核副本，个人 Skill 会继续保留在个人空间。
                </DialogDescription>
              </DialogHeader>
              <FieldGroup>
                <Field>
                  <FieldLabel>Skill</FieldLabel>
                  <div className="rounded-md border bg-muted/20 p-3 text-sm">
                    <div className="font-medium">{reviewRequestSkill.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {reviewRequestSkill.id} · v{reviewRequestSkill.version}
                    </div>
                  </div>
                </Field>
                <Field>
                  <FieldLabel htmlFor="review-request-note">提交说明</FieldLabel>
                  <Textarea
                    id="review-request-note"
                    value={reviewRequestNote}
                    onChange={(event) => setReviewRequestNote(event.target.value)}
                    placeholder="说明这个 Skill 为什么适合进入团队仓库、适用场景或需要 reviewer 关注的点。"
                    className="min-h-28 resize-none"
                  />
                </Field>
              </FieldGroup>
              <DialogFooter>
                <Button variant="outline" onClick={() => setReviewRequestSkill(null)} disabled={actionLoading}>
                  取消
                </Button>
                <Button onClick={handleRequestReview} disabled={actionLoading}>
                  <GitPullRequest data-icon="inline-start" />
                  {actionLoading ? '提交中...' : '提交审核'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!reviewDecisionSkill} onOpenChange={(open) => {
        if (!open) {
          setReviewDecisionSkill(null);
          setReviewDecisionNote('');
          setReviewDecision('approved');
        }
      }}>
        <DialogContent className="max-w-lg">
          {reviewDecisionSkill && (
            <>
              <DialogHeader>
                <DialogTitle>{reviewDecision === 'approved' ? '审核通过' : '审核拒绝'}</DialogTitle>
                <DialogDescription>
                  {reviewDecision === 'approved'
                    ? '通过后这条团队审核副本会进入已发布状态。'
                    : '拒绝后这条团队审核副本会保留为已拒绝，便于回看原因。'}
                </DialogDescription>
              </DialogHeader>
              <FieldGroup>
                <Field>
                  <FieldLabel>Skill</FieldLabel>
                  <div className="rounded-md border bg-muted/20 p-3 text-sm">
                    <div className="font-medium">{reviewDecisionSkill.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      来源 {reviewDecisionSkill.review?.source_skill_id || reviewDecisionSkill.id} · v{reviewDecisionSkill.version}
                    </div>
                    {reviewDecisionSkill.review?.submitted_note && (
                      <div className="mt-3 whitespace-pre-wrap text-xs text-muted-foreground">
                        {reviewDecisionSkill.review.submitted_note}
                      </div>
                    )}
                  </div>
                </Field>
                <Field>
                  <FieldLabel htmlFor="review-decision-note">审核意见</FieldLabel>
                  <Textarea
                    id="review-decision-note"
                    value={reviewDecisionNote}
                    onChange={(event) => setReviewDecisionNote(event.target.value)}
                    placeholder={reviewDecision === 'approved' ? '可选：记录通过原因或后续使用建议。' : '建议填写拒绝原因，方便提交者修改后重新提交。'}
                    className="min-h-28 resize-none"
                  />
                </Field>
              </FieldGroup>
              <DialogFooter>
                <Button variant="outline" onClick={() => setReviewDecisionSkill(null)} disabled={actionLoading}>
                  取消
                </Button>
                <Button
                  variant={reviewDecision === 'approved' ? 'default' : 'destructive'}
                  onClick={handleReviewDecision}
                  disabled={actionLoading}
                >
                  {reviewDecision === 'approved' ? <CheckCircle2 data-icon="inline-start" /> : <XCircle data-icon="inline-start" />}
                  {actionLoading ? '处理中...' : reviewDecision === 'approved' ? '确认通过' : '确认拒绝'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!versionSkill} onOpenChange={(open) => {
        if (!open) {
          setVersionSkill(null);
          setDownloadNotice(null);
        }
      }}>
        <DialogContent className="max-w-2xl">
          {versionSkill && (
            <>
              <DialogHeader>
                <DialogTitle>{versionSkill.name} 版本管理</DialogTitle>
                <DialogDescription>
                  历史版本不可覆盖。官方模板只允许下载，不允许在本地回滚。
                </DialogDescription>
              </DialogHeader>
              {downloadNotice && (
                <Alert>
                  <CheckCircle2 />
                  <AlertTitle>下载已触发</AlertTitle>
                  <AlertDescription>
                    {downloadNotice.fileName}。如果当前浏览器没有弹出下载，可以{' '}
                    <a
                      className="underline underline-offset-4"
                      href={downloadNotice.previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      打开原始内容。
                    </a>
                  </AlertDescription>
                </Alert>
              )}
              <div className="mt-4 flex flex-col gap-3">
                {versionSkill.versions.map((version) => {
                  const isCurrent = version.version === versionSkill.version;
                  const rollbackDisabled = isCurrent || versionSkill.scope === 'official' || actionLoading;
                  return (
                    <div key={`${version.version}-${version.updated_at}`} className="rounded-lg border border-border/60 bg-muted/20 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">v{version.version}</p>
                            {isCurrent && <Badge>当前版本</Badge>}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">更新于 {formatDate(version.updated_at)}</p>
                          <p className="mt-2 text-sm text-muted-foreground">{version.changelog || '无变更说明'}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <a
                              href={getDownloadUrl(versionSkill, version)}
                              download={getDownloadFileName(versionSkill, version)}
                              onClick={() => {
                                setErrorMessage('');
                                setDownloadNotice({
                                  fileName: getDownloadFileName(versionSkill, version),
                                  previewUrl: getPreviewUrl(versionSkill, version),
                                });
                              }}
                            >
                              <Download data-icon="inline-start" />
                              下载
                            </a>
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <a
                              href={getPreviewUrl(versionSkill, version)}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <FileCode2 data-icon="inline-start" />
                              打开
                            </a>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={rollbackDisabled}
                            onClick={() => runSkillAction(
                              { action: 'rollback', id: versionSkill.id, version: version.version },
                              `已回滚到 v${version.version}`,
                            )}
                          >
                            <RotateCcw data-icon="inline-start" />
                            回滚
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
