import { NextResponse } from 'next/server';
import { checkClaudeCodeCliRuntime } from '@/lib/agent-adapters/claude-code-cli';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const claudeCodeCli = await checkClaudeCodeCliRuntime();

  return NextResponse.json(
    {
      default_provider: process.env.CHAT_AGENT_PROVIDER || 'claude-code-cli',
      adapters: [claudeCodeCli],
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
