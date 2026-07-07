import { NextResponse } from 'next/server';
import { checkClaudeAgentSdkRuntime } from '@/lib/agent-adapters/claude-agent-sdk';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const claudeAgentSdk = await checkClaudeAgentSdkRuntime();

  return NextResponse.json(
    {
      default_provider: process.env.CHAT_AGENT_PROVIDER || 'claude-agent-sdk',
      adapters: [claudeAgentSdk],
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
