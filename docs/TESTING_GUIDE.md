# Testing Guide

## Current Validation Gates

BattleFlow currently uses static and build validation rather than a full automated test runner.

| Gate | Command | Purpose |
| --- | --- | --- |
| Type-check | `pnpm ts-check` | Validates the TypeScript program with `tsc -p tsconfig.json`. |
| Lint | `pnpm lint:build` | Runs quiet ESLint with Next.js and local restrictions. |
| Overlay checks | `pnpm check:overlays` | Ensures Dialog, Sheet, Popover, Drawer, and AlertDialog wrappers remain viewport-bounded. |
| Responsive checks | `pnpm check:responsive` | Ensures dashboard pages retain required responsive layout contracts. |
| Unit tests | `pnpm test` | Runs Vitest tests for focused TypeScript logic. |
| Full validation | `pnpm validate` | Runs the four gates above in parallel. |
| Production build | `pnpm build` | Installs deps, builds Next.js, and bundles `src/server.ts`. |

Run `pnpm validate` before finishing any source change. Run `pnpm build` for runtime, dependency, Next config, server, or deployment-impacting changes.

## Automated Tests

Vitest is available for focused TypeScript utility and registry tests.

- `src/lib/workflow-validation.test.ts` covers validation criteria extraction, strict JSON parsing, aggregate gate status, and failed-candidate promotion prevention.

There is still no committed React Testing Library, Playwright, or Cypress setup. Do not claim browser or component behavior coverage exists. For workflow UI behavior, report manual verification explicitly until a browser runner is introduced.

## Proposed Test Convention

When adding broader automated tests, use:

- Vitest for TypeScript utility and registry tests.
- React Testing Library for component behavior that does not need a browser.
- Playwright for dashboard flows, viewport checks, and chat/workflow interactions.
- `*.test.ts` for server and registry tests.
- `*.test.tsx` for component tests.
- `e2e/*.spec.ts` for Playwright tests.

Recommended browser/component scripts when those tools are introduced:

```json
{
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

## Workflow Validation Loop Manual Checks

Until browser automation is introduced, verify the validation loop manually when changing workflow gate behavior:

1. Start from a clean buildable workspace and run `pnpm validate`, `pnpm test`, and `pnpm build`.
2. Start the app with `pnpm dev` after a successful build, or run the bundled server through the documented start command.
3. Open `/dashboard/workflows`, create or open a workflow, and generate a candidate assistant document for the active step.
4. Run validation with a candidate that should fail; confirm the step remains blocked, `step.output` is not updated, the next step stays locked, the chat area shows the blocker summary, and the `门禁` tab shows self-check/Agent findings.
5. Continue the conversation to revise the candidate, run validation again, and confirm the step advances only after both phases pass.
6. Retry from a `validation_failed` step and confirm the latest attempt replaces the active gate summary while earlier attempts remain visible in the registry response.
7. Re-edit a completed step and confirm the old output/gate is invalidated and downstream steps no longer receive that output as default context.
8. Load an older workflow record without validation fields and confirm it normalizes without crashing.
9. Check desktop and mobile widths for the left timeline, chat blocker band, and right `门禁` tab without horizontal clipping.
