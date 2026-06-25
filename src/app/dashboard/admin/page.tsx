'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  GitBranch,
  Loader2,
  Network,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  Users,
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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

interface ConfirmAction {
  title: string;
  description: string;
  label: string;
  onConfirm: () => Promise<void>;
}

const organizationRoles: Array<{ value: OrganizationRole; label: string }> = [
  { value: 'org_owner', label: 'Owner' },
  { value: 'org_admin', label: 'Admin' },
  { value: 'org_manager', label: 'Manager' },
  { value: 'org_member', label: 'Member' },
  { value: 'org_viewer', label: 'Viewer' },
];

const departmentRoles: Array<{ value: DepartmentRole; label: string }> = [
  { value: 'department_admin', label: 'Department admin' },
  { value: 'department_manager', label: 'Department manager' },
  { value: 'department_member', label: 'Department member' },
  { value: 'department_viewer', label: 'Department viewer' },
];

const teamRoles: Array<{ value: TeamRole; label: string }> = [
  { value: 'team_admin', label: 'Team admin' },
  { value: 'team_manager', label: 'Team manager' },
  { value: 'team_member', label: 'Team member' },
  { value: 'team_viewer', label: 'Team viewer' },
];

const resourceTypes = [
  { label: 'Skills', type: 'skill' },
  { label: 'Workflows', type: 'workflow' },
  { label: 'Knowledge bases', type: 'knowledge_base' },
  { label: 'PRD documents', type: 'prd_document' },
];

const rootDepartmentValue = '__root__';

function displayDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function roleLabel<T extends string>(roles: Array<{ value: T; label: string }>, value: T): string {
  return roles.find((role) => role.value === value)?.label ?? value;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const data = await response.json() as T & ApiError;
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
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
      title="Administration is unavailable"
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

      if (!auth.capabilities.manageOrganization || !auth.activeOrganizationId) {
        setMembers([]);
        setDepartments([]);
        setTeams([]);
        return;
      }

      const [
        memberData,
        departmentData,
        teamData,
      ] = await Promise.all([
        jsonRequest<{ members: OrganizationMember[] }>('/api/organizations/members'),
        jsonRequest<{ departments: Department[] }>('/api/organizations/departments'),
        jsonRequest<{ teams: Team[] }>('/api/organizations/teams'),
      ]);

      setMembers(memberData.members);
      setDepartments(departmentData.departments);
      setTeams(teamData.teams);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load administration data');
    } finally {
      setLoading(false);
    }
  }, []);

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
      setErrorMessage(error instanceof Error ? error.message : 'Operation failed');
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
      title: 'Revoke super admin',
      description: `${admin.email} will lose platform-wide product administration access. This does not disable the user account.`,
      label: 'Revoke access',
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
          title="Organization Admin"
          description="Manage account access, department inheritance, cross-department teams, and administrative controls."
          meta={<StatusBadge tone="neutral">Loading</StatusBadge>}
        />
        <div className="grid min-h-0 flex-1 place-items-center p-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading administration data
          </div>
        </div>
      </div>
    );
  }

  if (authState && !authState.capabilities.manageOrganization) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader
          title="Organization Admin"
          description="This area is limited to organization administrators."
          meta={<StatusBadge tone="danger">Restricted</StatusBadge>}
        />
        <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
          <AdminUnavailable description="Your current account does not have organization management permission. Server APIs enforce the same restriction." />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Organization Admin"
        description="Manage members, department inheritance, cross-department teams, and permission readiness for the active organization."
        meta={(
          <>
            <StatusBadge tone="brand">{activeOrganization?.name ?? 'Active organization'}</StatusBadge>
            {authState?.isSuperAdmin && <StatusBadge tone="success">Super admin</StatusBadge>}
          </>
        )}
      />

      <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
        <div className="flex min-h-0 flex-col gap-4">
          {errorMessage && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>Admin request failed</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Card className={appCardClassName}>
              <CardContent className="flex items-center gap-3 p-4">
                <Users className="size-5 text-brand" />
                <div>
                  <p className="text-2xl font-semibold">{members.length}</p>
                  <p className="text-xs text-muted-foreground">Members</p>
                </div>
              </CardContent>
            </Card>
            <Card className={appCardClassName}>
              <CardContent className="flex items-center gap-3 p-4">
                <Building2 className="size-5 text-success" />
                <div>
                  <p className="text-2xl font-semibold">{departments.length}</p>
                  <p className="text-xs text-muted-foreground">Departments</p>
                </div>
              </CardContent>
            </Card>
            <Card className={appCardClassName}>
              <CardContent className="flex items-center gap-3 p-4">
                <Network className="size-5 text-warning" />
                <div>
                  <p className="text-2xl font-semibold">{teams.length}</p>
                  <p className="text-xs text-muted-foreground">Teams</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="min-h-0">
            <TabsList className="max-w-full justify-start overflow-x-auto">
              <TabsTrigger value="members">Members</TabsTrigger>
              <TabsTrigger value="departments">Departments</TabsTrigger>
              <TabsTrigger value="teams">Teams</TabsTrigger>
              <TabsTrigger value="resources">Resource permissions</TabsTrigger>
              {authState?.capabilities.managePlatformAdmins && (
                <TabsTrigger value="platform">Platform admins</TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="members" className="mt-4">
              <Card className={appCardClassName}>
                <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base">Member access</CardTitle>
                  <div className="relative w-full sm:max-w-xs">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={memberSearch}
                      onChange={(event) => setMemberSearch(event.target.value)}
                      placeholder="Search members"
                      className="pl-9"
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Member</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMembers.map((member) => (
                        <MemberRow
                          key={member.userId}
                          member={member}
                          onSave={updateMember}
                          onRemove={(target) => setConfirmAction({
                            title: 'Remove organization member',
                            description: `${target.email} will lose access to this organization. This does not delete the user account.`,
                            label: 'Remove member',
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
                      title="No matching members"
                      description="Adjust the search query."
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
                    <CardTitle className="text-base">Department tree</CardTitle>
                    <Button size="sm" className="gap-2" onClick={() => openDepartmentDialog(null)}>
                      <Plus className="size-4" />
                      Add department
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
                          title: 'Delete department',
                          description: `${target.name} can be deleted only after child departments and teams are moved away.`,
                          label: 'Delete department',
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
                        title="No departments yet"
                        description="Create a department to start modeling inherited access."
                        className="min-h-48"
                      />
                    )}
                  </CardContent>
                </Card>

                <Card className={appCardClassName}>
                  <CardHeader>
                    <CardTitle className="text-base">Department member assignment</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FieldGroup>
                      <Field>
                        <FieldLabel>Department</FieldLabel>
                        <Select value={departmentMemberDepartmentId} onValueChange={setDepartmentMemberDepartmentId}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select department" />
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
                        <FieldLabel>Member</FieldLabel>
                        <Select value={departmentMemberUserId} onValueChange={setDepartmentMemberUserId}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select member" />
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
                        <FieldLabel>Role</FieldLabel>
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
                      Assign department role
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="teams" className="mt-4">
              <SectionTitle
                title="Cross-department teams"
                description="Team membership is independent from department membership, so people can work across department boundaries."
                action={(
                  <Button size="sm" className="gap-2" onClick={() => openTeamDialog(null)}>
                    <Plus className="size-4" />
                    Add team
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
                              {team.departmentId ? departmentById.get(team.departmentId)?.name ?? 'Unknown department' : 'Cross-department team'}
                            </p>
                          </div>
                          <StatusBadge tone={team.departmentId ? 'neutral' : 'brand'}>
                            {team.departmentId ? 'Department linked' : 'Cross-dept'}
                          </StatusBadge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="min-h-10 text-sm text-muted-foreground">{team.description || 'No description yet.'}</p>
                        <div className="flex flex-wrap gap-2">
                          {team.members.map((member) => (
                            <StatusBadge key={member.userId} tone="neutral">
                              {member.displayName || member.email} · {roleLabel(teamRoles, member.role)}
                            </StatusBadge>
                          ))}
                          {team.members.length === 0 && <span className="text-xs text-muted-foreground">No members assigned</span>}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="secondary" onClick={() => openTeamDialog(team)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2 text-destructive hover:text-destructive"
                            onClick={() => setConfirmAction({
                              title: 'Delete team',
                              description: `${team.name} will be removed with its team membership assignments.`,
                              label: 'Delete team',
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
                            Delete
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {teams.length === 0 && (
                    <ProductEmptyState
                      icon={<Network />}
                      title="No teams yet"
                      description="Create a team for cross-department access coordination."
                      className="min-h-64"
                    />
                  )}
                </div>

                <Card className={appCardClassName}>
                  <CardHeader>
                    <CardTitle className="text-base">Team member assignment</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FieldGroup>
                      <Field>
                        <FieldLabel>Team</FieldLabel>
                        <Select value={teamMemberTeamId} onValueChange={setTeamMemberTeamId}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select team" />
                          </SelectTrigger>
                          <SelectContent>
                            {teams.map((team) => (
                              <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field>
                        <FieldLabel>Member</FieldLabel>
                        <Select value={teamMemberUserId} onValueChange={setTeamMemberUserId}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select member" />
                          </SelectTrigger>
                          <SelectContent>
                            {members.map((member) => (
                              <SelectItem key={member.userId} value={member.userId}>{member.email}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field>
                        <FieldLabel>Role</FieldLabel>
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
                      Assign team role
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="resources" className="mt-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {resourceTypes.map((resource) => (
                  <Card key={resource.type} className={appCardClassName}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <GitBranch className="size-4 text-brand" />
                        {resource.label}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Alert>
                        <ShieldCheck />
                        <AlertTitle>Permission indexes are ready</AlertTitle>
                        <AlertDescription>
                          Resource grant editing will be enabled when the Skill and workflow business source moves into Postgres.
                        </AlertDescription>
                      </Alert>
                      <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                        <div className="rounded-md border border-border/60 p-3">Department grants</div>
                        <div className="rounded-md border border-border/60 p-3">Team grants</div>
                        <div className="rounded-md border border-border/60 p-3">User grants</div>
                      </div>
                      <Button className="w-full gap-2" disabled>
                        <Plus className="size-4" />
                        Add grant after resource migration
                      </Button>
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
                      Platform super admins
                    </CardTitle>
                    <StatusBadge tone="success">{enabledSuperAdminCount} enabled</StatusBadge>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Alert>
                      <ShieldCheck />
                      <AlertTitle>Server-side platform access</AlertTitle>
                      <AlertDescription>
                        Super admin bootstrap is controlled by server-only configuration. This interface never displays configured bootstrap principals or secret values.
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
                        Grant super admin
                      </Button>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Account</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Granted</TableHead>
                          <TableHead>Revoked</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
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
                                  {admin.enabled ? 'Enabled' : 'Revoked'}
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
                                  {isLastEnabledAdmin ? 'Last enabled admin' : 'Revoke'}
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
                        title="No super admins listed"
                        description="Sign in as a configured bootstrap user, then refresh this page."
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

      <Dialog open={departmentOpen} onOpenChange={setDepartmentOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-card">
          <DialogHeader>
            <DialogTitle>{editingDepartment ? 'Edit department' : 'Add department'}</DialogTitle>
            <DialogDescription>
              Department access inherits to child departments for every action.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel>Name</FieldLabel>
              <Input value={departmentName} onChange={(event) => setDepartmentName(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel>Parent department</FieldLabel>
              <Select value={departmentParentId} onValueChange={setDepartmentParentId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={rootDepartmentValue}>Root department</SelectItem>
                  {departments
                    .filter((department) => department.id !== editingDepartment?.id)
                    .map((department) => (
                      <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Description</FieldLabel>
              <Textarea value={departmentDescription} onChange={(event) => setDepartmentDescription(event.target.value)} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDepartmentOpen(false)}>Cancel</Button>
            <Button disabled={!departmentName || submitting} onClick={saveDepartment}>
              Save department
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={teamOpen} onOpenChange={setTeamOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-card">
          <DialogHeader>
            <DialogTitle>{editingTeam ? 'Edit team' : 'Add team'}</DialogTitle>
            <DialogDescription>
              Teams can include members from any department.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel>Name</FieldLabel>
              <Input value={teamName} onChange={(event) => setTeamName(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel>Linked department</FieldLabel>
              <Select value={teamDepartmentId} onValueChange={setTeamDepartmentId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={rootDepartmentValue}>No department link</SelectItem>
                  {departments.map((department) => (
                    <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Description</FieldLabel>
              <Textarea value={teamDescription} onChange={(event) => setTeamDescription(event.target.value)} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setTeamOpen(false)}>Cancel</Button>
            <Button disabled={!teamName || submitting} onClick={saveTeam}>
              Save team
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
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                const action = confirmAction?.onConfirm;
                setConfirmAction(null);
                if (action) void action();
              }}
            >
              {confirmAction?.label ?? 'Confirm'}
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
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>{displayDate(member.joinedAt)}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button size="sm" disabled={!changed} onClick={() => void onSave(member, role, status)}>
            Save
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-2 text-destructive hover:text-destructive"
            onClick={() => onRemove(member)}
          >
            <Trash2 className="size-4" />
            Remove
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
              <StatusBadge tone="brand">{inheritedCount} inherited child scopes</StatusBadge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{department.description || 'No description yet.'}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="secondary" onClick={() => onEdit(department)}>Edit</Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-2 text-destructive hover:text-destructive"
              onClick={() => onDelete(department)}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {department.members.map((member) => (
            <StatusBadge key={member.userId} tone="neutral">
              {memberByUserId.get(member.userId)?.displayName || member.email} · {roleLabel(departmentRoles, member.role)}
            </StatusBadge>
          ))}
          {department.members.length === 0 && <span className="text-xs text-muted-foreground">No direct members</span>}
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
