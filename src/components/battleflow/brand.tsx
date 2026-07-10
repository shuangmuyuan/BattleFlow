import { Swords } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BattleFlowBrand({
  className,
  markClassName,
  showName = true,
  subtitle,
}: {
  className?: string;
  markClassName?: string;
  showName?: boolean;
  subtitle?: string;
}) {
  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      <span
        aria-hidden="true"
        className={cn(
          'relative flex size-10 shrink-0 items-center justify-center rounded-md border border-brand/30 bg-brand/12 text-brand shadow-sm shadow-brand/10',
          markClassName,
        )}
      >
        <span className="absolute left-1 top-1 size-1.5 rounded-[2px] bg-info" />
        <Swords className="size-5" />
      </span>
      {showName && (
        <span className="min-w-0">
          <span className="block truncate text-lg font-semibold text-foreground">BattleFlow</span>
          {subtitle && (
            <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
          )}
        </span>
      )}
    </div>
  );
}
