'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Archive, CheckCircle2, Clock3, Download, FileCode2, GitBranch, GitPullRequest, Globe, LockKeyhole, MoreVertical, PackageCheck, RotateCcw, Search, ShieldCheck, Star, Tag, Upload, Users, XCircle } from 'lucide-react';
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
import { PageHeader, appCardClassName } from '@/components/battleflow/ui';

type SkillScope = 'personal' | 'team' | 'official';
type SkillSourceType = 'local' | 'registry' | 'git';
type SkillStatus = 'imported' | 'pending_review' | 'published' | 'rejected' | 'archived';
type VersionBump = 'patch' | 'minor' | 'major';
type SkillReviewOperation = 'create' | 'update';
type SkillReviewRequestStatus = 'pending' | 'approved' | 'rejected';

interface SkillVersion {
  version: string;
  updated_at: string;
  changelog: string;
  package_assets?: SkillPackageAsset[];
}

interface SkillPackageAsset {
  path: string;
  kind: string;
  source_folder: string;
  mime_type: string;
  size: number;
  content_kind: 'text' | 'metadata';
  content?: string;
  truncated?: boolean;
  note?: string;
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
  skill_id?: string;
  display_name?: string;
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
  package_assets?: SkillPackageAsset[];
  versions: SkillVersion[];
  review?: SkillReview;
}

interface SkillReviewRequest {
  id: string;
  skill_id: string;
  display_name: string;
  description: string;
  operation: SkillReviewOperation;
  target_scope: 'team';
  target_skill_id?: string;
  target_version?: string;
  source_skill_id?: string;
  source_version?: string;
  submitted_skill: Skill;
  submitted_at: string;
  submitted_note?: string;
  reviewed_at?: string;
  review_note?: string;
  decision?: 'approved' | 'rejected';
  status: SkillReviewRequestStatus;
  version_bump: VersionBump;
}

interface ApiSkillResponse {
  skill?: Skill;
  skills?: Skill[];
  review_request?: SkillReviewRequest;
  review_requests?: SkillReviewRequest[];
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

const reviewOperationLabels: Record<SkillReviewOperation, string> = {
  create: '新增 Skill',
  update: '更新 Skill',
};

const reviewStatusLabels: Record<SkillReviewRequestStatus, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
};

const sourceLabels: Record<SkillSourceType, string> = {
  local: '本地导入',
  registry: '注册中心',
  git: 'Git 同步',
};

const slugAcronyms = new Set(['ai', 'api', 'cli', 'dcp', 'id', 'prd', 'tr1', 'tr2', 'ui', 'ux']);

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
const emptyDescriptionPattern = /^[\s|,.;:，。；：、_-]*$/;

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

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
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

function getSkillDescription(skill: Skill) {
  const description = skill.description?.trim();
  if (!description || emptyDescriptionPattern.test(description)) {
    return '未填写简介。打开详情可查看完整 skill.md、方法论框架和元数据。';
  }
  return description;
}

function isSlugLike(value: string) {
  return /^[a-z0-9]+(?:[-_][a-z0-9]+)+$/i.test(value);
}

function formatSlugLabel(value: string) {
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => {
      const normalized = part.toLowerCase();
      if (slugAcronyms.has(normalized)) return normalized.toUpperCase();
      return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
    })
    .join(' ');
}

function getSkillDisplayName(skill: Skill) {
  const name = skill.display_name?.trim() || skill.name?.trim() || skill.id;
  if (isSlugLike(name)) {
    return formatSlugLabel(name);
  }
  return name;
}

function getSkillLogicalId(skill: Skill) {
  return skill.skill_id || skill.id;
}

function getReviewRequestDisplayName(request: SkillReviewRequest) {
  const name = request.display_name?.trim() || request.submitted_skill.display_name?.trim() || request.submitted_skill.name?.trim() || request.skill_id;
  if (isSlugLike(name)) {
    return formatSlugLabel(name);
  }
  return name;
}

