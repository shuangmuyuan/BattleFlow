'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface SupabaseConfig {
  url: string;
  anonKey: string;
}

interface SupabaseConfigResponse {
  configured?: boolean;
  url?: string;
  anonKey?: string;
  error?: string;
}

interface SupabaseConfigContextType {
  config: SupabaseConfig | null;
  isLoading: boolean;
  error: string | null;
}

const SupabaseConfigContext = createContext<SupabaseConfigContextType>({
  config: null,
  isLoading: true,
  error: null,
});

export const SUPABASE_CONFIG_READY_EVENT = 'supabase-config-ready';

export function useSupabaseConfig() {
  return useContext(SupabaseConfigContext);
}

interface SupabaseConfigProviderProps {
  children: ReactNode;
}

export function SupabaseConfigProvider({ children }: SupabaseConfigProviderProps) {
  const [config, setConfig] = useState<SupabaseConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/supabase-config')
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data: SupabaseConfigResponse) => {
        if (data.configured === false) {
          setConfig(null);
          setError(data.error || null);
          return;
        }

        if (data.url && data.anonKey) {
          const config = { url: data.url, anonKey: data.anonKey };
          setConfig(config);
          (window as unknown as { __SUPABASE_CONFIG__: SupabaseConfig }).__SUPABASE_CONFIG__ = config;
          window.dispatchEvent(new CustomEvent(SUPABASE_CONFIG_READY_EVENT, { detail: config }));
        } else {
          throw new Error('Invalid config response');
        }
      })
      .catch((err) => {
        setError(err.message);
        console.warn('Supabase config unavailable:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  return (
    <SupabaseConfigContext.Provider value={{ config, isLoading, error }}>
      {children}
    </SupabaseConfigContext.Provider>
  );
}
