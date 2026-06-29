import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils';

function AnimatedShinyText({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      data-slot="animated-shiny-text"
      className={cn(
        'inline-flex bg-[linear-gradient(110deg,var(--muted-foreground)_0%,var(--muted-foreground)_38%,var(--foreground)_50%,var(--muted-foreground)_62%,var(--muted-foreground)_100%)] bg-[length:250%_100%] bg-clip-text text-transparent motion-safe:animate-[battleflow-shiny-text_2.2s_linear_infinite] motion-reduce:bg-none motion-reduce:text-muted-foreground',
        className,
      )}
      {...props}
    >
      {children}
      <style>
        {`
          @keyframes battleflow-shiny-text {
            0% {
              background-position: 200% center;
            }
            100% {
              background-position: -200% center;
            }
          }
        `}
      </style>
    </span>
  );
}

export { AnimatedShinyText };
