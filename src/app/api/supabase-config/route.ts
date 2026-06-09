import { NextResponse } from 'next/server';
import { getSupabaseCredentials } from '@/storage/database/supabase-client';

export async function GET() {
  try {
    const { url, anonKey } = getSupabaseCredentials();

    if (!url || !anonKey) {
      return NextResponse.json({
        configured: false,
        error: 'Supabase credentials not configured',
      });
    }

    return NextResponse.json({ configured: true, url, anonKey });
  } catch (error) {
    return NextResponse.json({
      configured: false,
      error: error instanceof Error ? error.message : 'Failed to get Supabase config',
    });
  }
}