function getReviewRequestDescription(request: SkillReviewRequest) {
  const description = request.description?.trim() || request.submitted_skill.description?.trim();
  if (!description || emptyDescriptionPattern.test(description)) {
    return '未填写简介。审核前请重点检查 SKILL.md 的 Purpose、Workflow、Output Contract 和 Acceptance Criteria。';
  }
  return description;
}

function getSourceMeta(skill: Skill) {
  const source = skill.source_uri?.trim();
  if (!source) {
    return { label: sourceLabels[skill.source_type], detail: '' };
  }

  const withoutFragment = source.split('#')[0];
  const fileName = withoutFragment.split('/').filter(Boolean).pop() || withoutFragment;

  if (source.startsWith('upload:')) {
    return { label: '上传包', detail: fileName };
  }
  if (source.startsWith('official://')) {
    return { label: '注册中心', detail: source.replace('official://', '') };
  }
  if (source.startsWith('http://') || source.startsWith('https://') || source.endsWith('.git')) {
    return { label: sourceLabels[skill.source_type], detail: source };
  }
  return { label: sourceLabels[skill.source_type], detail: fileName };
}

function formatSourceMetaText(skill: Skill) {
  const sourceMeta = getSourceMeta(skill);
  return sourceMeta.detail ? `${sourceMeta.label} · ${sourceMeta.detail}` : sourceMeta.label;
}

function getScopeIcon(scope: SkillScope) {
  switch (scope) {
    case 'official':
      return <ShieldCheck className="h-4 w-4" />;
    case 'team':
      return <Users className="h-4 w-4" />;
    default:
      return <LockKeyhole className="h-4 w-4" />;
  }
}

function getScopeCardClassName(scope: SkillScope) {
  if (scope === 'official') return 'border-primary/20 bg-primary/10 text-primary';
  if (scope === 'team') return 'border-success/20 bg-success/10 text-success';
  return 'border-border/70 bg-muted/50 text-muted-foreground';
}

function getStatusDotClassName(status: SkillStatus) {
  if (status === 'published') return 'bg-success';
  if (status === 'pending_review') return 'bg-warning';
  if (status === 'rejected') return 'bg-destructive';
  return 'bg-muted-foreground';
}

