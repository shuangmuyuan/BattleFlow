import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const overlayContracts = [
  {
    name: 'DialogContent',
    file: 'src/components/ui/dialog.tsx',
    requiredTokens: [
      'max-h-[calc(100dvh-2rem)]',
      'overflow-y-auto',
      'overscroll-contain',
    ],
  },
  {
    name: 'AlertDialogContent',
    file: 'src/components/ui/alert-dialog.tsx',
    requiredTokens: [
      'max-h-[calc(100dvh-2rem)]',
      'overflow-y-auto',
      'overscroll-contain',
    ],
  },
  {
    name: 'SheetContent',
    file: 'src/components/ui/sheet.tsx',
    requiredTokens: [
      'overflow-y-auto',
      'overscroll-contain',
      'max-h-[calc(100dvh-2rem)]',
    ],
  },
  {
    name: 'PopoverContent',
    file: 'src/components/ui/popover.tsx',
    requiredTokens: [
      'max-h-[var(--radix-popover-content-available-height)]',
      'overflow-y-auto',
      'overscroll-contain',
    ],
  },
  {
    name: 'DrawerContent',
    file: 'src/components/ui/drawer.tsx',
    requiredTokens: [
      'max-h-[80vh]',
      'overflow-y-auto',
      'overscroll-contain',
    ],
  },
];

const failures = [];

for (const contract of overlayContracts) {
  const source = readFileSync(path.join(root, contract.file), 'utf8');
  for (const token of contract.requiredTokens) {
    if (!source.includes(token)) {
      failures.push(`${contract.name} in ${contract.file} is missing ${token}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Overlay viewport-boundary checks failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Overlay viewport-boundary checks passed.');
