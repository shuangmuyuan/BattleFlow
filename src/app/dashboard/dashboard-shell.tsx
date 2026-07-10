'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Bell,
  Building2,
  CheckCheck,
  ChevronLeft,
  CircleHelp,
  Database,
  FileCode2,
  LayoutDashboard,
  Loader2,
  LogOut,
  Play,
  Rocket,
  Shield,
  User as UserIcon,
} from 'lucide-react';
import { BattleFlowBrand } from '@/components/battleflow/brand';
import { Button } from '@/components/ui/button';
import { AnimatedThemeToggler } from '@/registry/magicui/animated-theme-toggler';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  role: string;
  status: string;
}

interface DashboardAuthState {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
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
  organizations: OrganizationSummary[];
}

interface OnlinePresenceResponse {
  onlineCount?: unknown;
}

interface DashboardNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationsResponse {
  notifications?: DashboardNotification[];
  unreadCount?: unknown;
}

const navItems = [
  { href: '/dashboard', label: '工作台', icon: LayoutDashboard },
  { href: '/dashboard/skills', label: 'Skill 仓库', icon: FileCode2 },
  { href: '/dashboard/workflows', label: '工作流', icon: Play },
  { href: '/dashboard/knowledge', label: '知识库', icon: Database },
  { href: '/dashboard/demos', label: 'Demo 生成', icon: Rocket },
  { href: '/dashboard/help', label: '使用说明', icon: CircleHelp },
  { href: '/dashboard/admin', label: '管理', icon: Shield, requiresAdmin: true },
];

const workflowRouteChangeEventName = 'battleflow:workflow-route-change';

function getWorkflowDetailIdFromLocation() {
  if (window.location.pathname !== '/dashboard/workflows') return '';
  return new URLSearchParams(window.location.search).get('workflowId') || '';
}

function dashboardTitle(pathname: string): string {
  if (pathname === '/dashboard') return '工作台';
  if (pathname === '/dashboard/skills') return 'Skill 仓库';
  if (pathname === '/dashboard/workflows') return '工作流';
  if (pathname === '/dashboard/knowledge') return '知识库';
  if (pathname === '/dashboard/demos') return 'Demo 生成';
  if (pathname === '/dashboard/help') return '使用说明';
  if (pathname === '/dashboard/admin') return '管理';
  if (pathname.includes('/dashboard/workflows/')) return '工作流详情';
  if (pathname.includes('/dashboard/skills/')) return 'Skill 详情';
  return 'BattleFlow';
}

function loginPathFor(pathname: string): string {
  return `/login?next=${encodeURIComponent(pathname || '/dashboard')}`;
}

function currentPathForRedirect(pathname: string): string {
  const search = window.location.search;
  return search ? `${pathname}${search}` : pathname;
}

function normalizeOnlineCount(value: unknown): number {
  const count = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(count) ? Math.max(1, count) : 1;
}

