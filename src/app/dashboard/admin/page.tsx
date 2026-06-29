'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  GitPullRequest,
  Loader2,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  PageHeader,
  ProductEmptyState,
  SectionTitle,
  StatusBadge,
  appCardClassName,
} from '@/components/battleflow/ui';

type OrganizationRole = 'org_owner' | 'org_admin' | 'org_manager' | 'org_member' | 'org_viewer';

interface DashboardAuthState {
  isSuperAdmin: boolean;
  activeOrganizationId: string | null;
  capabilities: {
    manageOrganization: boolean;
    manageMembers: boolean;
    manageDepartments: boolean;
    manageTeams: boolean;
    managePlatformAdmins: boolean;
    viewPlatformUsers: boolean;
  };
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    role: OrganizationRole;
    status: string;
  }>;
}

interface OrganizationMember {
  userId: string;
  email: string;
  displayName: string | null;
  department: string | null;
  role: OrganizationRole;
  status: string;
  joinedAt: string;
}

interface SuperAdminRecord {
  userId: string;
  email: string;
  displayName: string | null;
  role: 'super_admin';
  enabled: boolean;
  grantedBy: string | null;
  grantedAt: string;
  revokedBy: string | null;
  revokedAt: string | null;
}

interface PlatformUserRecord {
  id: string;
  ssoId: string | null;
  username: string | null;
  displayName: string | null;
  email: string | null;
  department: string | null;
  departmentId: string | null;
  title: string | null;
  mobile: string | null;
  isActive: boolean;
  isAdmin: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

interface ApiError {
  error?: string;
}

type SkillScope = 'personal' | 'team' | 'official';
type SkillSourceType = 'local' | 'registry' | 'git';
type SkillStatus = 'imported' | 'pending_review' | 'published' | 'rejected' | 'archived';
type VersionBump = 'patch' | 'minor' | 'major';
type SkillReviewOperation = 'create' | 'update';
type SkillReviewRequestStatus = 'pending' | 'approved' | 'rejected';

interface Skill {
  id: string;
  skill_id?: string | null;
  name: string;
  display_name?: string | null;
  description?: string | null;
  version: string;
  scope: SkillScope;
  source_type: SkillSourceType;
  status: SkillStatus;
  created_at: string;
  updated_at: string;
}

interface SkillReviewRequest {
  id: string;
  skill_id: string;
  display_name?: string | null;
  description?: string | null;
  operation: SkillReviewOperation;
  source_skill_id: string;
  source_version: string | null;
  target_skill_id: string | null;
  target_version: string | null;
  version_bump: VersionBump;
  status: SkillReviewRequestStatus;
  submitted_note: string | null;
  reviewed_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  submitted_skill: Skill;
}

interface SkillReviewApiResponse extends ApiError {
  review_request?: SkillReviewRequest;
  review_requests?: SkillReviewRequest[];
}

interface ConfirmAction {
  title: string;
  description: string;
  label: string;
  onConfirm: () => Promise<void>;
}

const organizationRoles: Array<{ value: OrganizationRole; label: string }> = [
  { value: 'org_owner', label: '所有者' },
  { value: 'org_admin', label: '组织管理员' },
  { value: 'org_manager', label: '组织管理者' },
  { value: 'org_member', label: '成员' },
  { value: 'org_viewer', label: '只读成员' },
];

const emptyDescriptionPattern = /^[\s|,.;:，。；：、_-]*$/;
const slugAcronyms = new Set(['ai', 'api', 'cli', 'dcp', 'id', 'prd', 'tr1', 'tr2', 'ui', 'ux']);

const skillReviewOperationLabels: Record<SkillReviewOperation, string> = {
  create: '新增 Skill',
  update: '更新 Skill',
};

const skillReviewStatusLabels: Record<SkillReviewRequestStatus, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
};

const skillVersionBumpLabels: Record<VersionBump, string> = {
  patch: '小修订',
  minor: '能力增强',
  major: '不兼容变更',
};

function displayDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const data = await response.json() as T & ApiError;
  if (!response.ok) {
    throw new Error(data.error || '请求失败');
  }
  return data;
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  return readJsonResponse<T>(response);
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

