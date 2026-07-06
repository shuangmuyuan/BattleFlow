'use client';

import { CitationList, type SerializableCitation } from '@/components/tool-ui/citation';
import { cn } from '@/lib/utils';

interface SourceCitationListProps {
  id: string;
  citations: readonly SerializableCitation[];
  className?: string;
}

export function SourceCitationList({ id, citations, className }: SourceCitationListProps) {
  if (citations.length === 0) return null;

  return (
    <CitationList
      id={id}
      citations={Array.from(citations)}
      variant="stacked"
      className={cn('mt-1 self-start', className)}
    />
  );
}
