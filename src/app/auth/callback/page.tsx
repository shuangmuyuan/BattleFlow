'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState('正在完成企业账号登录...');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    if (!code || !state) {
      setMessage('缺少登录参数，请重新发起登录。');
      router.replace('/login');
      return;
    }

    async function completeLogin() {
      try {
        const response = await fetch('/api/auth/sso/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ code, state }),
        });
        const data = await response.json() as { error?: string; redirectTo?: string };
        if (!response.ok) throw new Error(data.error || '企业账号登录失败');
        router.replace(data.redirectTo || '/dashboard');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : '企业账号登录失败');
        setTimeout(() => router.replace('/login'), 1800);
      }
    }

    void completeLogin();
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {message}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={(
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在完成企业账号登录...
          </div>
        </div>
      )}
    >
      <CallbackContent />
    </Suspense>
  );
}
