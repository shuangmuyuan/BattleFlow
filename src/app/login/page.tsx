'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('login');
  const [nextPath, setNextPath] = useState('/dashboard');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [invitationToken, setInvitationToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setNextPath(readInitialSearchParam('next') || '/dashboard');
    const invite = readInitialSearchParam('invite');
    if (invite) {
      setInvitationToken(invite);
      setMode('register');
    }
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
      router.replace(data.redirectTo || '/dashboard');
      router.refresh();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Authentication failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!organizationName.trim() && !invitationToken.trim()) {
      setError('Organization name or invitation token is required');
      return;
    }

    setIsSubmitting(true);

    try {
      const data = await submitAuthRequest('/api/auth/register', {
        email,
        password,
        displayName,
        organizationName,
        invitationToken,
        next: nextPath,
      });
      router.replace(data.redirectTo || '/dashboard');
      router.refresh();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Registration failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div
            aria-label={APP_NAME}
            className="flex size-16 items-center justify-center rounded-xl bg-brand/15 text-brand"
          >
            <Swords className="size-8" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-foreground">{APP_NAME}</h1>
            <p className="text-sm text-muted-foreground">AI Native Product Planning Platform</p>
          </div>
        </div>

        <Card className="border-border bg-card">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg text-card-foreground">Workspace Access</CardTitle>
            <CardDescription className="text-muted-foreground">
              Sign in or create a workspace account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={mode} onValueChange={(value) => setMode(value as AuthMode)} className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-secondary">
                <TabsTrigger
                  value="login"
                  className="data-[state=active]:bg-brand data-[state=active]:text-brand-foreground"
                >
                  Sign In
                </TabsTrigger>
                <TabsTrigger
                  value="register"
                  className="data-[state=active]:bg-brand data-[state=active]:text-brand-foreground"
                >
                  Register
                </TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-4">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email" className="text-card-foreground">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      className="border-border bg-secondary text-card-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password" className="text-card-foreground">Password</Label>
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        placeholder="Enter password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                        className="border-border bg-secondary pr-10 text-card-foreground placeholder:text-muted-foreground"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        title={showPassword ? 'Hide password' : 'Show password'}
                        onClick={() => setShowPassword((value) => !value)}
                        className="absolute right-1 top-1/2 size-8 -translate-y-1/2 text-muted-foreground hover:bg-transparent hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </Button>
                    </div>
                  </div>
                  {error && mode === 'login' && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" className="w-full bg-brand text-brand-foreground hover:bg-brand/90" disabled={isSubmitting}>
                    {isSubmitting && mode === 'login' ? 'Signing in...' : 'Sign In'}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register" className="mt-4">
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="register-email" className="text-card-foreground">Email</Label>
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
                  <div className="space-y-2">
                    <Label htmlFor="display-name" className="text-card-foreground">Display Name</Label>
                    <Input
                      id="display-name"
                      type="text"
                      autoComplete="name"
                      placeholder="Your name"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      className="border-border bg-secondary text-card-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="organization-name" className="text-card-foreground">Organization Name</Label>
                    <Input
                      id="organization-name"
                      type="text"
                      autoComplete="organization"
                      placeholder="New organization"
                      value={organizationName}
                      onChange={(event) => setOrganizationName(event.target.value)}
                      className="border-border bg-secondary text-card-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invitation-token" className="text-card-foreground">Invitation Token</Label>
                    <Input
                      id="invitation-token"
                      type="text"
                      placeholder="Paste invitation token"
                      value={invitationToken}
                      onChange={(event) => setInvitationToken(event.target.value)}
                      className="border-border bg-secondary text-card-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-password" className="text-card-foreground">Password</Label>
                    <Input
                      id="register-password"
                      type="password"
                      autoComplete="new-password"
                      placeholder="At least 8 characters"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      className="border-border bg-secondary text-card-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password" className="text-card-foreground">Confirm Password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      autoComplete="new-password"
                      placeholder="Repeat password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      required
                      className="border-border bg-secondary text-card-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                  {error && mode === 'register' && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" className="w-full bg-brand text-brand-foreground hover:bg-brand/90" disabled={isSubmitting}>
                    {isSubmitting && mode === 'register' ? 'Creating account...' : 'Create Account'}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
