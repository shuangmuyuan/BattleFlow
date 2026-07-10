'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Loader2 } from 'lucide-react';
import { AuthShell } from '@/components/battleflow/auth-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface MeResponse {
  organizations?: Array<{ id: string }>;
  error?: string;
}

function readNextPath(): string {
  if (typeof window === 'undefined') {
    return '/dashboard';
  }

  const next = new URLSearchParams(window.location.search).get('next');
  return next?.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

export default function OnboardingPage() {
  const router = useRouter();
  const [organizationName, setOrganizationName] = useState('');
  const [nextPath, setNextPath] = useState('/dashboard');
  const [error, setError] = useState('');
  const [isChecking, setIsChecking] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const next = readNextPath();
    setNextPath(next);

    async function checkAccount() {
      const response = await fetch('/api/auth/me', { cache: 'no-store' });
      if (response.status === 401) {
        router.replace(`/login?next=${encodeURIComponent('/onboarding')}`);
        return;
      }

      const data = await response.json() as MeResponse;
      if (response.ok && data.organizations?.length) {
        router.replace(next);
        return;
      }

      setIsChecking(false);
    }

    checkAccount().catch(() => {
      setIsChecking(false);
      setError('无法加载账号状态');
    });
  }, [router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!organizationName.trim()) {
      setError('请输入组织名称');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/auth/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ organizationName }),
      });
      const data = await response.json() as MeResponse;

      if (!response.ok) {
        throw new Error(data.error || 'Unable to create organization');
      }

      router.replace(nextPath);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '创建组织失败，请稍后重试');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isChecking) {
    return (
      <AuthShell>
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-brand" />
          正在加载账号
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
        <Card className="border-border/80 bg-card/95 shadow-xl shadow-foreground/10">
          <CardHeader className="pb-4">
            <div className="mb-1 flex size-9 items-center justify-center rounded-md border border-brand/20 bg-brand/10 text-brand">
              <Building2 className="size-4" />
            </div>
            <CardTitle className="text-xl text-card-foreground">创建你的组织</CardTitle>
            <CardDescription className="text-muted-foreground">
              组织将承载团队的 Skill、工作流与知识资产。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="organization-name" className="text-card-foreground">组织名称</Label>
                <Input
                  id="organization-name"
                  type="text"
                  autoComplete="organization"
                  placeholder="例如：产品规划团队"
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  required
                  className="border-border bg-secondary text-card-foreground placeholder:text-muted-foreground"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full bg-brand text-brand-foreground hover:bg-brand/90" disabled={isSubmitting}>
                {isSubmitting ? '正在创建...' : '创建组织并进入工作台'}
              </Button>
            </form>
          </CardContent>
        </Card>
    </AuthShell>
  );
}
