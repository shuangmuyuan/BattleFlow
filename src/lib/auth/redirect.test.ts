import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from './redirect';

describe('safeRedirectPath', () => {
  it('allows local absolute paths', () => {
    expect(safeRedirectPath('/dashboard?tab=skills')).toBe('/dashboard?tab=skills');
  });

  it('rejects open redirects', () => {
    expect(safeRedirectPath('https://example.com')).toBe('/dashboard');
    expect(safeRedirectPath('//example.com')).toBe('/dashboard');
    expect(safeRedirectPath('\\\\example.com')).toBe('/dashboard');
  });
});
