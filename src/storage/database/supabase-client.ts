import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

let envLoaded = false;

interface SupabaseCredentials {
  url: string;
  anonKey: string;
}

function loadEnv(): void {
  if (envLoaded || (process.env.BATTLEFLOW_SUPABASE_URL && process.env.BATTLEFLOW_SUPABASE_ANON_KEY)) {
    return;
  }

  try {
    dotenv.config();
  } catch {
    // dotenv is optional; deployment environments can provide variables directly.
  }

  envLoaded = true;
}

function getSupabaseCredentials(): SupabaseCredentials {
  loadEnv();

  const url = process.env.BATTLEFLOW_SUPABASE_URL;
  const anonKey = process.env.BATTLEFLOW_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error('BATTLEFLOW_SUPABASE_URL is not set');
  }
  if (!anonKey) {
    throw new Error('BATTLEFLOW_SUPABASE_ANON_KEY is not set');
  }

  return { url, anonKey };
}

function getSupabaseServiceRoleKey(): string | undefined {
  loadEnv();
  return process.env.BATTLEFLOW_SUPABASE_SERVICE_ROLE_KEY;
}

function getSupabaseClient(token?: string): SupabaseClient {
  const { url, anonKey } = getSupabaseCredentials();

  let key: string;
  if (token) {
    key = anonKey;
  } else {
    const serviceRoleKey = getSupabaseServiceRoleKey();
    key = serviceRoleKey ?? anonKey;
  }

  const globalOptions: {
    headers?: Record<string, string>;
    fetch?: typeof fetch;
  } = {};
  if (token) {
    globalOptions.headers = { Authorization: `Bearer ${token}` };
  }
  return createClient(url, key, {
    global: globalOptions,
    db: {
      timeout: 60000,
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export { loadEnv, getSupabaseCredentials, getSupabaseServiceRoleKey, getSupabaseClient };
