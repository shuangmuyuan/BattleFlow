import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const layoutContracts = [
  {
    name: 'Dashboard shell mobile containment',
    file: 'src/app/dashboard/layout.tsx',
    requiredTokens: [
      'h-screen min-w-0 overflow-hidden',
      'md:hidden',
      'md:flex',
      'overflow-x-auto',
      'h-screen min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
      'min-h-0 min-w-0 flex-1 overflow-hidden',
    ],
  },
  {
    name: 'Workflow detail responsive split view',
    file: 'src/app/dashboard/workflows/page.tsx',
    requiredTokens: [
      'flex-col overflow-auto lg:flex-row lg:overflow-hidden',
      'max-h-80',
      'lg:max-h-none',
      'lg:w-80',
      'min-h-[70vh]',
      'sm:flex-row',
    ],
  },
  {
    name: 'Dashboard overview internal scroll',
    file: 'src/app/dashboard/page.tsx',
    requiredTokens: [
      'h-full min-h-0',
      'overflow-auto',
    ],
  },
  {
    name: 'Skill registry internal scroll',
    file: 'src/app/dashboard/skills/page.tsx',
    requiredTokens: [
      'flex h-full min-h-0 flex-col',
      'shrink-0 border-b',
      'min-h-0 flex-1 overflow-auto',
    ],
  },
  {
    name: 'Workflow list internal scroll',
    file: 'src/app/dashboard/workflows/page.tsx',
    requiredTokens: [
      'flex h-full min-h-0 flex-col',
      'shrink-0 border-b',
      'min-h-0 flex-1 overflow-auto',
    ],
  },
  {
    name: 'Knowledge base internal scroll',
    file: 'src/app/dashboard/knowledge/page.tsx',
    requiredTokens: [
      'flex h-full min-h-0 flex-col',
      'shrink-0 border-b',
      'min-h-0 flex-1 overflow-auto',
    ],
  },
  {
    name: 'Demo generator internal scroll',
    file: 'src/app/dashboard/demos/page.tsx',
    requiredTokens: [
      'h-full min-h-0',
      'overflow-auto',
    ],
  },
];

const failures = [];

for (const contract of layoutContracts) {
  const source = readFileSync(path.join(root, contract.file), 'utf8');
  for (const token of contract.requiredTokens) {
    if (!source.includes(token)) {
      failures.push(`${contract.name} in ${contract.file} is missing ${token}`);
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
