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

export const appSurfaceClassName =
  'border-border/60 bg-card/95 shadow-sm shadow-foreground/5';

export const appCardClassName =
  'min-w-0 border-border/60 bg-card/95 shadow-sm shadow-foreground/5 transition-[border-color,box-shadow] hover:border-brand/25 hover:shadow-md hover:shadow-foreground/10';

export function PageHeader({
  title,
  description,
  action,
  meta,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-4 border-b border-border/60 bg-background/95 p-4 sm:flex-row sm:items-center sm:justify-between md:p-6">
      <div className="min-w-0">
        {meta && <div className="mb-2 flex flex-wrap items-center gap-2">{meta}</div>}
        <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
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
    <Empty className={cn('min-h-72 border border-border/60 bg-card/70', className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-brand/10 text-brand">
          {icon}
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