function normalizeUnreadCount(value: unknown): number {
  const count = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

function canAccessAdmin(authState: DashboardAuthState | null): boolean {
  return Boolean(
    authState?.isSuperAdmin
    || authState?.capabilities.manageOrganization
    || authState?.capabilities.managePlatformAdmins
    || authState?.capabilities.viewPlatformUsers,
  );
}

function formatNotificationTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function OnlinePresenceIndicator({ count }: { count: number }) {
  const onlineCount = normalizeOnlineCount(count);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`当前在线 ${onlineCount} 人`}
          className="group inline-flex h-8 shrink-0 items-center gap-2 rounded-full border border-border/60 bg-secondary/70 px-3 text-sm font-medium text-muted-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-secondary hover:text-foreground hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9"
        >
          <span className="relative flex size-2.5" aria-hidden="true">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-40" />
            <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" />
          </span>
          <span className="tabular-nums">{onlineCount}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="end"
        sideOffset={8}
        className="rounded-xl px-3 py-2 text-sm font-medium shadow-lg"
      >
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          <span className="size-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
          当前在线 {onlineCount} 人
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

function NotificationMenu({
  notifications,
  unreadCount,
  onMarkAllRead,
  onMarkRead,
}: {
  notifications: DashboardNotification[];
  unreadCount: number;
  onMarkAllRead: () => void;
  onMarkRead: (id: string) => void;
}) {
  const unreadLabel = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={unreadCount > 0 ? `通知，${unreadCount} 条未读` : '通知'}
          className="relative size-8 text-muted-foreground hover:bg-secondary hover:text-foreground md:size-9"
        >
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground">
              {unreadLabel}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-80 border-border bg-card p-0 shadow-xl md:w-96">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <span className="text-sm font-semibold text-card-foreground">通知</span>
          {unreadCount > 0 && (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand transition-colors hover:bg-brand/10"
              onClick={(event) => {
                event.preventDefault();
                onMarkAllRead();
              }}
            >
              <CheckCheck className="size-3.5" />
              全部已读
            </button>
          )}
        </div>
        {notifications.length > 0 ? (
          <div className="max-h-96 overflow-y-auto p-2">
            {notifications.map((notification) => {
              const isUnread = !notification.readAt;
              return (
                <button
                  key={notification.id}
                  type="button"
                  className="flex w-full gap-3 rounded-md px-3 py-3 text-left transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={(event) => {
                    event.preventDefault();
                    if (isUnread) {
                      onMarkRead(notification.id);
                    }
                  }}
                >
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${
                      isUnread ? 'bg-brand ring-4 ring-brand/10' : 'bg-muted-foreground/30'
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${isUnread ? 'font-semibold text-card-foreground' : 'text-muted-foreground'}`}>
                      {notification.title}
                    </span>
                    {notification.body && (
                      <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                        {notification.body}
                      </span>
                    )}
                    <span className="mt-2 block text-xs text-muted-foreground/80">
                      {formatNotificationTime(notification.createdAt)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            暂无通知
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [authState, setAuthState] = useState<DashboardAuthState | null>(null);
  const [authError, setAuthError] = useState('');
  const [authChecked, setAuthChecked] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);
  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const manuallyExpandedWorkflowIdRef = useRef<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const loadNotifications = useCallback(async () => {
    const response = await fetch('/api/notifications', { cache: 'no-store' });
    const data = await response.json() as NotificationsResponse;

    if (!response.ok) {
      throw new Error('Unable to load notifications');
    }

    setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
    setUnreadNotificationCount(normalizeUnreadCount(data.unreadCount));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAuthState() {
      setAuthError('');
      const response = await fetch('/api/auth/me', { cache: 'no-store' });
      const currentPath = currentPathForRedirect(pathname);

      if (response.status === 401) {
        router.replace(loginPathFor(currentPath));
        return;
      }

      const data = await response.json() as DashboardAuthState & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || 'Unable to load account');
      }

      if (!data.organizations.length) {
        router.replace(`/onboarding?next=${encodeURIComponent(currentPath || '/dashboard')}`);
        return;
      }

      if ((pathname === '/dashboard/admin' || pathname.startsWith('/dashboard/admin/')) && !canAccessAdmin(data)) {
        router.replace('/dashboard');
        return;
      }

      if (!cancelled) {
        setAuthState(data);
        setAuthChecked(true);
      }
    }

    loadAuthState().catch((error) => {
      if (!cancelled) {
        setAuthError(error instanceof Error ? error.message : 'Unable to load account');
        setAuthChecked(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  useEffect(() => {
    if (!authState) return undefined;

    let cancelled = false;

    async function loadOnlinePresence() {
      try {
        const response = await fetch('/api/dashboard/online', { cache: 'no-store' });
        const data = await response.json() as OnlinePresenceResponse;

        if (!cancelled && response.ok) {
          setOnlineCount(normalizeOnlineCount(data.onlineCount));
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Unable to load online presence:', error);
          setOnlineCount(1);
        }
      }
    }

    void loadOnlinePresence();
    const intervalId = window.setInterval(loadOnlinePresence, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [authState]);

  useEffect(() => {
    if (!authState) return undefined;

    let cancelled = false;

    async function refreshNotifications() {
      try {
        if (!cancelled) {
          await loadNotifications();
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Unable to load notifications:', error);
        }
      }
    }

    void refreshNotifications();
    const intervalId = window.setInterval(refreshNotifications, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [authState, loadNotifications]);

  const collapseSidebarForWorkflowDetail = useCallback(() => {
    const workflowDetailId = getWorkflowDetailIdFromLocation();

    if (!workflowDetailId) {
      manuallyExpandedWorkflowIdRef.current = null;
      return;
    }

    if (manuallyExpandedWorkflowIdRef.current === workflowDetailId) return;
    setCollapsed(true);
  }, []);

  useEffect(() => {
    collapseSidebarForWorkflowDetail();
  }, [pathname, collapseSidebarForWorkflowDetail]);

  useEffect(() => {
    const intervalId = window.setInterval(collapseSidebarForWorkflowDetail, 250);
    window.addEventListener(workflowRouteChangeEventName, collapseSidebarForWorkflowDetail);
    window.addEventListener('popstate', collapseSidebarForWorkflowDetail);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener(workflowRouteChangeEventName, collapseSidebarForWorkflowDetail);
      window.removeEventListener('popstate', collapseSidebarForWorkflowDetail);
    };
  }, [collapseSidebarForWorkflowDetail]);

  const handleToggleSidebar = useCallback(() => {
    setCollapsed((current) => {
      const nextCollapsed = !current;
      manuallyExpandedWorkflowIdRef.current = nextCollapsed ? null : getWorkflowDetailIdFromLocation() || null;
      return nextCollapsed;
    });
  }, []);

  const visibleNavItems = useMemo(() => (
    navItems.filter((item) => !item.requiresAdmin || canAccessAdmin(authState))
  ), [authState]);

  const activeOrganization = authState?.organizations.find((organization) => (
    organization.id === authState.activeOrganizationId
  )) ?? authState?.organizations[0] ?? null;
  const currentUserLabel = authState?.user.displayName?.trim() || authState?.user.email || '';
  const shouldShowUserEmail = Boolean(
    authState?.user.displayName?.trim()
    && authState.user.displayName.trim() !== authState.user.email,
  );

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setShowLogoutDialog(false);
      setAuthState(null);
      router.replace('/login');
      router.refresh();
    }
  }

  async function handleMarkAllNotificationsRead() {
    try {
      const response = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_all_read' }),
      });
      const data = await response.json() as NotificationsResponse;

      if (!response.ok) {
        throw new Error('Unable to mark notifications as read');
      }

      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadNotificationCount(normalizeUnreadCount(data.unreadCount));
    } catch (error) {
      console.error('Unable to mark notifications as read:', error);
    }
  }

  async function handleMarkNotificationRead(notificationId: string) {
    setNotifications((current) => current.map((notification) => (
      notification.id === notificationId && !notification.readAt
        ? { ...notification, readAt: new Date().toISOString() }
        : notification
    )));
    setUnreadNotificationCount((current) => Math.max(0, current - 1));

    try {
      const response = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_read', ids: [notificationId] }),
      });
      const data = await response.json() as NotificationsResponse;

      if (!response.ok) {
        throw new Error('Unable to mark notification as read');
      }

      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadNotificationCount(normalizeUnreadCount(data.unreadCount));
    } catch (error) {
      console.error('Unable to mark notification as read:', error);
      void loadNotifications().catch((refreshError) => {
        console.error('Unable to refresh notifications:', refreshError);
      });
    }
  }

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-brand" />
          正在加载工作台
        </div>
      </div>
    );
  }

  if (authError || !authState || !activeOrganization) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="max-w-sm space-y-3 text-center">
          <p className="text-sm text-destructive">{authError || '账号上下文暂不可用'}</p>
          <Button variant="secondary" onClick={() => router.replace(loginPathFor(currentPathForRedirect(pathname)))}>
            返回登录
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh min-w-0 overflow-hidden bg-background">
      <aside
        className={`${
          collapsed ? 'w-16' : 'w-60'
        } hidden h-dvh min-h-0 shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 md:flex`}
      >
        <div className={`flex h-16 shrink-0 items-center border-b border-sidebar-border ${collapsed ? 'justify-center px-2' : 'justify-between gap-2 px-3'}`}>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="展开菜单"
                  onClick={handleToggleSidebar}
                  className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                >
                  <BattleFlowBrand showName={false} markClassName="size-9" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>展开菜单</TooltipContent>
            </Tooltip>
          ) : (
            <>
              <BattleFlowBrand
                className="min-w-0 flex-1"
                markClassName="size-9"
                subtitle={activeOrganization.name}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="收起菜单"
                onClick={handleToggleSidebar}
                className="text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <ChevronLeft className="size-4" />
              </Button>
            </>
          )}
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 py-3">
          {visibleNavItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            const navigationButton = (
              <Button
                variant="ghost"
                aria-current={isActive ? 'page' : undefined}
                className={`relative h-10 w-full justify-start gap-2.5 overflow-hidden px-2 ${
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm before:absolute before:bottom-2 before:left-0 before:top-2 before:w-0.5 before:rounded-full before:bg-brand hover:bg-sidebar-accent'
                    : 'text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground'
                } ${collapsed ? 'justify-center px-0' : ''}`}
                onClick={() => router.push(item.href)}
              >
                <span className={`flex size-7 shrink-0 items-center justify-center rounded-sm ${isActive ? 'bg-brand/12 text-brand' : 'text-muted-foreground'}`}>
                  <item.icon className="size-4" />
                </span>
                {!collapsed && <span className="truncate text-sm">{item.label}</span>}
              </Button>
            );

            if (!collapsed) {
              return <div key={item.href}>{navigationButton}</div>;
            }

            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{navigationButton}</TooltipTrigger>
                <TooltipContent side="right" sideOffset={10}>{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-sidebar-border p-2">
          {!collapsed && (
            <div className="mb-1 flex min-w-0 items-center gap-2 rounded-md px-2 py-2 text-xs text-muted-foreground">
              <Building2 className="size-3.5 shrink-0 text-info" />
              <span className="truncate">{activeOrganization.name}</span>
              <span className="ml-auto size-1.5 shrink-0 rounded-full bg-success" aria-label="组织在线" />
            </div>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className={`w-full justify-start gap-3 text-muted-foreground hover:bg-secondary hover:text-foreground ${
                  collapsed ? 'justify-center px-0' : ''
                }`}
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-brand/20 bg-brand/12">
                  <UserIcon className="h-3.5 w-3.5 text-brand" />
                </div>
                {!collapsed && (
                  <span className="truncate text-sm">{currentUserLabel}</span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 border-border bg-card">
              <DropdownMenuItem className="gap-2 text-muted-foreground">
                <UserIcon className="h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">{currentUserLabel}</p>
                  {shouldShowUserEmail && (
                    <p className="truncate text-xs text-muted-foreground">{authState.user.email}</p>
                  )}
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive"
                onClick={() => setShowLogoutDialog(true)}
              >
                <LogOut className="mr-2 h-4 w-4" />
                退出登录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <main className="flex h-dvh min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/70 bg-card/65 px-3 md:h-16 md:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <BattleFlowBrand showName={false} markClassName="size-8" className="md:hidden" />
            <div className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground">{dashboardTitle(pathname)}</span>
              <span className="hidden truncate text-xs text-muted-foreground sm:block">{activeOrganization.name}</span>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <NotificationMenu
              notifications={notifications}
              unreadCount={unreadNotificationCount}
              onMarkAllRead={handleMarkAllNotificationsRead}
              onMarkRead={handleMarkNotificationRead}
            />
            <OnlinePresenceIndicator count={onlineCount} />
            <AnimatedThemeToggler variant="square" className="size-8 md:size-9" />
            <Button
              variant="ghost"
              size="icon"
              aria-label="退出登录"
              className="text-muted-foreground hover:bg-secondary hover:text-foreground md:hidden"
              onClick={() => setShowLogoutDialog(true)}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>

        <div className="shrink-0 border-b border-border/70 bg-card/40 md:hidden">
          <div className="flex gap-2 overflow-x-auto px-3 py-2">
            {visibleNavItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
              return (
                <Button
                  key={item.href}
                  variant={isActive ? 'secondary' : 'ghost'}
                  size="sm"
                  className={`h-8 shrink-0 gap-2 ${isActive ? 'text-brand' : 'text-muted-foreground'}`}
                  onClick={() => router.push(item.href)}
                >
                  <item.icon className="size-4 shrink-0" />
                  <span className="text-xs">{item.label}</span>
                </Button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-hidden p-2.5 md:p-4">
          {children}
        </div>
      </main>

      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-card-foreground">确认退出登录</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              确定要退出当前账号吗？退出后需要重新登录才能访问工作空间。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border bg-secondary text-secondary-foreground hover:bg-secondary/80">
              取消
            </AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={handleLogout}>
              退出登录
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
