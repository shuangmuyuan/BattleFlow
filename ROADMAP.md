# BattleFlow Roadmap

## Current Stage

Workflow execution UX stabilization.

## Completed

- 2026-07-15: Kept workflow chat running after recoverable Claude tool failures. Failed tool calls remain visible, while only top-level SDK errors, stream failures, cancellation, or abort terminate the turn.
- 2026-07-13: Kept the active workflow step confirmation action visible before an output document exists. The action remains disabled with explicit guidance until the node writes an output document.

## In Progress

None recorded.

## Planned

To be confirmed.

## Blockers

None.

## Recent Validation

- 2026-07-15: The six focused runtime suites passed with 64 tests, including recovery after an unavailable tool call.
- 2026-07-15: `pnpm ts-check`, `pnpm lint:build`, `pnpm check:overlays`, and `pnpm check:responsive` passed. `pnpm validate` still matched no workspace projects, so its four underlying checks were run individually.
- 2026-07-15: `pnpm next build` and the server `pnpm tsup` bundle passed. The Next.js build retained the existing NFT tracing warning for `workflow-attachments.ts`.
- 2026-07-15: `pnpm audit --prod --audit-level moderate` could not complete because the npm registry audit endpoint returned HTTP 410.
- 2026-07-13: `pnpm ts-check`, `pnpm lint:build`, `pnpm check:overlays`, and `pnpm check:responsive` passed.
- 2026-07-13: Browser verification at `http://localhost:5100` confirmed the disabled confirmation action and empty-output guidance render correctly.
- 2026-07-13: `pnpm validate` matched no workspace projects, so its four underlying checks were run individually.
