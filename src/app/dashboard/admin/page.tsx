'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  GitBranch,
  GitPullRequest,
  Loader2,
  Network,
  Plus,
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
type DepartmentRole = 'department_admin' | 'department_manager' | 'department_member' | 'department_viewer';
type TeamRole = 'team_admin' | 'team_manager' | 'team_member' | 'team_viewer';

interface DashboardAuthState {
  isSuperAdmin: boolean;
  activeOrganizationId: string | null;
  capabilities: {
    manageOrganization: boolean;
    manageMembers: boolean;
    manageDepartments: boolean;
    manageTeams: boolean;
    managePlatformAdmins: boolean;
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
  role: OrganizationRole;
  status: string;
  joinedAt: string;
}

interface DepartmentMember {
  userId: string;
  email: string;
  displayName: string | null;
  role: DepartmentRole;
}

interface Department {
  id: string;
  organizationId: string;
  parentDepartmentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  members: DepartmentMember[];
}

interface TeamMember {
  userId: string;
  email: string;
  displayName: string | null;
  role: TeamRole;
}

interface Team {
  id: string;
  organizationId: string;
  departmentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  members: TeamMember[];
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

interface ApiError {
  error?: string;
}

type SkillScope = 'personal' | 'team' | 'official';
type SkillSourceType = 'local' | 'registry' | 'git';
type SkillStatus = 'imported' | 'pending_review' | 'published' | 'rejected' | 'archived';
type VersionBump = 'patch' | 'minor' | 'major';
type SkillReviewOperation = 'create' | 'update';
type SkillReviewRequestStatus = 'pending' | 'approved' | 'rejected';
type ManagedResourceType = 'skill' | 'workflow' | 'knowledge_base' | 'prd_document';

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

interface ResourceStatus {
  type: ManagedResourceType;
  resourceCount: number;
  grantCount: number;
  status: 'active';
}

interface ResourceStatusApiResponse extends ApiError {
  resources?: ResourceStatus[];
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

const departmentRoles: Array<{ value: DepartmentRole; label: string }> = [
  { value: 'department_admin', label: '部门管理员' },
  { value: 'department_manager', label: '部门管理者' },
  { value: 'department_member', label: '部门成员' },
  { value: 'department_viewer', label: '部门只读' },
];

const teamRoles: Array<{ value: TeamRole; label: string }> = [
  { value: 'team_admin', label: '团队管理员' },
  { value: 'team_manager', label: '团队管理者' },
  { value: 'team_member', label: '团队成员' },
  { value: 'team_viewer', label: '团队只读' },
];

const resourceTypes: Array<{ label: string; type: ManagedResourceType; description: string }> = [
  { label: 'Skill', type: 'skill', description: '团队方法、官方模板和个人 Skill 的访问控制。' },
  { label: '工作流', type: 'workflow', description: '工作目录、流程编排和运行产物的访问控制。' },
  { label: '知识库', type: 'knowledge_base', description: '知识资产、文档切片和检索上下文的访问控制。' },
  { label: 'PRD 文档', type: 'prd_document', description: '里程碑文档和规划产物的访问控制。' },
];

const rootDepartmentValue = '__root__';
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

function roleLabel<T extends string>(roles: Array<{ value: T; label: string }>, value: T): string {
  return roles.find((role) => role.value === value)?.label ?? value;
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

function buildDepartmentChildren(departments: Department[]): Map<string | null, Department[]> {
  const children = new Map<string | null, Department[]>();
  for (const department of departments) {
    const current = children.get(department.parentDepartmentId) ?? [];
    current.push(department);
    children.set(department.parentDepartmentId, current);
  }
  return children;
}

function descendantCount(departmentId: string, childrenByParent: Map<string | null, Department[]>): number {
  const children = childrenByParent.get(departmentId) ?? [];
  return children.reduce((total, child) => total + 1 + descendantCount(child.id, childrenByParent), 0);
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
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [superAdmins, setSuperAdmins] = useState<SuperAdminRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [departmentName, setDepartmentName] = useState('');
  const [departmentDescription, setDepartmentDescription] = useState('');
  const [departmentParentId, setDepartmentParentId] = useState(rootDepartmentValue);
  const [departmentMemberDepartmentId, setDepartmentMemberDepartmentId] = useState('');
  const [departmentMemberUserId, setDepartmentMemberUserId] = useState('');
  const [departmentMemberRole, setDepartmentMemberRole] = useState<DepartmentRole>('department_member');
  const [teamOpen, setTeamOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [teamName, setTeamName] = useState('');
  const [teamDescription, setTeamDescription] = useState('');
  const [teamDepartmentId, setTeamDepartmentId] = useState(rootDepartmentValue);
  const [teamMemberTeamId, setTeamMemberTeamId] = useState('');
  const [teamMemberUserId, setTeamMemberUserId] = useState('');
  const [teamMemberRole, setTeamMemberRole] = useState<TeamRole>('team_member');
  const [platformGrantEmail, setPlatformGrantEmail] = useState('');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [skillReviewRequests, setSkillReviewRequests] = useState<SkillReviewRequest[]>([]);
  const [skillReviewDecisionRequest, setSkillReviewDecisionRequest] = useState<SkillReviewRequest | null>(null);
  const [skillReviewDecision, setSkillReviewDecision] = useState<'approved' | 'rejected'>('approved');
  const [skillReviewDecisionNote, setSkillReviewDecisionNote] = useState('');
  const [resourceStatuses, setResourceStatuses] = useState<ResourceStatus[]>([]);

  const activeOrganization = useMemo(() => {
    if (!authState) return null;
    return authState.organizations.find((organization) => organization.id === authState.activeOrganizationId)
      ?? authState.organizations[0]
      ?? null;
  }, [authState]);

  const memberByUserId = useMemo(() => (
    new Map(members.map((member) => [member.userId, member]))
  ), [members]);

  const departmentById = useMemo(() => (
    new Map(departments.map((department) => [department.id, department]))
  ), [departments]);

  const childrenByParent = useMemo(() => buildDepartmentChildren(departments), [departments]);

  const filteredMembers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    if (!query) return members;
    return members.filter((member) => (
      member.email.toLowerCase().includes(query)
      || (member.displayName ?? '').toLowerCase().includes(query)
      || member.role.toLowerCase().includes(query)
    ));
  }, [memberSearch, members]);

  const enabledSuperAdminCount = useMemo(() => (
    superAdmins.filter((admin) => admin.enabled).length
  ), [superAdmins]);

  const pendingSkillReviewRequests = useMemo(() => (
    skillReviewRequests.filter((request) => request.status === 'pending')
  ), [skillReviewRequests]);

  const resourceStatusByType = useMemo(() => (
    new Map(resourceStatuses.map((resource) => [resource.type, resource]))
  ), [resourceStatuses]);

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

      const platformAdminData = auth.capabilities.managePlatformAdmins
        ? await jsonRequest<{ superAdmins: SuperAdminRecord[] }>('/api/admin/super-admins')
        : { superAdmins: [] };
      setSuperAdmins(platformAdminData.superAdmins);
      await loadSkillReviews();

      if (!auth.capabilities.manageOrganization || !auth.activeOrganizationId) {
        setMembers([]);
        setDepartments([]);
        setTeams([]);
        setResourceStatuses([]);
        return;
      }

      const [
        memberData,
        departmentData,
        teamData,
        resourceStatusData,
      ] = await Promise.all([
        jsonRequest<{ members: OrganizationMember[] }>('/api/organizations/members'),
        jsonRequest<{ departments: Department[] }>('/api/organizations/departments'),
        jsonRequest<{ teams: Team[] }>('/api/organizations/teams'),
        jsonRequest<ResourceStatusApiResponse>('/api/admin/resources'),
      ]);

      setMembers(memberData.members);
      setDepartments(departmentData.departments);
      setTeams(teamData.teams);
      setResourceStatuses(resourceStatusData.resources ?? []);
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

  function openDepartmentDialog(department: Department | null) {
    setEditingDepartment(department);
    setDepartmentName(department?.name ?? '');
    setDepartmentDescription(department?.description ?? '');
    setDepartmentParentId(department?.parentDepartmentId ?? rootDepartmentValue);
    setDepartmentOpen(true);
  }

  async function saveDepartment() {
    await runMutation(async () => {
      const payload = {
        name: departmentName,
        description: departmentDescription,
        parentDepartmentId: departmentParentId === rootDepartmentValue ? null : departmentParentId,
      };
      if (editingDepartment) {
        await jsonRequest('/api/organizations/departments', {
          method: 'PATCH',
          body: JSON.stringify({
            ...payload,
            departmentId: editingDepartment.id,
          }),
        });
      } else {
        await jsonRequest('/api/organizations/departments', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setDepartmentOpen(false);
    });
  }

  async function assignDepartmentMember() {
    await runMutation(async () => {
      await jsonRequest('/api/organizations/departments/members', {
        method: 'POST',
        body: JSON.stringify({
          departmentId: departmentMemberDepartmentId,
          userId: departmentMemberUserId,
          role: departmentMemberRole,
        }),
      });
      setDepartmentMemberUserId('');
      setDepartmentMemberRole('department_member');
    });
  }

  function openTeamDialog(team: Team | null) {
    setEditingTeam(team);
    setTeamName(team?.name ?? '');
    setTeamDescription(team?.description ?? '');
    setTeamDepartmentId(team?.departmentId ?? rootDepartmentValue);
    setTeamOpen(true);
  }

  async function saveTeam() {
    await runMutation(async () => {
      const payload = {
        name: teamName,
        description: teamDescription,
        departmentId: teamDepartmentId === rootDepartmentValue ? null : teamDepartmentId,
      };
      if (editingTeam) {
        await jsonRequest('/api/organizations/teams', {
          method: 'PATCH',
          body: JSON.stringify({
            ...payload,
            teamId: editingTeam.id,
          }),
        });
      } else {
        await jsonRequest('/api/organizations/teams', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setTeamOpen(false);
    });
  }

  async function assignTeamMember() {
    await runMutation(async () => {
      await jsonRequest('/api/organizations/teams/members', {
        method: 'POST',
        body: JSON.stringify({
          teamId: teamMemberTeamId,
          userId: teamMemberUserId,
          role: teamMemberRole,
        }),
      });
      setTeamMemberUserId('');
      setTeamMemberRole('team_member');
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
          description="管理账号权限、部门继承、跨部门团队和平台管理控制。"
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

  if (authState && !authState.capabilities.manageOrganization) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader
          title="组织管理"
          description="该区域仅限组织管理员访问。"
          meta={<StatusBadge tone="danger">无权限</StatusBadge>}
        />
        <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
          <AdminUnavailable description="当前账号没有组织管理权限。服务端接口也会执行相同的权限校验。" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="组织管理"
        description="管理成员、部门继承、跨部门团队和当前组织的权限准备状态。"
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className={appCardClassName}>
              <CardContent className="flex items-center gap-3 p-4">
                <Users className="size-5 text-brand" />
                <div>
                  <p className="text-2xl font-semibold">{members.length}</p>
                  <p className="text-xs text-muted-foreground">成员</p>
                </div>
              </CardContent>
            </Card>
            <Card className={appCardClassName}>
              <CardContent className="flex items-center gap-3 p-4">
                <Building2 className="size-5 text-success" />
                <div>
                  <p className="text-2xl font-semibold">{departments.length}</p>
                  <p className="text-xs text-muted-foreground">部门</p>
                </div>
              </CardContent>
            </Card>
            <Card className={appCardClassName}>
              <CardContent className="flex items-center gap-3 p-4">
                <Network className="size-5 text-warning" />
                <div>
                  <p className="text-2xl font-semibold">{teams.length}</p>
                  <p className="text-xs text-muted-foreground">团队</p>
                </div>
              </CardContent>
            </Card>
            <Card className={appCardClassName}>
              <CardContent className="flex items-center gap-3 p-4">
                <GitPullRequest className="size-5 text-brand" />
                <div>
                  <p className="text-2xl font-semibold">{pendingSkillReviewRequests.length}</p>
                  <p className="text-xs text-muted-foreground">Skill 待审</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="min-h-0">
            <TabsList className="max-w-full justify-start overflow-x-auto">
              <TabsTrigger value="members">成员</TabsTrigger>
              <TabsTrigger value="departments">部门</TabsTrigger>
              <TabsTrigger value="teams">团队</TabsTrigger>
              <TabsTrigger value="skill-reviews" className="gap-2">
                Skill 审核
                {pendingSkillReviewRequests.length > 0 && (
                  <Badge variant="secondary" className="-mr-1 h-5 px-1.5 text-[11px]">
                    {pendingSkillReviewRequests.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="resources">资源权限</TabsTrigger>
              {authState?.capabilities.managePlatformAdmins && (
                <TabsTrigger value="platform">平台管理员</TabsTrigger>
              )}
            </TabsList>

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
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>成员</TableHead>
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

            <TabsContent value="departments" className="mt-4">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <Card className={appCardClassName}>
                  <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle className="text-base">部门结构</CardTitle>
                    <Button size="sm" className="gap-2" onClick={() => openDepartmentDialog(null)}>
                      <Plus className="size-4" />
                      新增部门
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(childrenByParent.get(null) ?? []).map((department) => (
                      <DepartmentTreeItem
                        key={department.id}
                        department={department}
                        childrenByParent={childrenByParent}
                        memberByUserId={memberByUserId}
                        onEdit={openDepartmentDialog}
                        onDelete={(target) => setConfirmAction({
                          title: '删除部门',
                          description: `${target.name} 只能在子部门和关联团队迁移后删除。`,
                          label: '删除部门',
                          onConfirm: async () => {
                            await runMutation(async () => {
                              await jsonRequest('/api/organizations/departments', {
                                method: 'DELETE',
                                body: JSON.stringify({ departmentId: target.id }),
                              });
                            });
                          },
                        })}
                      />
                    ))}
                    {departments.length === 0 && (
                      <ProductEmptyState
                        icon={<Building2 />}
                        title="暂无部门"
                        description="创建部门后，可以开始配置继承权限。"
                        className="min-h-48"
                      />
                    )}
                  </CardContent>
                </Card>

                <Card className={appCardClassName}>
                  <CardHeader>
                    <CardTitle className="text-base">部门成员分配</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FieldGroup>
                      <Field>
                        <FieldLabel>部门</FieldLabel>
                        <Select value={departmentMemberDepartmentId} onValueChange={setDepartmentMemberDepartmentId}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="选择部门" />
                          </SelectTrigger>
                          <SelectContent>
                            {departments.map((department) => (
                              <SelectItem key={department.id} value={department.id}>
                                {department.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field>
                        <FieldLabel>成员</FieldLabel>
                        <Select value={departmentMemberUserId} onValueChange={setDepartmentMemberUserId}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="选择成员" />
                          </SelectTrigger>
                          <SelectContent>
                            {members.map((member) => (
                              <SelectItem key={member.userId} value={member.userId}>
                                {member.email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field>
                        <FieldLabel>角色</FieldLabel>
                        <Select value={departmentMemberRole} onValueChange={(value) => setDepartmentMemberRole(value as DepartmentRole)}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {departmentRoles.map((role) => (
                              <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </FieldGroup>
                    <Button
                      className="w-full"
                      disabled={!departmentMemberDepartmentId || !departmentMemberUserId || submitting}
                      onClick={assignDepartmentMember}
                    >
                      分配部门角色
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="teams" className="mt-4">
              <SectionTitle
                title="跨部门团队"
                description="团队成员关系独立于部门成员关系，适合跨部门协作和项目制授权。"
                action={(
                  <Button size="sm" className="gap-2" onClick={() => openTeamDialog(null)}>
                    <Plus className="size-4" />
                    新增团队
                  </Button>
                )}
              />
              <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {teams.map((team) => (
                    <Card key={team.id} className={appCardClassName}>
                      <CardHeader className="gap-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <CardTitle className="truncate text-base">{team.name}</CardTitle>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {team.departmentId ? departmentById.get(team.departmentId)?.name ?? '未知部门' : '跨部门团队'}
                            </p>
                          </div>
                          <StatusBadge tone={team.departmentId ? 'neutral' : 'brand'}>
                            {team.departmentId ? '已关联部门' : '跨部门'}
                          </StatusBadge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="min-h-10 text-sm text-muted-foreground">{team.description || '暂无说明。'}</p>
                        <div className="flex flex-wrap gap-2">
                          {team.members.map((member) => (
                            <StatusBadge key={member.userId} tone="neutral">
                              {member.displayName || member.email} · {roleLabel(teamRoles, member.role)}
                            </StatusBadge>
                          ))}
                          {team.members.length === 0 && <span className="text-xs text-muted-foreground">暂无成员</span>}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="secondary" onClick={() => openTeamDialog(team)}>
                            编辑
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2 text-destructive hover:text-destructive"
                            onClick={() => setConfirmAction({
                              title: '删除团队',
                              description: `${team.name} 将被删除，团队成员分配关系也会一并移除。`,
                              label: '删除团队',
                              onConfirm: async () => {
                                await runMutation(async () => {
                                  await jsonRequest('/api/organizations/teams', {
                                    method: 'DELETE',
                                    body: JSON.stringify({ teamId: team.id }),
                                  });
                                });
                              },
                            })}
                          >
                            <Trash2 className="size-4" />
                            删除
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {teams.length === 0 && (
                    <ProductEmptyState
                      icon={<Network />}
                      title="暂无团队"
                      description="创建团队后，可以协调跨部门访问权限。"
                      className="min-h-64"
                    />
                  )}
                </div>

                <Card className={appCardClassName}>
                  <CardHeader>
                    <CardTitle className="text-base">团队成员分配</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FieldGroup>
                      <Field>
                        <FieldLabel>团队</FieldLabel>
                        <Select value={teamMemberTeamId} onValueChange={setTeamMemberTeamId}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="选择团队" />
                          </SelectTrigger>
                          <SelectContent>
                            {teams.map((team) => (
                              <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field>
                        <FieldLabel>成员</FieldLabel>
                        <Select value={teamMemberUserId} onValueChange={setTeamMemberUserId}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="选择成员" />
                          </SelectTrigger>
                          <SelectContent>
                            {members.map((member) => (
                              <SelectItem key={member.userId} value={member.userId}>{member.email}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field>
                        <FieldLabel>角色</FieldLabel>
                        <Select value={teamMemberRole} onValueChange={(value) => setTeamMemberRole(value as TeamRole)}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {teamRoles.map((role) => (
                              <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </FieldGroup>
                    <Button
                      className="w-full"
                      disabled={!teamMemberTeamId || !teamMemberUserId || submitting}
                      onClick={assignTeamMember}
                    >
                      分配团队角色
                    </Button>
                  </CardContent>
                </Card>
              </div>
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

            <TabsContent value="resources" className="mt-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {resourceTypes.map((resource) => (
                  <Card key={resource.type} className={appCardClassName}>
                    <CardHeader className="gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <CardTitle className="flex items-center gap-2 text-base">
                            <GitBranch className="size-4 text-brand" />
                            {resource.label}
                          </CardTitle>
                          <CardDescription className="mt-1">{resource.description}</CardDescription>
                        </div>
                        <StatusBadge tone="success">已接入</StatusBadge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Alert className="border-success/20 bg-success/5">
                        <ShieldCheck />
                        <AlertTitle>Postgres 权限索引已生效</AlertTitle>
                        <AlertDescription>
                          资源读写会经过服务端权限校验；JSON 文件仅保留为导入和备份兼容层。
                        </AlertDescription>
                      </Alert>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-md border border-border/60 bg-background/70 p-3">
                          <div className="text-2xl font-semibold text-foreground">
                            {resourceStatusByType.get(resource.type)?.resourceCount ?? 0}
                          </div>
                          <div className="text-xs text-muted-foreground">已迁移资源</div>
                        </div>
                        <div className="rounded-md border border-border/60 bg-background/70 p-3">
                          <div className="text-2xl font-semibold text-foreground">
                            {resourceStatusByType.get(resource.type)?.grantCount ?? 0}
                          </div>
                          <div className="text-xs text-muted-foreground">授权记录</div>
                        </div>
                      </div>
                      <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                        资源级授权编辑将基于当前索引继续接入；当前版本已使用该索引进行访问控制。
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {authState?.capabilities.managePlatformAdmins && (
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

      <Dialog open={departmentOpen} onOpenChange={setDepartmentOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-card">
          <DialogHeader>
            <DialogTitle>{editingDepartment ? '编辑部门' : '新增部门'}</DialogTitle>
            <DialogDescription>
              部门访问权限会继承到所有子部门。
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel>名称</FieldLabel>
              <Input value={departmentName} onChange={(event) => setDepartmentName(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel>上级部门</FieldLabel>
              <Select value={departmentParentId} onValueChange={setDepartmentParentId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={rootDepartmentValue}>根部门</SelectItem>
                  {departments
                    .filter((department) => department.id !== editingDepartment?.id)
                    .map((department) => (
                      <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>说明</FieldLabel>
              <Textarea value={departmentDescription} onChange={(event) => setDepartmentDescription(event.target.value)} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDepartmentOpen(false)}>取消</Button>
            <Button disabled={!departmentName || submitting} onClick={saveDepartment}>
              保存部门
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={teamOpen} onOpenChange={setTeamOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-card">
          <DialogHeader>
            <DialogTitle>{editingTeam ? '编辑团队' : '新增团队'}</DialogTitle>
            <DialogDescription>
              团队可以包含任意部门的成员。
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel>名称</FieldLabel>
              <Input value={teamName} onChange={(event) => setTeamName(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel>关联部门</FieldLabel>
              <Select value={teamDepartmentId} onValueChange={setTeamDepartmentId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={rootDepartmentValue}>不关联部门</SelectItem>
                  {departments.map((department) => (
                    <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>说明</FieldLabel>
              <Textarea value={teamDescription} onChange={(event) => setTeamDescription(event.target.value)} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setTeamOpen(false)}>取消</Button>
            <Button disabled={!teamName || submitting} onClick={saveTeam}>
              保存团队
            </Button>
          </DialogFooter>
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
      <TableCell className="min-w-56">
        <div className="min-w-0">
          <p className="truncate font-medium">{member.displayName || member.email}</p>
          <p className="truncate text-xs text-muted-foreground">{member.email}</p>
        </div>
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

function DepartmentTreeItem({
  department,
  childrenByParent,
  memberByUserId,
  onEdit,
  onDelete,
  depth = 0,
}: {
  department: Department;
  childrenByParent: Map<string | null, Department[]>;
  memberByUserId: Map<string, OrganizationMember>;
  onEdit: (department: Department) => void;
  onDelete: (department: Department) => void;
  depth?: number;
}) {
  const children = childrenByParent.get(department.id) ?? [];
  const inheritedCount = descendantCount(department.id, childrenByParent);

  return (
    <div className="space-y-3">
      <div
        className="rounded-lg border border-border/60 bg-card/70 p-4"
        style={{ marginLeft: depth > 0 ? `${Math.min(depth, 4) * 1}rem` : undefined }}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-semibold">{department.name}</h3>
              <StatusBadge tone="brand">{inheritedCount} 个子级范围</StatusBadge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{department.description || '暂无说明。'}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="secondary" onClick={() => onEdit(department)}>编辑</Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-2 text-destructive hover:text-destructive"
              onClick={() => onDelete(department)}
            >
              <Trash2 className="size-4" />
              删除
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {department.members.map((member) => (
            <StatusBadge key={member.userId} tone="neutral">
              {memberByUserId.get(member.userId)?.displayName || member.email} · {roleLabel(departmentRoles, member.role)}
            </StatusBadge>
          ))}
          {department.members.length === 0 && <span className="text-xs text-muted-foreground">暂无直接成员</span>}
        </div>
      </div>
      {children.map((child) => (
        <DepartmentTreeItem
          key={child.id}
          department={child}
          childrenByParent={childrenByParent}
          memberByUserId={memberByUserId}
          onEdit={onEdit}
          onDelete={onDelete}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}
