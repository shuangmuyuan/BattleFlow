import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface BentoGridProps extends ComponentPropsWithoutRef<'div'> {
  children: ReactNode;
}

interface BentoCardProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  Icon?: ElementType<{ className?: string }>;
  name?: ReactNode;
  description?: ReactNode;
  href?: string;
  cta?: ReactNode;
  background?: ReactNode;
  actions?: ReactNode;
  contentClassName?: string;
  actionsClassName?: string;
}

export function BentoGrid({ className, children, ...props }: BentoGridProps) {
  return (
    <div
      className={cn('grid w-full auto-rows-[22rem] grid-cols-3 gap-4', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function BentoCard({
  Icon,
  name,
  description,
  href,
  cta,
  background,
  actions,
  className,
  contentClassName,
  actionsClassName,
  children,
  ...props
}: BentoCardProps) {
  const actionContent = actions || (href && cta ? (
    <Button variant="link" asChild size="sm" className="pointer-events-auto h-auto p-0 text-sm">
      <a href={href}>
        {cta}
        <ArrowRight className="ms-2 h-4 w-4 rtl:rotate-180" />
      </a>
    </Button>
  ) : null);

  const card = (
    <div
      data-bento-card
      className={cn(
        'group relative col-span-3 flex min-w-0 flex-col justify-between overflow-hidden rounded-xl',
        'border border-border/60 bg-background shadow-sm shadow-foreground/5',
        'transform-gpu transition-all duration-300 hover:border-brand/35 hover:shadow-md hover:shadow-foreground/10 focus-within:border-brand/35 focus-within:shadow-md focus-within:shadow-foreground/10',
        'dark:bg-background dark:[box-shadow:0_-20px_80px_-20px_#ffffff1f_inset]',
        className,
      )}
      {...props}
    >
      {background && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          {background}
        </div>
      )}
      <div className="relative z-10 flex h-full flex-col p-4">
        <div
          data-bento-content
          className={cn(
            'pointer-events-none z-10 flex h-full min-h-0 transform-gpu flex-col gap-1 transition-all duration-300 ease-out lg:group-hover:-translate-y-10 lg:group-focus-within:-translate-y-10',
            contentClassName,
          )}
        >
          {(Icon || name || description) && (
            <div className="flex min-w-0 items-start gap-3">
              {Icon && (
                <Icon className="mt-0.5 h-12 w-12 shrink-0 origin-left transform-gpu text-neutral-700 transition-all duration-300 ease-in-out group-hover:scale-75 dark:text-neutral-300" />
              )}
              <div className="min-w-0">
                {name && (
                  <h3 className="truncate text-xl font-semibold text-neutral-700 dark:text-neutral-300">
                    {name}
                  </h3>
                )}
                {description && (
                  <p className="mt-1 line-clamp-2 max-w-lg text-sm text-neutral-400">
                    {description}
                  </p>
                )}
              </div>
            </div>
          )}
          {children}
        </div>

        {actionContent && (
          <div
            data-bento-actions-mobile
            className={cn(
              'pointer-events-none mt-3 flex w-full translate-y-0 transform-gpu flex-row items-center transition-all duration-300 lg:hidden',
              actionsClassName,
            )}
          >
            <div className="pointer-events-auto w-full">{actionContent}</div>
          </div>
        )}
      </div>

      {actionContent && (
        <div
          data-bento-actions
          className={cn(
            'pointer-events-none absolute bottom-0 z-20 hidden w-full translate-y-10 transform-gpu flex-row items-center p-4 opacity-0 transition-all duration-300 ease-out group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 lg:flex',
            actionsClassName,
          )}
        >
          <div className="pointer-events-auto w-full">{actionContent}</div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 transform-gpu transition-all duration-300 group-hover:bg-black/[0.03] group-focus-within:bg-black/[0.03] dark:group-hover:bg-neutral-800/10 dark:group-focus-within:bg-neutral-800/10" />
    </div>
  );

  if (href && !actions) {
    return (
      <a href={href} className="block min-w-0">
        {card}
      </a>
    );
  }

  return card;
}
