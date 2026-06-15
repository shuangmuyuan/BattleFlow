import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const layoutContracts = [
  {
    name: 'Dashboard shell mobile containment',
    file: 'src/app/dashboard/layout.tsx',
    requiredTokens: [
      'overflow-x-hidden',
      'md:hidden',
      'md:flex',
      'overflow-x-auto',
      'min-w-0 flex-1 overflow-hidden',
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
