import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const layoutContracts = [
  {
    name: 'Dashboard shell uses fixed viewport and internal scroll',
    file: 'src/app/dashboard/layout.tsx',
    requiredTokenSets: [
      ['h-dvh', 'min-w-0', 'overflow-hidden'],
      ['md:hidden'],
      ['md:flex'],
      ['overflow-x-auto'],
      ['h-dvh', 'min-h-0', 'min-w-0', 'flex-1', 'flex-col', 'overflow-hidden'],
      ['min-h-0', 'min-w-0', 'flex-1', 'overflow-hidden'],
      ['min-h-0', 'flex-1', 'overflow-y-auto'],
      ['shrink-0', 'border-t'],
    ],
  },
  {
    name: 'Workflow detail keeps desktop split view and bounded mobile stack',
    file: 'src/app/dashboard/workflows/page.tsx',
    requiredTokenSets: [
      ['flex', 'h-full', 'min-h-0', 'min-w-0', 'flex-col', 'overflow-auto', 'lg:flex-row', 'lg:overflow-hidden'],
      ['max-h-80', 'min-h-0', 'lg:max-h-none'],
      ['lg:max-h-none'],
      ['lg:w-80'],
      ['min-h-[70vh]', 'overflow-hidden', 'lg:min-h-0'],
      ['max-h-[32rem]', 'min-h-0', 'overflow-hidden', 'lg:h-full', 'lg:max-h-none'],
      ['<ScrollArea className="min-h-0 flex-1">'],
      ['sm:flex-row'],
    ],
  },
  {
    name: 'Workflow list contains workspace selector and workflow cards inside bounded scroll regions',
    file: 'src/app/dashboard/workflows/page.tsx',
    requiredTokenSets: [
      ['flex', 'h-full', 'min-h-0', 'flex-col'],
      ['max-h-[calc(100dvh-260px)]', 'overflow-y-auto'],
      ['min-h-0', 'flex-1', 'overflow-auto'],
      ['grid-cols-1', 'sm:grid-cols-2'],
    ],
  },
  {
    name: 'Dashboard overview owns internal scrolling',
    file: 'src/app/dashboard/page.tsx',
    requiredTokenSets: [
      ['h-full', 'min-h-0', 'overflow-auto'],
    ],
  },
  {
    name: 'Skill registry owns internal scrolling and mobile filters',
    file: 'src/app/dashboard/skills/page.tsx',
    requiredTokenSets: [
      ['flex', 'h-full', 'min-h-0', 'flex-col'],
      ['shrink-0', 'border-b'],
      ['min-h-0', 'flex-1', 'overflow-auto'],
      ['max-w-full', 'overflow-x-auto'],
    ],
  },
  {
    name: 'Knowledge base owns internal scrolling and responsive header',
    file: 'src/app/dashboard/knowledge/page.tsx',
    requiredTokenSets: [
      ['flex', 'h-full', 'min-h-0', 'flex-col'],
      ['shrink-0', 'border-b'],
      ['min-h-0', 'flex-1', 'overflow-auto'],
      ['flex-col', 'sm:flex-row'],
    ],
  },
  {
    name: 'Demo generator owns internal scrolling and responsive option grids',
    file: 'src/app/dashboard/demos/page.tsx',
    requiredTokenSets: [
      ['h-full', 'min-h-0', 'overflow-auto'],
      ['grid-cols-1', 'sm:grid-cols-3'],
      ['max-h-[calc(100dvh-2rem)]', 'overflow-hidden'],
    ],
  },
];

const failures = [];

for (const contract of layoutContracts) {
  const source = readFileSync(path.join(root, contract.file), 'utf8');
  for (const tokens of contract.requiredTokenSets) {
    const missingTokens = tokens.filter((token) => !source.includes(token));
    if (missingTokens.length > 0) {
      failures.push(`${contract.name} in ${contract.file} is missing token set [${tokens.join(', ')}]; missing [${missingTokens.join(', ')}]`);
    }
  }
}

if (failures.length > 0) {
  console.error('Responsive layout checks failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Responsive layout checks passed.');
