'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSupabaseConfig } from '@/lib/supabase-config-inject';
import { getSupabaseBrowserClientWithRetry } from '@/lib/supabase-browser';
import type { User } from '@supabase/supabase-js';
import {
  FileCode2,
  Database,
  LogOut,
  ChevronLeft,
  ChevronRight,
  User as UserIcon,
  LayoutDashboard,
  Play,
  Rocket,
  Sun,
  Moon,
  Swords,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/use-theme';
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

const navItems = [
  { href: '/dashboard', label: '工作台', icon: LayoutDashboard },
  { href: '/dashboard/skills', label: 'Skill 仓库', icon: FileCode2 },
  { href: '/dashboard/workflows', label: '工作流', icon: Play },
  { href: '/dashboard/knowledge', label: '知识库', icon: Database },
  { href: '/dashboard/demos', label: 'Demo 生成', icon: Rocket },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { config, isLoading: configLoading, error: configError } = useSupabaseConfig();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    async function loadUser() {
      try {
        const supabase = await getSupabaseBrowserClientWithRetry();
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser) {
          setUser(currentUser);
        }
      } catch {
        // Auth not available - continue without user
      }
      setAuthChecked(true);
    }

    if (!configLoading && config) {
      loadUser();
    } else if (!configLoading && !config) {
      // No Supabase config available - skip auth
      setAuthChecked(true);
    }
  }, [configLoading, config]);

  const handleLogout = async () => {
    try {
      const supabase = await getSupabaseBrowserClientWithRetry();
      await supabase.auth.signOut();
      setUser(null);
    } catch (err) {
      console.error('Logout error:', err);
    }
    setShowLogoutDialog(false);
  };

  // Only show loading while config is being fetched
  if (configLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen min-w-0 overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={`${
          collapsed ? 'w-16' : 'w-60'
        } hidden h-screen shrink-0 flex-col border-r border-border bg-sidebar transition-all duration-200 md:flex`}
      >
        {/* Logo area */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-border">
          <div className={`flex items-center gap-2 ${collapsed ? 'hidden' : ''}`}>
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/15 text-brand">
              <Swords className="h-4 w-4" />
            </span>
            <span className="text-lg font-semibold text-brand">BattleFlow</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className="text-muted-foreground hover:text-foreground hover:bg-secondary"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex flex-1 flex-col gap-1 px-2 py-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Button
                key={item.href}
                variant="ghost"
                className={`w-full justify-start gap-3 ${
                  isActive
                    ? 'bg-brand/10 text-brand hover:bg-brand/15 hover:text-brand'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                } ${collapsed ? 'px-0 justify-center' : ''}`}
                onClick={() => router.push(item.href)}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Button>
            );
          })}
        </nav>

        {/* Theme toggle */}
        <div className="px-2 pb-2">
          <Button
            variant="ghost"
            className={`w-full justify-start gap-3 text-muted-foreground hover:text-foreground hover:bg-secondary ${
              collapsed ? 'px-0 justify-center' : ''
            }`}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4 shrink-0" />
            ) : (
              <Moon className="h-4 w-4 shrink-0" />
            )}
            {!collapsed && (
              <span className="text-sm">{theme === 'dark' ? '浅色模式' : '深色模式'}</span>
            )}
          </Button>
        </div>

        {/* User area */}
        <div className="p-2 border-t border-border">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={`w-full justify-start gap-3 text-muted-foreground hover:text-foreground hover:bg-secondary ${
                    collapsed ? 'px-0 justify-center' : ''
                  }`}
                >
                  <div className="h-7 w-7 rounded-full bg-brand/20 flex items-center justify-center shrink-0">
                    <UserIcon className="h-3.5 w-3.5 text-brand" />
                  </div>
                  {!collapsed && (
                    <span className="text-sm truncate">{user.email}</span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-card border-border">
                <DropdownMenuItem className="text-muted-foreground">
                  <UserIcon className="mr-2 h-4 w-4" />
                  {user.email}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive cursor-pointer"
                  onClick={() => setShowLogoutDialog(true)}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              variant="ghost"
              className={`w-full justify-start gap-3 text-muted-foreground hover:text-foreground hover:bg-secondary ${
                collapsed ? 'px-0 justify-center' : ''
              }`}
              onClick={() => router.push('/login')}
            >
              <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
                <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              {!collapsed && <span className="text-sm">Sign In</span>}
            </Button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex h-screen min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/50 px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand/15 text-brand md:hidden">
              <Swords className="size-4" />
            </span>
            <span className="truncate text-sm text-muted-foreground">
            {pathname === '/dashboard' && '工作台'}
            {pathname === '/dashboard/skills' && 'Skill 仓库'}
            {pathname === '/dashboard/workflows' && '工作流'}
            {pathname === '/dashboard/knowledge' && '知识库'}
            {pathname.includes('/dashboard/workflows/') && pathname !== '/dashboard/workflows' && '工作流详情'}
            {pathname.includes('/dashboard/skills/') && pathname !== '/dashboard/skills' && 'Skill 详情'}
            </span>
          </div>
        </div>

        <div className="shrink-0 border-b border-border bg-card/30 md:hidden">
          <div className="flex gap-2 overflow-x-auto px-3 py-2">
            {navItems.map((item) => {
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

        <div className="min-h-0 min-w-0 flex-1 overflow-hidden p-3 md:p-6">
          {children}
        </div>
      </main>

      {/* Logout confirmation dialog */}
      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-card-foreground">Confirm Sign Out</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Are you sure you want to sign out? You will need to sign in again to access your workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-secondary text-secondary-foreground border-border hover:bg-secondary/80">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={handleLogout}>
              Sign Out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
