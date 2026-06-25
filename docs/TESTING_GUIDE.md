# Testing Guide

## Current Validation Gates

BattleFlow currently uses static and build validation rather than a full automated test runner.

| Gate | Command | Purpose |
| --- | --- | --- |
| Type-check | `pnpm ts-check` | Validates the TypeScript program with `tsc -p tsconfig.json`. |
| Lint | `pnpm lint:build` | Runs quiet ESLint with Next.js and local restrictions. |
| Overlay checks | `pnpm check:overlays` | Ensures Dialog, Sheet, Popover, Drawer, and AlertDialog wrappers remain viewport-bounded. |
| Responsive checks | `pnpm check:responsive` | Ensures dashboard pages retain required responsive layout contracts. |
| Unit tests | `pnpm test` | Runs Vitest tests for server utilities and pure application logic. |
| Full validation | `pnpm validate` | Runs the four gates above in parallel. |
| Production build | `pnpm build` | Installs deps, builds Next.js, and bundles `src/server.ts`. |

Run `pnpm validate` before finishing any source change. Run `pnpm test` when touching code with unit coverage. Run `pnpm build` for runtime, dependency, Next config, server, or deployment-impacting changes.

## Automated Tests

Vitest is configured through package scripts:

```bash
pnpm test
pnpm test:watch
```

Current coverage starts with `src/lib/auth/permissions.test.ts`, which exercises the server-side authorization decision engine. Do not claim broader automated behavior coverage until more tests are added.

## Proposed Test Convention

When adding more automated tests, use:

- Vitest for TypeScript utility and registry tests.
- React Testing Library for component behavior that does not need a browser.
- Playwright for dashboard flows, viewport checks, and chat/workflow interactions.
- `*.test.ts` for server and registry tests.
- `*.test.tsx` for component tests.
- `e2e/*.spec.ts` for Playwright tests.

Recommended initial scripts:

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test"
}
```

Do not add these scripts without adding the dependencies and at least one real test that exercises existing BattleFlow behavior.

## Manual Verification Checklist

Use this only when there is no automated test for the touched behavior:

1. Start the app with `pnpm dev`.
2. Exercise the affected dashboard page or API route.
3. Confirm the empty, loading, success, and failure states that the change touches.
4. Confirm mobile and desktop layouts if UI changed.
5. Record exact commands and manual checks in the final report.
