import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

interface KineticTextProps {
  text: string;
  className?: string;
}

export function KineticText({ text, className }: KineticTextProps) {
  return (
    <span aria-label={text} className={cn('inline-flex whitespace-pre leading-none', className)}>
      <span aria-hidden="true" className="inline-flex">
        {Array.from(text).map((character, index) => (
          <span
            key={`${character}-${index}`}
            className="inline-block will-change-transform"
            style={{
              '--kinetic-index': index,
              animation: 'battleflow-kinetic-text 720ms cubic-bezier(0.22, 1, 0.36, 1) both',
              animationDelay: `${index * 38}ms`,
            } as CSSProperties}
          >
            {character}
          </span>
        ))}
      </span>
      <style>
        {`
          @keyframes battleflow-kinetic-text {
            0% {
              opacity: 0;
              transform: translateY(0.36em) rotateX(-48deg) scale(0.94);
              filter: blur(5px);
            }
            58% {
              opacity: 1;
              transform: translateY(-0.08em) rotateX(8deg) scale(1.02);
              filter: blur(0);
            }
            100% {
              opacity: 1;
              transform: translateY(0) rotateX(0deg) scale(1);
              filter: blur(0);
            }
          }

          @media (prefers-reduced-motion: reduce) {
            [style*="battleflow-kinetic-text"] {
              animation: none !important;
            }
          }
        `}
      </style>
    </span>
  );
}
