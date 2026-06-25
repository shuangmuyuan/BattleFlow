'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Swords } from 'lucide-react';
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
      setError('Unable to load account state');
    });
  }, [router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!organizationName.trim()) {
      setError('Organization name is required');
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
      setError(submitError instanceof Error ? submitError.message : 'Unable to create organization');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isChecking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-4">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-16 items-center justify-center rounded-xl bg-brand/15 text-brand">
            <Swords className="size-8" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-foreground">BattleFlow</h1>
            <p className="text-sm text-muted-foreground">Create your organization</p>
          </div>
        </div>

        <Card className="border-border bg-card">
          <CardHeader className="pb-4">
            <div className="mb-1 flex size-9 items-center justify-center rounded-md bg-brand/10 text-brand">
              <Building2 className="size-4" />
            </div>
            <CardTitle className="text-lg text-card-foreground">Organization Setup</CardTitle>
            <CardDescription className="text-muted-foreground">
              This workspace will be owned by your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="organization-name" className="text-card-foreground">Organization Name</Label>
                <Input
                  id="organization-name"
                  type="text"
                  autoComplete="organization"
                  placeholder="Acme Product"
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  required
                  className="border-border bg-secondary text-card-foreground placeholder:text-muted-foreground"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full bg-brand text-brand-foreground hover:bg-brand/90" disabled={isSubmitting}>
                {isSubmitting ? 'Creating organization...' : 'Create Organization'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
