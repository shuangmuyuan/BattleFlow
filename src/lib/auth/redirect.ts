const DEFAULT_AUTH_REDIRECT = '/dashboard';

export function safeRedirectPath(value: string | null | undefined, fallback = DEFAULT_AUTH_REDIRECT): string {
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return fallback;
  }

  if (trimmed.includes('\\') || trimmed.includes('\u0000')) {
    return fallback;
  }

  return trimmed;
}
