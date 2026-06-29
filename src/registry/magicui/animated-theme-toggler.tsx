'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';

interface AnimatedThemeTogglerProps {
  variant?: 'square' | 'default';
  className?: string;
}

export function AnimatedThemeToggler({
  variant = 'default',
  className,
}: AnimatedThemeTogglerProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      aria-label={isDark ? '切换到浅色模式' : '切换到深色模式'}
      title={isDark ? '切换到浅色模式' : '切换到深色模式'}
      onClick={toggleTheme}
      className={cn(
        'group relative inline-flex shrink-0 items-center justify-center overflow-hidden border border-border bg-secondary text-muted-foreground shadow-xs transition-all duration-300 hover:bg-secondary/80 hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
        variant === 'square' ? 'size-9 rounded-md' : 'h-9 w-10 rounded-full',
        className,
      )}
    >
      <Sun
        className={cn(
          'absolute size-4 transition-all duration-300 ease-out',
          isDark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0',
        )}
      />
      <Moon
        className={cn(
          'absolute size-4 transition-all duration-300 ease-out',
          isDark ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100',
        )}
      />
      <span className="sr-only">{isDark ? '切换到浅色模式' : '切换到深色模式'}</span>
    </button>
  );
}
