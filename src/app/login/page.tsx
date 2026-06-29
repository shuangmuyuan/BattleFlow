'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Eye, EyeOff, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { KineticText } from '@/registry/magicui/kinetic-text';

const APP_NAME = 'BattleFlow';

type AuthMode = 'login' | 'register';

interface AuthResponse {
  redirectTo?: string;
  error?: string;
}

function readInitialSearchParam(name: string): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return new URLSearchParams(window.location.search).get(name) || '';
}

function normalizePostLoginPath(path: string): string {
  if (!path) {
    return '/dashboard';
  }

  if (
    path === '/dashboard/workflows' ||
    path.startsWith('/dashboard/workflows?') ||
    path.startsWith('/dashboard/workflows/')
  ) {
    return '/dashboard';
  }

  if (path === '/onboarding' || path.startsWith('/dashboard')) {
    return path;
  }

  return '/dashboard';
}

function buildSsoLoginHref(nextPath: string): string {
  const params = new URLSearchParams({
    redirect: '1',
    next: nextPath,
  });
  return `/api/auth/sso/login?${params.toString()}`;
}

async function submitAuthRequest(endpoint: string, payload: Record<string, string>): Promise<AuthResponse> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json() as AuthResponse;

  if (!response.ok) {
    throw new Error(data.error || 'Authentication failed');
  }

  return data;
}

function authErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;
  switch (message) {
    case 'Authentication failed':
      return '认证失败，请稍后重试';
    case 'Email and password are required':
    case 'Account and password are required':
      return '请输入邮箱或用户名和密码';
    case 'Invalid email or password':
      return '邮箱或用户名、密码不正确';
    case 'Password must be at least 8 characters':
      return '密码至少需要 8 个字符';
    case 'Organization name is required':
      return '请输入组织名称';
    case 'Unable to create account':
      return '无法创建账号，请确认邮箱是否已注册';
    case 'Registration failed':
      return '注册失败，请稍后重试';
    default:
      return message || fallback;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('login');
  const [nextPath, setNextPath] = useState('/dashboard');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setNextPath(normalizePostLoginPath(readInitialSearchParam('next')));
  }, []);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const data = await submitAuthRequest('/api/auth/login', {
        email,
        password,
        next: nextPath,
      });
      router.replace(normalizePostLoginPath(data.redirectTo || '/dashboard'));
      router.refresh();
    } catch (authError) {
      setError(authErrorMessage(authError, '认证失败，请稍后重试'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    if (!organizationName.trim()) {
      setError('请输入组织名称');
      return;
    }

    setIsSubmitting(true);

    try {
      const data = await submitAuthRequest('/api/auth/register', {
        email,
        password,
        displayName,
        organizationName,
        next: nextPath,
      });
      router.replace(normalizePostLoginPath(data.redirectTo || '/dashboard'));
      router.refresh();
    } catch (authError) {
      setError(authErrorMessage(authError, '注册失败，请稍后重试'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-dvh overflow-y-auto bg-background px-4 py-4 md:px-6 [@media_(min-height:760px)]:flex [@media_(min-height:760px)]:items-center [@media_(min-height:760px)]:justify-center [@media_(min-height:760px)]:py-8">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 [@media_(min-height:760px)]:gap-6">
        <div className="flex flex-col items-center gap-3 text-center [@media_(min-height:760px)]:gap-4">
          <div
            aria-label={APP_NAME}
            className="flex size-12 items-center justify-center rounded-xl bg-brand/15 text-brand [@media_(min-height:760px)]:size-16"
          >
            <Swords className="size-6 [@media_(min-height:760px)]:size-8" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-foreground">
              <KineticText text={APP_NAME} />
            </h1>
            <p className="text-sm text-muted-foreground">AI 原生产品规划平台</p>
          </div>
        </div>

        <Card className="border-border bg-card">
          <CardHeader className="pb-3 [@media_(min-height:760px)]:pb-4">
            <CardTitle className="text-lg text-card-foreground">账号登录</CardTitle>
            <CardDescription className="text-muted-foreground">
              登录或创建你的工作区账号
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-4 [@media_(min-height:760px)]:pb-6">
            <Tabs value={mode} onValueChange={(value) => setMode(value as AuthMode)} className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-secondary">
                <TabsTrigger
                  value="login"
                  className="data-[state=active]:bg-brand data-[state=active]:text-brand-foreground"
                >
                  登录
                </TabsTrigger>
                <TabsTrigger
                  value="register"
                  className="data-[state=active]:bg-brand data-[state=active]:text-brand-foreground"
                >
                  注册
                </TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-3 [@media_(min-height:760px)]:mt-4">
                <form onSubmit={handleLogin} className="space-y-3 [@media_(min-height:760px)]:space-y-4">
                  <div className="space-y-1.5 [@media_(min-height:760px)]:space-y-2">
                    <Label htmlFor="login-email" className="text-card-foreground">邮箱或用户名</Label>
                    <Input
                      id="login-email"
                      type="text"
                      autoComplete="username"
                      placeholder="you@example.com / superadmin"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      className="border-border bg-secondary text-card-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                  <div className="space-y-1.5 [@media_(min-height:760px)]:space-y-2">
                    <Label htmlFor="login-password" className="text-card-foreground">密码</Label>
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        placeholder="输入密码"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                        className="border-border bg-secondary pr-10 text-card-foreground placeholder:text-muted-foreground"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={showPassword ? '隐藏密码' : '显示密码'}
                        title={showPassword ? '隐藏密码' : '显示密码'}
                        onClick={() => setShowPassword((value) => !value)}
                        className="absolute right-1 top-1/2 size-8 -translate-y-1/2 text-muted-foreground hover:bg-transparent hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </Button>
                    </div>
                  </div>
                  {error && mode === 'login' && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" className="w-full bg-brand text-brand-foreground hover:bg-brand/90" disabled={isSubmitting}>
                    {isSubmitting && mode === 'login' ? '登录中...' : '登录'}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register" className="mt-3 [@media_(min-height:760px)]:mt-4">
                <form onSubmit={handleRegister} className="space-y-3 [@media_(min-height:760px)]:space-y-4">
                  <div className="space-y-1.5 [@media_(min-height:760px)]:space-y-2">
                    <Label htmlFor="register-email" className="text-card-foreground">邮箱</Label>
                    <Input
                      id="register-email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      className="border-border bg-secondary text-card-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                  <div className="space-y-1.5 [@media_(min-height:760px)]:space-y-2">
                    <Label htmlFor="display-name" className="text-card-foreground">显示名称</Label>
                    <Input
                      id="display-name"
                      type="text"
                      autoComplete="name"
                      placeholder="你的名字"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      className="border-border bg-secondary text-card-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                  <div className="space-y-1.5 [@media_(min-height:760px)]:space-y-2">
                    <Label htmlFor="organization-name" className="text-card-foreground">组织名称</Label>
                    <Input
                      id="organization-name"
                      type="text"
                      autoComplete="organization"
                      placeholder="新组织名称"
                      value={organizationName}
                      onChange={(event) => setOrganizationName(event.target.value)}
                      required
                      className="border-border bg-secondary text-card-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                  <div className="space-y-1.5 [@media_(min-height:760px)]:space-y-2">
                    <Label htmlFor="register-password" className="text-card-foreground">密码</Label>
                    <Input
                      id="register-password"
                      type="password"
                      autoComplete="new-password"
                      placeholder="至少 8 个字符"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      className="border-border bg-secondary text-card-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                  <div className="space-y-1.5 [@media_(min-height:760px)]:space-y-2">
                    <Label htmlFor="confirm-password" className="text-card-foreground">确认密码</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      autoComplete="new-password"
                      placeholder="再次输入密码"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      required
                      className="border-border bg-secondary text-card-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                  {error && mode === 'register' && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" className="w-full bg-brand text-brand-foreground hover:bg-brand/90" disabled={isSubmitting}>
                    {isSubmitting && mode === 'register' ? '创建中...' : '创建账号'}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">或</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <Button
              asChild
              variant="outline"
              className="w-full border-border bg-secondary text-card-foreground hover:bg-secondary/80"
            >
              <a href={buildSsoLoginHref(nextPath)}>
                <Building2 className="h-4 w-4" />
                使用企业账户登录
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
