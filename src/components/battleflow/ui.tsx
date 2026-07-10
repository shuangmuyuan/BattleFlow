import type { ReactNode } from 'react';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type StatusTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

const statusToneClassName: Record<StatusTone, string> = {
  neutral: 'border-border/70 bg-secondary/70 text-secondary-foreground',
  brand: 'border-brand/20 bg-brand/10 text-brand',
  success: 'border-success/20 bg-success/10 text-success',
  warning: 'border-warning/25 bg-warning/10 text-warning',
  danger: 'border-destructive/20 bg-destructive/10 text-destructive',
};

const statusToneDotClassName: Record<StatusTone, string> = {
  neutral: 'bg-muted-foreground/70',
  brand: 'bg-brand',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
};

export const appSurfaceClassName =
  'border-border/70 bg-card shadow-sm shadow-foreground/5';

export const appCardClassName =
  'min-w-0 border-border/70 bg-card shadow-sm shadow-foreground/5 transition-[transform,border-color,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-lg hover:shadow-foreground/10';

export const appPageClassName =
  'flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border/70 bg-background/80 shadow-sm shadow-foreground/5';

export function PageHeader({
  title,
  description,
  action,
  meta,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  meta?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="relative flex shrink-0 flex-col gap-4 border-b border-border/70 bg-card/45 px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-5 md:py-4">
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-md border border-brand/20 bg-brand/10 text-brand shadow-sm [&_svg]:size-5">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          {meta && <div className="mb-1.5 flex flex-wrap items-center gap-2">{meta}</div>}
          <h1 className="truncate text-xl font-semibold text-foreground md:text-2xl">
            {title}
          </h1>
          {description && (
            <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      {action && <div className="flex shrink-0 flex-col gap-2 sm:flex-row">{action}</div>}
    </div>
  );
}

export function StatusBadge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(statusToneClassName[tone], className)}>
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', statusToneDotClassName[tone])} />
      {children}
    </Badge>
  );
}

export function ProductEmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Empty className={cn('min-h-72 border border-border/70 bg-card/55', className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon" className="size-12 border border-brand/20 bg-brand/10 text-brand shadow-sm [&_svg]:size-5">
          <span className="flex size-8 items-center justify-center rounded-sm border border-brand/15 bg-background/60 [&_svg]:size-4">
            {icon}
          </span>
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action && (
        <EmptyContent>
          {action}
        </EmptyContent>
      )}
    </Empty>
  );
}

export function SectionTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