function getSkillCapabilities(skill: Skill) {
  const values = [
    ...skill.tags,
    ...skill.tools.map((tool) => `能力:${tool}`),
  ];
  return Array.from(new Set(values)).slice(0, 5);
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

function ReviewStatusBadge({ status }: { status: SkillReviewRequestStatus }) {
  const variant = status === 'approved' ? 'default' : status === 'rejected' ? 'destructive' : 'secondary';
  return <Badge variant={variant}>{reviewStatusLabels[status]}</Badge>;
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [reviewRequests, setReviewRequests] = useState<SkillReviewRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | SkillScope>('all');
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [detailSkill, setDetailSkill] = useState<Skill | null>(null);
  const [versionSkill, setVersionSkill] = useState<Skill | null>(null);
  const [downloadNotice, setDownloadNotice] = useState<{ fileName: string; previewUrl: string } | null>(null);
  const [reviewRequestSkill, setReviewRequestSkill] = useState<Skill | null>(null);
  const [reviewRequestNote, setReviewRequestNote] = useState('');
  const [reviewDecisionRequest, setReviewDecisionRequest] = useState<SkillReviewRequest | null>(null);
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const res = await fetch('/api/skills', { cache: 'no-store' });
      const data = (await res.json()) as ApiSkillResponse;
      if (!res.ok) throw new Error(data.error || 'Failed to fetch skills');
      setSkills(data.skills || []);
      setReviewRequests(data.review_requests || []);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      setSkills([]);
      setReviewRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  const filteredSkills = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return skills.filter((skill) => skill.status !== 'pending_review').filter((skill) => {
      const matchesSearch =
        !query ||
        getSkillDisplayName(skill).toLowerCase().includes(query) ||
        skill.id.toLowerCase().includes(query) ||
        getSkillLogicalId(skill).toLowerCase().includes(query) ||
        skill.description.toLowerCase().includes(query) ||
        skill.tags.some((tag) => tag.toLowerCase().includes(query));
      const matchesTab = activeTab === 'all' || skill.scope === activeTab;
      return matchesSearch && matchesTab;
    });
  }, [activeTab, searchQuery, skills]);

  const skillCounts = useMemo(() => {
    return skills.filter((skill) => skill.status !== 'pending_review').reduce(
      (counts, skill) => {
        counts.all += 1;
        counts[skill.scope] += 1;
        return counts;
      },
      { all: 0, official: 0, team: 0, personal: 0 },
    );
  }, [skills]);

  const pendingReviewRequests = useMemo(() => {
    return reviewRequests.filter((request) => request.status === 'pending');
  }, [reviewRequests]);

  const reviewRequestTargetSkill = useMemo(() => {
    if (!reviewRequestSkill) return null;
    const logicalId = getSkillLogicalId(reviewRequestSkill);
    return skills.find((skill) => (
      skill.scope === 'team'
      && skill.status !== 'archived'
      && getSkillLogicalId(skill) === logicalId
    )) || null;
  }, [reviewRequestSkill, skills]);

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
      if (data.skills || data.review_request || data.review_requests) await fetchSkills();
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
    if (!reviewDecisionRequest) return;
    const ok = await runSkillAction(
      {
        action: reviewDecision === 'approved' ? 'approve_publish' : 'reject_review',
        id: reviewDecisionRequest.id,
        note: reviewDecisionNote,
      },
      reviewDecision === 'approved'
        ? reviewDecisionRequest.operation === 'update'
          ? '已通过审核并更新团队 Skill'
          : '已通过审核并发布到团队仓库'
        : '已拒绝该团队审核',
    );
    if (ok) {
      setReviewDecisionRequest(null);
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
      const importedSummary = (data.skills || []).map((skill) => `${getSkillDisplayName(skill)} v${skill.version}`).join('、');
      const reviewSummary = (data.review_requests || [])
        .map((request) => `${getReviewRequestDisplayName(request)}（${reviewOperationLabels[request.operation]}）`)
        .join('、');
      const messages = [
        importedSummary ? `已导入个人 Skill：${importedSummary}` : '',
        reviewSummary ? `已提交团队审核：${reviewSummary}` : '',
      ].filter(Boolean);
      setSuccessMessage(messages.length > 0 ? messages.join('；') : '未导入 Skill');
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
      setSuccessMessage(`已移除 ${getSkillDisplayName(skill)}`);
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
    return `${getSkillDisplayName(skill)}-v${version.version}.md`.replace(/[\\/:*?"<>|]/g, '-');
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Skill 仓库"
        description="导入、审核、发布和追踪产品规划 Skill，把团队方法沉淀为可编排能力。"
        action={(
        <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
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
                  个人 Skill 导入后立即可用；团队导入会进入审核队列，通过后才会新增或更新团队 Skill。
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
                        <input
                          ref={fileInputRef}
                          id="skill-package"
                          type="file"
                          accept=".zip"
                          className="sr-only"
                          onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                        />
                        <label
                          htmlFor="skill-package"
                          className={`flex cursor-pointer flex-col gap-3 rounded-xl border border-dashed p-4 transition-colors sm:flex-row sm:items-center ${
                            selectedFile
                              ? 'border-primary/50 bg-primary/10'
                              : 'border-border/70 bg-muted/20 hover:border-primary/50 hover:bg-primary/5'
                          }`}
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'copy';
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            const file = event.dataTransfer.files?.[0];
                            if (file) setSelectedFile(file);
                          }}
                        >
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Upload className="h-5 w-5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {selectedFile ? selectedFile.name : '点击选择或拖入 zip 包'}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                              {selectedFile
                                ? `${formatFileSize(selectedFile.size)} · 将使用该压缩包导入 Skill`
                                : '支持 .zip，适用于单个 Skill 包或包含 registry.json 的批量包。'}
                            </span>
                          </span>
                          <span className="inline-flex shrink-0 items-center justify-center rounded-md border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-xs transition-colors">
                            {selectedFile ? '重新选择' : '选择文件'}
                          </span>
                        </label>
                        {selectedFile && (
                          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium">{selectedFile.name}</p>
                              <p className="text-[11px] text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 shrink-0 px-2 text-xs"
                              onClick={() => {
                                setSelectedFile(null);
                                if (fileInputRef.current) fileInputRef.current.value = '';
                              }}
                            >
                              清除
                            </Button>
                          </div>
                        )}
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
                  新 Skill 首次发布保留包内版本；平台用 Skill ID 判断是否更新已有团队 Skill。若 ID 已存在，审核项会标记为更新，并在通过后按“{versionBumpLabels[versionBump]}”递增版本号，{versionBumpDescriptions[versionBump]}
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
                  当本次审核更新已有 Skill 时，会写入版本历史；留空时平台自动生成一条升级说明。
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
        )}
      />

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="flex flex-col gap-6 p-4 md:p-6">
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

          {pendingReviewRequests.length > 0 && (
            <section className="flex flex-col gap-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold tracking-normal">团队审核队列</h2>
                  <p className="text-sm text-muted-foreground">
                    {pendingReviewRequests.length} 个待处理提交。审核项不会混入团队 Skill 列表。
                  </p>
                </div>
                <Badge variant="secondary" className="w-fit gap-1.5">
                  <GitPullRequest />
                  {pendingReviewRequests.length} pending
                </Badge>
              </div>
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {pendingReviewRequests.map((request) => {
                  const displayName = getReviewRequestDisplayName(request);
                  const isUpdate = request.operation === 'update';
                  return (
                    <Card key={request.id} className={`${appCardClassName} border-warning/30 bg-warning/5`}>
                      <CardHeader className="pb-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-warning/30 bg-warning/10 text-warning [&_svg]:h-5 [&_svg]:w-5">
                            <GitPullRequest />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <CardTitle className="min-w-0 truncate text-base leading-6" title={displayName}>
                                {displayName}
                              </CardTitle>
                              <Badge variant={isUpdate ? 'default' : 'secondary'}>
                                {reviewOperationLabels[request.operation]}
                              </Badge>
                              <ReviewStatusBadge status={request.status} />
                            </div>
                            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                              <span className="font-mono">{request.skill_id}</span>
                              <span>提交于 {formatDate(request.submitted_at)}</span>
                            </div>
                          </div>
                        </div>
                        <CardDescription className="mt-3 line-clamp-2 text-sm leading-5">
                          {getReviewRequestDescription(request)}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3">
                        <div className="grid grid-cols-1 overflow-hidden rounded-lg border border-border/50 bg-background/70 text-xs sm:grid-cols-3">
                          <div className="min-w-0 p-3">
                            <div className="text-muted-foreground">目标</div>
                            <div className="mt-1 truncate font-medium">团队 Skill</div>
                          </div>
                          <div className="min-w-0 border-t border-border/50 p-3 sm:border-l sm:border-t-0">
                            <div className="text-muted-foreground">当前版本</div>
                            <div className="mt-1 truncate font-medium">
                              {request.target_version ? `v${request.target_version}` : '无，审核后新增'}
                            </div>
                          </div>
                          <div className="min-w-0 border-t border-border/50 p-3 sm:border-l sm:border-t-0">
                            <div className="text-muted-foreground">提交版本</div>
                            <div className="mt-1 truncate font-medium">v{request.source_version || request.submitted_skill.version}</div>
                          </div>
                        </div>

                        {isUpdate && (
                          <Alert className="border-warning/30 bg-warning/10">
                            <AlertCircle />
                            <AlertTitle>当前 Skill 已存在</AlertTitle>
                            <AlertDescription>
                              审核通过后会更新 `{request.skill_id}`，并按“{versionBumpLabels[request.version_bump]}”升级版本。
                            </AlertDescription>
                          </Alert>
                        )}

                        {request.submitted_note && (
                          <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                            <div className="mb-1 font-medium text-foreground/80">提交说明</div>
                            <div className="line-clamp-3 whitespace-pre-wrap">{request.submitted_note}</div>
                          </div>
                        )}

                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setReviewDecisionRequest(request);
                              setReviewDecision('rejected');
                              setReviewDecisionNote('');
                            }}
                          >
                            <XCircle data-icon="inline-start" />
                            拒绝
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              setReviewDecisionRequest(request);
                              setReviewDecision('approved');
                              setReviewDecisionNote('');
                            }}
                          >
                            <CheckCircle2 data-icon="inline-start" />
                            通过
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          <div className="rounded-xl border border-border/60 bg-card/80 p-3 shadow-sm shadow-foreground/5">
            <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative min-w-0 flex-1 lg:max-w-xl">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="搜索 Skill 名称、ID、描述、标签或工具..."
                  className="h-10 bg-background/80 pl-10"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
              <Tabs className="min-w-0" value={activeTab} onValueChange={(value) => setActiveTab(value as 'all' | SkillScope)}>
                <div className="max-w-full overflow-x-auto">
                  <TabsList className="w-max bg-muted/70">
                    <TabsTrigger value="all">全部 {skillCounts.all}</TabsTrigger>
                    <TabsTrigger value="official">官方 {skillCounts.official}</TabsTrigger>
                    <TabsTrigger value="team">团队 {skillCounts.team}</TabsTrigger>
                    <TabsTrigger value="personal">个人 {skillCounts.personal}</TabsTrigger>
                  </TabsList>
                </div>
              </Tabs>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>按最近更新排序</span>
              <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
              <span>{filteredSkills.length} 个结果</span>
              {searchQuery.trim() && (
                <>
                  <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                  <span className="truncate">搜索：{searchQuery.trim()}</span>
                </>
              )}
            </div>
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
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {filteredSkills.map((skill) => {
                const displayName = getSkillDisplayName(skill);
                const sourceMeta = getSourceMeta(skill);

                return (
                <Card
                  key={skill.id}
                  className={`${appCardClassName} group overflow-hidden`}
                >
                  <CardHeader className="pb-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${getScopeCardClassName(skill.scope)} [&_svg]:h-5 [&_svg]:w-5`}>
                        {getSourceIcon(skill.source_type)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-start gap-2">
                          <CardTitle className="min-w-0 flex-1 truncate text-base leading-6" title={displayName}>
                            {displayName}
                          </CardTitle>
                          <span className={`h-2 w-2 shrink-0 rounded-full ${getStatusDotClassName(skill.status)}`} aria-label={statusLabels[skill.status]} />
                        </div>
                        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="min-w-0 truncate font-mono" title={getSkillLogicalId(skill)}>{getSkillLogicalId(skill)}</span>
                          <span className="shrink-0">·</span>
                          <span className="shrink-0 rounded-md border border-border/60 bg-background/70 px-1.5 py-0.5 font-medium text-foreground/80">
                            v{skill.version}
                          </span>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`${displayName} 操作菜单`}
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
                    <CardDescription className="mt-4 line-clamp-3 min-h-[3.75rem] text-sm leading-5">
                      {getSkillDescription(skill)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={getScopeCardClassName(skill.scope)}>
                        {getScopeIcon(skill.scope)}
                        {scopeLabels[skill.scope]}
                      </Badge>
                      <StatusBadge status={skill.status} />
                      <Badge variant="outline" className="gap-1.5">
                        <PackageCheck />
                        {skill.versions.length} 个版本
                      </Badge>
                    </div>

                    <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-border/50 bg-muted/20 text-xs">
                      <div className="min-w-0 p-3">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Clock3 className="h-3.5 w-3.5" />
                          更新
                        </div>
                        <div className="mt-1 truncate font-medium">{formatDate(skill.updated_at)}</div>
                      </div>
                      <div className="min-w-0 border-l border-border/50 p-3">
                        <div className="text-muted-foreground">来源</div>
                        <div className="mt-1 truncate font-medium">{sourceLabels[skill.source_type]}</div>
                      </div>
                      <div className="min-w-0 border-l border-border/50 p-3">
                        <div className="text-muted-foreground">资源</div>
                        <div className="mt-1 truncate font-medium">{skill.package_assets?.length || 0} assets</div>
                      </div>
                    </div>

                    {skill.review && (
                      <div
                        className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
                        title={`审核来源 ${skill.review.source_skill_id} v${skill.review.source_version}`}
                      >
                        <span className="font-medium text-foreground/80">团队审核副本</span>
                        <span>来源版本 v{skill.review.source_version}</span>
                        <span>提交于 {formatDate(skill.review.submitted_at)}</span>
                      </div>
                    )}

                    <div className="min-h-7">
                      {getSkillCapabilities(skill).length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {getSkillCapabilities(skill).map((capability) => (
                            <Badge key={capability} variant="outline" className="max-w-full bg-background/60" title={capability}>
                              <Tag />
                              <span className="max-w-36 truncate">{capability}</span>
                            </Badge>
                          ))}
                          {skill.tags.length + skill.tools.length > getSkillCapabilities(skill).length && (
                            <Badge variant="secondary">+{skill.tags.length + skill.tools.length - getSkillCapabilities(skill).length}</Badge>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">暂无声明标签</div>
                      )}
                    </div>

                    <div className="mt-auto flex min-w-0 items-center justify-between gap-3 border-t border-border/50 pt-4">
                      <div className="min-w-0 text-xs text-muted-foreground">
                        <div className="truncate">
                          <span className="font-medium text-foreground/70">{sourceMeta.label}</span>
                          {sourceMeta.detail && (
                            <>
                              <span> · </span>
                              <span title={sourceMeta.detail}>{sourceMeta.detail}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 transition-colors group-hover:border-primary/40 group-hover:text-primary"
                        onClick={() => setDetailSkill(skill)}
                      >
                        查看详情
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                );
              })}
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
                  <DialogTitle className="text-xl">{getSkillDisplayName(detailSkill)}</DialogTitle>
                  <Badge variant="outline">v{detailSkill.version}</Badge>
                  <ScopeBadge scope={detailSkill.scope} />
                  <StatusBadge status={detailSkill.status} />
                </div>
                <DialogDescription>{detailSkill.description}</DialogDescription>
              </DialogHeader>

              <Tabs defaultValue="overview" className="min-w-0">
                <div className="max-w-full overflow-x-auto">
                  <TabsList className="w-max">
                    <TabsTrigger value="overview">概要</TabsTrigger>
                    <TabsTrigger value="assets">Package assets</TabsTrigger>
                    <TabsTrigger value="skill-md">skill.md</TabsTrigger>
                  </TabsList>
                </div>
                <ScrollArea className="mt-4 max-h-[62vh] min-w-0 pr-4">
                  <TabsContent value="overview" className="flex flex-col gap-5">
                    <div className="grid gap-3 rounded-lg border p-4 text-sm md:grid-cols-2">
                      <div>
                        <div className="text-muted-foreground">Skill ID</div>
                        <div className="mt-1 break-all font-mono text-xs">{detailSkill.id}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">来源</div>
                        <div className="mt-1 break-all">{formatSourceMetaText(detailSkill)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">更新时间</div>
                        <div className="mt-1">{formatDate(detailSkill.updated_at)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Package assets</div>
                        <div className="mt-1">{detailSkill.package_assets?.length || 0} assets</div>
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

                    <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
                      `SKILL.md` 是该 Skill 的唯一执行入口。方法论、输出契约和验收标准应优先在 `SKILL.md` 中维护；Package assets 只作为模板、脚本和参考资料随包加载。
                    </div>
                  </TabsContent>

                  <TabsContent value="assets" className="min-w-0">
                    {(detailSkill.package_assets?.length || 0) === 0 ? (
                      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                        No package assets were discovered for this Skill package.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {(detailSkill.package_assets || []).map((asset) => (
                          <div key={asset.path} className="min-w-0 rounded-lg border p-3 text-sm">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline">{asset.kind}</Badge>
                              <span className="min-w-0 break-all font-mono text-xs">{asset.path}</span>
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                              {asset.mime_type} · {formatFileSize(asset.size)} · {asset.content_kind === 'text' ? 'bounded text' : 'metadata only'}
                              {asset.truncated ? ' · truncated' : ''}
                            </div>
                            {asset.note && (
                              <div className="mt-2 text-xs text-muted-foreground">{asset.note}</div>
                            )}
                            {asset.content_kind === 'text' && asset.content && (
                              <pre className={`${codeBlockClassName} mt-3 max-h-56 text-xs`}>
                                {asset.content}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="skill-md" className="min-w-0">
                    <pre className={`${codeBlockClassName} text-sm`}>
                      {detailSkill.skill_md || '未提供 skill.md'}
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
                  会创建一条团队审核请求，个人 Skill 会继续保留在个人空间。
                </DialogDescription>
              </DialogHeader>
              <FieldGroup>
                <Field>
                  <FieldLabel>Skill</FieldLabel>
                  <div className="rounded-md border bg-muted/20 p-3 text-sm">
                    <div className="font-medium">{getSkillDisplayName(reviewRequestSkill)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {getSkillLogicalId(reviewRequestSkill)} · v{reviewRequestSkill.version}
                    </div>
                  </div>
                </Field>
                {reviewRequestTargetSkill && (
                  <Alert className="border-warning/30 bg-warning/10">
                    <AlertCircle />
                    <AlertTitle>当前 Skill 已存在</AlertTitle>
                    <AlertDescription>
                      提交后会进入更新审核，通过后将更新团队 Skill `{getSkillLogicalId(reviewRequestTargetSkill)}` 当前版本 v{reviewRequestTargetSkill.version}。
                    </AlertDescription>
                  </Alert>
                )}
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

      <Dialog open={!!reviewDecisionRequest} onOpenChange={(open) => {
        if (!open) {
          setReviewDecisionRequest(null);
          setReviewDecisionNote('');
          setReviewDecision('approved');
        }
      }}>
        <DialogContent className="max-w-lg">
          {reviewDecisionRequest && (
            <>
              <DialogHeader>
                <DialogTitle>{reviewDecision === 'approved' ? '审核通过' : '审核拒绝'}</DialogTitle>
                <DialogDescription>
                  {reviewDecision === 'approved'
                    ? reviewDecisionRequest.operation === 'update'
                      ? '通过后会更新已存在的团队 Skill，并写入新的版本历史。'
                      : '通过后会发布为新的团队 Skill。'
                    : '拒绝后不会修改任何团队 Skill。'}
                </DialogDescription>
              </DialogHeader>
              <FieldGroup>
                <Field>
                  <FieldLabel>审核项</FieldLabel>
                  <div className="rounded-md border bg-muted/20 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium">{getReviewRequestDisplayName(reviewDecisionRequest)}</div>
                      <Badge variant={reviewDecisionRequest.operation === 'update' ? 'default' : 'secondary'}>
                        {reviewOperationLabels[reviewDecisionRequest.operation]}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Skill ID {reviewDecisionRequest.skill_id} · 提交版本 v{reviewDecisionRequest.source_version || reviewDecisionRequest.submitted_skill.version}
                      {reviewDecisionRequest.target_version ? ` · 当前团队版本 v${reviewDecisionRequest.target_version}` : ''}
                    </div>
                    {reviewDecisionRequest.operation === 'update' && (
                      <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
                        当前 Skill 已存在，确认通过会更新团队 Skill 并按“{versionBumpLabels[reviewDecisionRequest.version_bump]}”升级版本。
                      </div>
                    )}
                    {reviewDecisionRequest.submitted_note && (
                      <div className="mt-3 whitespace-pre-wrap text-xs text-muted-foreground">
                        {reviewDecisionRequest.submitted_note}
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
                <Button variant="outline" onClick={() => setReviewDecisionRequest(null)} disabled={actionLoading}>
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
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-2xl flex-col overflow-hidden">
          {versionSkill && (
            <>
              <DialogHeader>
                <DialogTitle>{getSkillDisplayName(versionSkill)} 版本管理</DialogTitle>
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
              <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
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