function getSkillReviewDisplayName(request: SkillReviewRequest) {
  const name = request.display_name?.trim()
    || request.submitted_skill.display_name?.trim()
    || request.submitted_skill.name?.trim()
    || request.skill_id;
  return isSlugLike(name) ? formatSlugLabel(name) : name;
}

function getSkillReviewDescription(request: SkillReviewRequest) {
  const description = request.description?.trim() || request.submitted_skill.description?.trim();
  if (!description || emptyDescriptionPattern.test(description)) {
    return '未填写简介。审核前请重点检查 SKILL.md 的目的、流程、输出契约和验收标准。';
  }
  return description;
}

function SkillReviewStatusBadge({ status }: { status: SkillReviewRequestStatus }) {
  const variant = status === 'approved' ? 'default' : status === 'rejected' ? 'destructive' : 'secondary';
  return <Badge variant={variant}>{skillReviewStatusLabels[status]}</Badge>;
}

function AdminUnavailable({ description }: { description: string }) {
  return (
    <ProductEmptyState
      icon={<Shield />}
      title="暂无法访问管理页"
      description={description}
      className="min-h-64"
    />
  );
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('members');
  const [authState, setAuthState] = useState<DashboardAuthState | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [superAdmins, setSuperAdmins] = useState<SuperAdminRecord[]>([]);
  const [platformUsers, setPlatformUsers] = useState<PlatformUserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [platformUserSearch, setPlatformUserSearch] = useState('');
  const [platformGrantEmail, setPlatformGrantEmail] = useState('');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [skillReviewRequests, setSkillReviewRequests] = useState<SkillReviewRequest[]>([]);
  const [skillReviewDecisionRequest, setSkillReviewDecisionRequest] = useState<SkillReviewRequest | null>(null);
  const [skillReviewDecision, setSkillReviewDecision] = useState<'approved' | 'rejected'>('approved');
  const [skillReviewDecisionNote, setSkillReviewDecisionNote] = useState('');

  const activeOrganization = useMemo(() => {
    if (!authState) return null;
    return authState.organizations.find((organization) => organization.id === authState.activeOrganizationId)
      ?? authState.organizations[0]
      ?? null;
  }, [authState]);

  const filteredMembers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    if (!query) return members;
    return members.filter((member) => (
      member.email.toLowerCase().includes(query)
      || (member.displayName ?? '').toLowerCase().includes(query)
      || (member.department ?? '').toLowerCase().includes(query)
      || member.role.toLowerCase().includes(query)
    ));
  }, [memberSearch, members]);

  const filteredPlatformUsers = useMemo(() => {
    const query = platformUserSearch.trim().toLowerCase();
    if (!query) return platformUsers;
    return platformUsers.filter((user) => (
      [
        user.displayName,
        user.email,
        user.username,
        user.department,
        user.departmentId,
        user.title,
        user.mobile,
        user.ssoId,
      ].some((value) => (value ?? '').toLowerCase().includes(query))
    ));
  }, [platformUserSearch, platformUsers]);

  const enabledSuperAdminCount = useMemo(() => (
    superAdmins.filter((admin) => admin.enabled).length
  ), [superAdmins]);

  const pendingSkillReviewRequests = useMemo(() => (
    skillReviewRequests.filter((request) => request.status === 'pending')
  ), [skillReviewRequests]);

  const canManageOrganization = Boolean(authState?.capabilities.manageOrganization);
  const canManagePlatformAdmins = Boolean(authState?.capabilities.managePlatformAdmins);
  const canViewPlatformUsers = Boolean(authState?.capabilities.viewPlatformUsers || authState?.isSuperAdmin);

  const loadSkillReviews = useCallback(async () => {
    const data = await jsonRequest<SkillReviewApiResponse>('/api/skills');
    setSkillReviewRequests(data.review_requests ?? []);
  }, []);

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const auth = await jsonRequest<DashboardAuthState>('/api/auth/me');
      setAuthState(auth);

      if (!auth.isSuperAdmin) {
        setSuperAdmins([]);
        setPlatformUsers([]);
        setMembers([]);
        setSkillReviewRequests([]);
        return;
      }

      const shouldViewPlatformUsers = auth.capabilities.viewPlatformUsers || auth.isSuperAdmin;
      if (shouldViewPlatformUsers || auth.capabilities.managePlatformAdmins) {
        const [platformAdminData, platformUserData] = await Promise.all([
          auth.capabilities.managePlatformAdmins
            ? jsonRequest<{ superAdmins: SuperAdminRecord[] }>('/api/admin/super-admins')
            : Promise.resolve({ superAdmins: [] }),
          shouldViewPlatformUsers
            ? jsonRequest<{ users: PlatformUserRecord[] }>('/api/admin/users')
            : Promise.resolve({ users: [] }),
        ]);
        setSuperAdmins(platformAdminData.superAdmins);
        setPlatformUsers(platformUserData.users);
        if (shouldViewPlatformUsers && !auth.capabilities.manageOrganization) {
          setActiveTab('platform-users');
        }
      } else {
        setSuperAdmins([]);
        setPlatformUsers([]);
      }

      if (!auth.capabilities.manageOrganization || !auth.activeOrganizationId) {
        setMembers([]);
        setSkillReviewRequests([]);
        return;
      }

      await loadSkillReviews();

      const [
        memberData,
      ] = await Promise.all([
        jsonRequest<{ members: OrganizationMember[] }>('/api/organizations/members'),
      ]);

      setMembers(memberData.members);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '无法加载管理数据');
    } finally {
      setLoading(false);
    }
  }, [loadSkillReviews]);

  useEffect(() => {
    void loadAdminData();
  }, [loadAdminData]);

  async function runMutation(action: () => Promise<void>) {
    setSubmitting(true);
    setErrorMessage('');
    try {
      await action();
      await loadAdminData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '操作失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSkillReviewDecision() {
    if (!skillReviewDecisionRequest) return;
    setSubmitting(true);
    setErrorMessage('');
    try {
      const action = skillReviewDecision === 'approved' ? 'approve_publish' : 'reject_review';
      await jsonRequest<SkillReviewApiResponse>('/api/skills', {
        method: 'POST',
        body: JSON.stringify({
          action,
          id: skillReviewDecisionRequest.id,
          note: skillReviewDecisionNote,
        }),
      });
      await loadSkillReviews();
      setSkillReviewDecisionRequest(null);
      setSkillReviewDecisionNote('');
      setSkillReviewDecision('approved');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Skill 审核失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function updateMember(member: OrganizationMember, nextRole: OrganizationRole, nextStatus: string) {
    await runMutation(async () => {
      await jsonRequest('/api/organizations/members', {
        method: 'PATCH',
        body: JSON.stringify({
          userId: member.userId,
          role: nextRole,
          status: nextStatus,
        }),
      });
    });
  }

  async function grantPlatformSuperAdmin() {
    await runMutation(async () => {
      await jsonRequest('/api/admin/super-admins', {
        method: 'POST',
        body: JSON.stringify({ email: platformGrantEmail }),
      });
      setPlatformGrantEmail('');
    });
  }

  async function updatePlatformUserAdmin(user: PlatformUserRecord, isAdmin: boolean) {
    await runMutation(async () => {
      await jsonRequest('/api/admin/users', {
        method: 'PATCH',
        body: JSON.stringify({ userId: user.id, isAdmin }),
      });
    });
  }

  function revokePlatformSuperAdmin(admin: SuperAdminRecord) {
    setConfirmAction({
      title: '撤销平台超级管理员',
      description: `${admin.email} 将失去平台级产品管理权限，但账号本身不会被停用。`,
      label: '撤销权限',
      onConfirm: async () => {
        await runMutation(async () => {
          await jsonRequest('/api/admin/super-admins', {
            method: 'DELETE',
            body: JSON.stringify({ userId: admin.userId }),
          });
        });
      },
    });
  }

  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader
          title="组织管理"
          description="管理账号权限、成员审核和平台管理控制。"
          meta={<StatusBadge tone="neutral">加载中</StatusBadge>}
        />
        <div className="grid min-h-0 flex-1 place-items-center p-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            正在加载管理数据
          </div>
        </div>
      </div>
    );
  }

  if (authState && !authState.isSuperAdmin) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader
          title="组织管理"
          description="该区域仅限平台超级管理员访问。"
          meta={<StatusBadge tone="danger">无权限</StatusBadge>}
        />
        <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
          <AdminUnavailable description="当前账号没有平台超级管理员权限。服务端接口也会执行相同的权限校验。" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="组织管理"
        meta={(
          <>
            <StatusBadge tone="brand">{activeOrganization?.name ?? '当前组织'}</StatusBadge>
            {authState?.isSuperAdmin && <StatusBadge tone="success">超级管理员</StatusBadge>}
          </>
        )}
      />

      <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
        <div className="flex min-h-0 flex-col gap-4">
          {errorMessage && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>管理操作失败</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Card className={`${appCardClassName} py-0`}>
              <CardContent className="flex min-h-14 items-center gap-2.5 px-3 py-2">
                <Users className="size-4 shrink-0 text-brand" />
                <div className="flex min-w-0 items-baseline gap-2">
                  <p className="text-lg font-semibold leading-none">{canViewPlatformUsers ? platformUsers.length : members.length}</p>
                  <p className="truncate text-xs text-muted-foreground">成员</p>
                </div>
              </CardContent>
            </Card>
            {canManageOrganization && (
              <>
                <Card className={`${appCardClassName} py-0`}>
                  <CardContent className="flex min-h-14 items-center gap-2.5 px-3 py-2">
                    <GitPullRequest className="size-4 shrink-0 text-brand" />
                    <div className="flex min-w-0 items-baseline gap-2">
                      <p className="text-lg font-semibold leading-none">{pendingSkillReviewRequests.length}</p>
                      <p className="truncate text-xs text-muted-foreground">Skill 待审</p>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="min-h-0">
            <TabsList className="max-w-full justify-start overflow-x-auto">
              {canViewPlatformUsers && (
                <TabsTrigger value="platform-users">成员列表</TabsTrigger>
              )}
              {canManageOrganization && (
                <>
                  <TabsTrigger value="members">成员权限</TabsTrigger>
                  <TabsTrigger value="skill-reviews" className="gap-2">
                    Skill 审核
                    {pendingSkillReviewRequests.length > 0 && (
                      <Badge variant="secondary" className="-mr-1 h-5 px-1.5 text-[11px]">
                        {pendingSkillReviewRequests.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                </>
              )}
              {canManagePlatformAdmins && (
                <TabsTrigger value="platform">平台管理员</TabsTrigger>
              )}
            </TabsList>

            {canViewPlatformUsers && (
              <TabsContent value="platform-users" className="mt-4">
                <Card className={appCardClassName}>
                  <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle className="text-base">成员列表</CardTitle>
                    <div className="relative w-full sm:max-w-sm">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={platformUserSearch}
                        onChange={(event) => setPlatformUserSearch(event.target.value)}
                        placeholder="搜索姓名、邮箱、部门"
                        className="pl-9"
                      />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>显示名</TableHead>
                            <TableHead>邮箱</TableHead>
                            <TableHead>账号</TableHead>
                            <TableHead>部门</TableHead>
                            <TableHead>联系方式</TableHead>
                            <TableHead>状态</TableHead>
                            <TableHead>管理员权限</TableHead>
                            <TableHead>更新时间</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredPlatformUsers.map((user) => (
                            <TableRow key={user.id}>
                              <TableCell className="min-w-40">
                                <p className="font-medium">
                                  {user.displayName || user.username || user.email || '-'}
                                </p>
                                {user.title && (
                                  <p className="text-xs text-muted-foreground">{user.title}</p>
                                )}
                              </TableCell>
                              <TableCell className="min-w-56">
                                <p className="truncate">{user.email || '-'}</p>
                              </TableCell>
                              <TableCell className="min-w-40">
                                <p className="truncate">{user.username || '-'}</p>
                                <p className="truncate text-xs text-muted-foreground">{user.ssoId || '-'}</p>
                              </TableCell>
                              <TableCell className="min-w-72">
                                <p className="line-clamp-2" title={user.department ?? undefined}>
                                  {user.department || '-'}
                                </p>
                                {user.departmentId && (
                                  <p className="truncate text-xs text-muted-foreground">{user.departmentId}</p>
                                )}
                              </TableCell>
                              <TableCell className="min-w-36">{user.mobile || '-'}</TableCell>
                              <TableCell className="min-w-32">
                                <div className="flex flex-wrap gap-1.5">
                                  <StatusBadge tone={user.isActive ? 'success' : 'neutral'}>
                                    {user.isActive ? '启用' : '停用'}
                                  </StatusBadge>
                                  {user.isAdmin && <StatusBadge tone="brand">管理员</StatusBadge>}
                                </div>
                              </TableCell>
                              <TableCell className="min-w-36">
                                <Button
                                  size="sm"
                                  variant={user.isAdmin ? 'outline' : 'default'}
                                  disabled={submitting}
                                  onClick={() => void updatePlatformUserAdmin(user, !user.isAdmin)}
                                >
                                  {user.isAdmin ? '取消管理员' : '设为管理员'}
                                </Button>
                              </TableCell>
                              <TableCell className="min-w-32">
                                {displayDate(user.updatedAt ?? user.createdAt)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {filteredPlatformUsers.length === 0 && (
                      <ProductEmptyState
                        icon={<Users />}
                        title="没有匹配的成员"
                        description="调整搜索条件，或等待用户完成登录后自动同步。"
                        className="mt-4 min-h-48"
                      />
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {canManageOrganization && (
              <>
                <TabsContent value="members" className="mt-4">
                  <Card className={appCardClassName}>
                <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base">成员权限</CardTitle>
                  <div className="relative w-full sm:max-w-xs">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={memberSearch}
                      onChange={(event) => setMemberSearch(event.target.value)}
                      placeholder="搜索成员"
                      className="pl-9"
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>显示名</TableHead>
                          <TableHead>邮箱</TableHead>
                          <TableHead>组织架构</TableHead>
                          <TableHead>角色</TableHead>
                          <TableHead>状态</TableHead>
                          <TableHead>加入时间</TableHead>
                          <TableHead className="text-right">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredMembers.map((member) => (
                          <MemberRow
                            key={member.userId}
                            member={member}
                            onSave={updateMember}
                            onRemove={(target) => setConfirmAction({
                              title: '移除组织成员',
                              description: `${target.email} 将失去当前组织访问权限，但用户账号不会被删除。`,
                              label: '移除成员',
                              onConfirm: async () => {
                                await runMutation(async () => {
                                  await jsonRequest('/api/organizations/members', {
                                    method: 'DELETE',
                                    body: JSON.stringify({ userId: target.userId }),
                                  });
                                });
                              },
                            })}
                          />
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {filteredMembers.length === 0 && (
                    <ProductEmptyState
                      icon={<Users />}
                      title="没有匹配的成员"
                      description="调整搜索条件，或先通过账号注册和成员配置加入组织。"
                      className="mt-4 min-h-48"
                    />
                  )}
                </CardContent>
                  </Card>
                </TabsContent>

            <TabsContent value="skill-reviews" className="mt-4">
              <SectionTitle
                title="Skill 审核"
                description="处理团队 Skill 的新增和更新提交。审核通过后才会进入团队 Skill 库。"
                action={<StatusBadge tone={pendingSkillReviewRequests.length > 0 ? 'warning' : 'success'}>{pendingSkillReviewRequests.length} 个待审</StatusBadge>}
              />
              {pendingSkillReviewRequests.length === 0 ? (
                <ProductEmptyState
                  icon={<GitPullRequest />}
                  title="暂无待审核 Skill"
                  description="个人 Skill 提交团队审核后，会集中显示在这里。"
                  className="mt-4 min-h-64"
                />
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {pendingSkillReviewRequests.map((request) => {
                    const displayName = getSkillReviewDisplayName(request);
                    const isUpdate = request.operation === 'update';
                    return (
                      <Card key={request.id} className={`${appCardClassName} border-warning/30 bg-warning/5`}>
                        <CardHeader className="pb-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-warning/30 bg-warning/10 text-warning">
                              <GitPullRequest className="size-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <CardTitle className="min-w-0 truncate text-base leading-6" title={displayName}>
                                  {displayName}
                                </CardTitle>
                                <Badge variant={isUpdate ? 'default' : 'secondary'}>
                                  {skillReviewOperationLabels[request.operation]}
                                </Badge>
                                <SkillReviewStatusBadge status={request.status} />
                              </div>
                              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                <span className="font-mono">{request.skill_id}</span>
                                <span>提交于 {displayDate(request.submitted_at)}</span>
                              </div>
                            </div>
                          </div>
                          <CardDescription className="mt-3 line-clamp-2 text-sm leading-5">
                            {getSkillReviewDescription(request)}
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
                              <AlertTriangle />
                              <AlertTitle>当前 Skill 已存在</AlertTitle>
                              <AlertDescription>
                                审核通过后会更新 `{request.skill_id}`，并按“{skillVersionBumpLabels[request.version_bump]}”升级版本。
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
                                setSkillReviewDecisionRequest(request);
                                setSkillReviewDecision('rejected');
                                setSkillReviewDecisionNote('');
                              }}
                            >
                              <XCircle className="size-4" />
                              拒绝
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => {
                                setSkillReviewDecisionRequest(request);
                                setSkillReviewDecision('approved');
                                setSkillReviewDecisionNote('');
                              }}
                            >
                              <CheckCircle2 className="size-4" />
                              通过
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

              </>
            )}

            {canManagePlatformAdmins && (
              <TabsContent value="platform" className="mt-4">
                <Card className={appCardClassName}>
                  <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ShieldCheck className="size-4 text-success" />
                      平台超级管理员
                    </CardTitle>
                    <StatusBadge tone="success">{enabledSuperAdminCount} 个已启用</StatusBadge>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Alert>
                      <ShieldCheck />
                      <AlertTitle>服务端平台权限</AlertTitle>
                      <AlertDescription>
                        超级管理员初始化由服务端配置控制。本界面不会展示初始化账号或密钥信息。
                      </AlertDescription>
                    </Alert>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
                      <Input
                        value={platformGrantEmail}
                        onChange={(event) => setPlatformGrantEmail(event.target.value)}
                        placeholder="user@example.com"
                        type="email"
                      />
                      <Button
                        disabled={!platformGrantEmail.trim() || submitting}
                        onClick={grantPlatformSuperAdmin}
                      >
                        授予超级管理员
                      </Button>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>账号</TableHead>
                          <TableHead>状态</TableHead>
                          <TableHead>授权时间</TableHead>
                          <TableHead>撤销时间</TableHead>
                          <TableHead className="text-right">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {superAdmins.map((admin) => {
                          const isLastEnabledAdmin = admin.enabled && enabledSuperAdminCount <= 1;
                          return (
                            <TableRow key={admin.userId}>
                              <TableCell className="min-w-56">
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{admin.displayName || admin.email}</p>
                                  <p className="truncate text-xs text-muted-foreground">{admin.email}</p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <StatusBadge tone={admin.enabled ? 'success' : 'neutral'}>
                                  {admin.enabled ? '已启用' : '已撤销'}
                                </StatusBadge>
                              </TableCell>
                              <TableCell>{displayDate(admin.grantedAt)}</TableCell>
                              <TableCell>{displayDate(admin.revokedAt)}</TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-2 text-destructive hover:text-destructive"
                                  disabled={!admin.enabled || isLastEnabledAdmin || submitting}
                                  onClick={() => revokePlatformSuperAdmin(admin)}
                                >
                                  <Trash2 className="size-4" />
                                  {isLastEnabledAdmin ? '最后一个管理员' : '撤销'}
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    {superAdmins.length === 0 && (
                      <ProductEmptyState
                        icon={<ShieldCheck />}
                        title="暂无超级管理员记录"
                        description="使用已配置的初始化账号登录后，再刷新此页面。"
                        className="min-h-48"
                      />
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>

      <Dialog open={!!skillReviewDecisionRequest} onOpenChange={(open) => {
        if (!open) {
          setSkillReviewDecisionRequest(null);
          setSkillReviewDecisionNote('');
          setSkillReviewDecision('approved');
        }
      }}>
        <DialogContent className="max-w-lg border-border bg-card">
          {skillReviewDecisionRequest && (
            <>
              <DialogHeader>
                <DialogTitle>{skillReviewDecision === 'approved' ? '通过 Skill 审核' : '拒绝 Skill 提交'}</DialogTitle>
                <DialogDescription>
                  {skillReviewDecision === 'approved'
                    ? skillReviewDecisionRequest.operation === 'update'
                      ? '通过后会更新已存在的团队 Skill，并写入新的版本历史。'
                      : '通过后会发布为新的团队 Skill。'
                    : '拒绝后不会修改团队 Skill，提交者可按意见重新提交。'}
                </DialogDescription>
              </DialogHeader>
              <FieldGroup>
                <Field>
                  <FieldLabel>审核项</FieldLabel>
                  <div className="rounded-md border bg-muted/20 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium">{getSkillReviewDisplayName(skillReviewDecisionRequest)}</div>
                      <Badge variant={skillReviewDecisionRequest.operation === 'update' ? 'default' : 'secondary'}>
                        {skillReviewOperationLabels[skillReviewDecisionRequest.operation]}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Skill ID {skillReviewDecisionRequest.skill_id} · 提交版本 v{skillReviewDecisionRequest.source_version || skillReviewDecisionRequest.submitted_skill.version}
                      {skillReviewDecisionRequest.target_version ? ` · 当前团队版本 v${skillReviewDecisionRequest.target_version}` : ''}
                    </div>
                    {skillReviewDecisionRequest.operation === 'update' && (
                      <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
                        当前 Skill 已存在，确认通过会更新团队 Skill 并按“{skillVersionBumpLabels[skillReviewDecisionRequest.version_bump]}”升级版本。
                      </div>
                    )}
                    {skillReviewDecisionRequest.submitted_note && (
                      <div className="mt-3 whitespace-pre-wrap text-xs text-muted-foreground">
                        {skillReviewDecisionRequest.submitted_note}
                      </div>
                    )}
                  </div>
                </Field>
                <Field>
                  <FieldLabel htmlFor="skill-review-decision-note">审核意见</FieldLabel>
                  <Textarea
                    id="skill-review-decision-note"
                    value={skillReviewDecisionNote}
                    onChange={(event) => setSkillReviewDecisionNote(event.target.value)}
                    placeholder={skillReviewDecision === 'approved' ? '可选：记录通过原因或后续使用建议。' : '建议填写拒绝原因，方便提交者修改后重新提交。'}
                    className="min-h-28 resize-none"
                  />
                </Field>
              </FieldGroup>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSkillReviewDecisionRequest(null)} disabled={submitting}>
                  取消
                </Button>
                <Button
                  variant={skillReviewDecision === 'approved' ? 'default' : 'destructive'}
                  onClick={handleSkillReviewDecision}
                  disabled={submitting}
                >
                  {skillReviewDecision === 'approved' ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
                  {submitting ? '处理中...' : skillReviewDecision === 'approved' ? '确认通过' : '确认拒绝'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(confirmAction)} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmAction?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                const action = confirmAction?.onConfirm;
                setConfirmAction(null);
                if (action) void action();
              }}
            >
              {confirmAction?.label ?? '确认'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MemberRow({
  member,
  onSave,
  onRemove,
}: {
  member: OrganizationMember;
  onSave: (member: OrganizationMember, role: OrganizationRole, status: string) => Promise<void>;
  onRemove: (member: OrganizationMember) => void;
}) {
  const [role, setRole] = useState<OrganizationRole>(member.role);
  const [status, setStatus] = useState(member.status);
  const changed = role !== member.role || status !== member.status;

  return (
    <TableRow>
      <TableCell className="min-w-40">
        <p className="truncate font-medium">{member.displayName || '-'}</p>
      </TableCell>
      <TableCell className="min-w-56">
        <p className="truncate">{member.email}</p>
      </TableCell>
      <TableCell className="min-w-72">
        <p className="line-clamp-2" title={member.department ?? undefined}>
          {member.department || '-'}
        </p>
      </TableCell>
      <TableCell>
        <Select value={role} onValueChange={(value) => setRole(value as OrganizationRole)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {organizationRoles.map((item) => (
              <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">启用</SelectItem>
            <SelectItem value="disabled">停用</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>{displayDate(member.joinedAt)}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button size="sm" disabled={!changed} onClick={() => void onSave(member, role, status)}>
            保存
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-2 text-destructive hover:text-destructive"
            onClick={() => onRemove(member)}
          >
            <Trash2 className="size-4" />
            移除
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
