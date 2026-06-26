# BattleFlow Agent Guide

This is the canonical entry point for AI agents working in this repository. Read it before editing code, docs, skills, or runtime configuration.

## Repository Purpose

BattleFlow is a Next.js product-planning workspace for AI-native teams. It turns repeatable product planning methods into Skills, lets teams import and review those Skills, and composes them into workflows that produce research, requirement breakdowns, reviewed outputs, and PRD material.

## Documentation Index

| File | Purpose |
| --- | --- |
| [docs/README.md](docs/README.md) | Documentation hub and recommended reading order. |
| [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) | Non-technical product intent, users, capabilities, and non-goals. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System structure, runtime flow, storage, and integration boundaries. |
| [docs/STANDARDS.md](docs/STANDARDS.md) | Coding, TypeScript, React, Next.js, styling, and review standards. |
| [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md) | Current validation gates and proposed automated test convention. |
| [docs/DEVELOPMENT_COMMANDS.md](docs/DEVELOPMENT_COMMANDS.md) | Real commands for install, development, validation, build, and deploy. |
| [docs/SECURITY.md](docs/SECURITY.md) | Secrets, auth, data, imports, file-system, and agent safety posture. |
| [docs/PERFORMANCE.md](docs/PERFORMANCE.md) | Performance-sensitive paths and budgets for the app and runtime. |
| [docs/DESIGN.md](docs/DESIGN.md) | Visual UI design system: tokens, component patterns, responsive rules, and agent guidance. |
| [docs/AI_AGENT_ONBOARDING.md](docs/AI_AGENT_ONBOARDING.md) | First-session checklist for agents new to BattleFlow. |
| [docs/AI_AGENT_COLLAB.md](docs/AI_AGENT_COLLAB.md) | Handoff, ownership, conflict avoidance, and DWP collaboration rules. |
| [DESIGN.md](DESIGN.md) | Original visual direction note preserved as design source material. |

## Repository Structure

```text
.
├── src/
│   ├── app/                    # Next.js App Router pages, layouts, and route handlers
│   │   ├── api/                # Node route handlers for chat, skills, workflows, PRD, config
│   │   └── dashboard/          # Authenticated product workspace pages
│   ├── components/
│   │   ├── battleflow/         # Product-specific UI primitives and markdown rendering
│   │   └── ui/                 # shadcn/ui components based on Radix UI
│   ├── hooks/                  # Client hooks such as theme and mobile detection
│   ├── lib/                    # File-backed registries, agent adapters, knowledge repository, Supabase config helpers
│   ├── storage/                # Supabase/Postgres clients and Drizzle schema definitions
│   └── server.ts               # Custom Node HTTP entrypoint for Next.js
├── skills/official/            # Seeded BattleFlow product-planning Skills
├── scripts/                    # Build, dev, start, and validation scripts
├── public/                     # Static assets
├── docs/                       # AI-first documentation hub
├── .agents/                    # Cross-agent skills, commands, agents, and catalogs
├── .dwp/                       # Gitignored Deep Work Plan state
└── tmp/                        # Gitignored scratch space
```

## Quick Commands

Use `pnpm` only. Do not use `npm` or `yarn` for dependency or script execution in this repository.

| Task | Command | Notes |
| --- | --- | --- |
| Install dependencies | `pnpm install` | Honors `pnpm-lock.yaml` and the `preinstall` guard. |
| Start development server | `pnpm dev` | Runs `scripts/dev.sh`; default port is `5000` unless `DEPLOY_RUN_PORT` or `PORT` is set. |
| Type-check | `pnpm ts-check` | Runs `tsc -p tsconfig.json`. |
| Lint for build | `pnpm lint:build` | Runs `eslint . --quiet`. |
| Overlay boundary check | `pnpm check:overlays` | Verifies viewport-safe overlay component contracts. |
| Responsive layout check | `pnpm check:responsive` | Verifies required responsive layout class contracts. |
| Full validation gate | `pnpm validate` | Runs type-check, lint, overlay, and responsive checks in parallel. |
| Production build | `pnpm build` | Installs dependencies, runs `next build`, then bundles `src/server.ts` with `tsup`. |
| Production start | `BATTLEFLOW_PROJECT_ENV=PROD DEPLOY_RUN_PORT=5100 pnpm start` | Runs `dist/server.js`; requires a prior build. |

## Remote Test Deployment

After code development and local validation, test BattleFlow through the shared remote Linux host instead of relying only on a local unauthenticated dev server.

Required flow:

1. Connect to the remote server with `ssh boxhub-r`.
2. Deploy the service under `/root/data/BattleFlow` on that server.
3. Install or refresh dependencies with `pnpm install` when `package.json` or `pnpm-lock.yaml` changed.
4. Run the repository validation gate before serving test traffic:
   - `pnpm validate`
   - `pnpm build` for server/runtime, dependency, route-handler, or deployment-impacting changes.
5. Start the remote service from `/root/data/BattleFlow`. Prefer the production-like command for feature verification:
   - `BATTLEFLOW_PROJECT_ENV=PROD DEPLOY_RUN_PORT=5100 pnpm start`
6. Establish a local SSH tunnel and access the service through the tunnel:
   - `ssh -N -L 5001:127.0.0.1:5100 boxhub-r`
   - open `http://localhost:5001`

Keep secrets on the remote server only. Do not paste or commit `BATTLEFLOW_DATABASE_URL`, `FRIEREN_DEMO_HMAC_SECRET`, Supabase service-role keys, or other credentials. If port `5001` is already in use locally, choose another local port for the left side of the tunnel, for example `ssh -N -L 5011:127.0.0.1:5100 boxhub-r`.

## Mandatory Rules

- Language: code, comments, docs, agent files, and commit messages MUST be in English from this point forward. Existing Chinese UI copy and seeded product Skill content may remain until intentionally localized.
- Deep Work Plan 产物语言：通过 Deep Work Plan 方法论生成的 `.dwp/` plans、drafts、analysis reports、executive reports 和设计文档，默认必须使用中文；除非用户明确要求其他语言。
- Commits: use Conventional Commits, `type(scope): description`. Recent repository history already follows this pattern.
- Package management: use pnpm only. Never add `package-lock.json`, `yarn.lock`, or npm/yarn commands.
- TypeScript: write with `strict` in mind. Avoid implicit `any`, avoid `as any`, type event objects and error handling, and remove unused imports.
- React hydration: do not use `typeof window`, `Date.now()`, `Math.random()`, locale formatting, or browser-only state directly in JSX render paths. Put client-only dynamic data behind `'use client'`, `useEffect`, and state.
- Next.js metadata: do not use a raw `<head>` tag. Use App Router metadata APIs; use `globals.css` or `next/font` for fonts and third-party CSS.
- Next config paths: never hardcode absolute paths in `next.config.ts`; use dynamic roots such as `process.cwd()`, `import.meta.dirname`, or `path.resolve(...)`.
- UI system: default to shadcn/ui components from `src/components/ui/`, lucide-react icons, Tailwind CSS 4 tokens, and the existing BattleFlow design direction in `DESIGN.md`.
- Overlay safety: business code must not import raw Radix overlay primitives directly. Use the bounded components in `src/components/ui/`.
- Validation: run `pnpm validate` before considering a code or UI change complete. Run `pnpm build` for server/runtime, dependency, or deployment-impacting changes.
- Testing gap: this repo currently has validation scripts but no unit/component/e2e test runner. Behavior changes should either add focused tests if a runner is introduced or document the manual verification performed.
- Secrets: never commit `.env*`, Supabase service role keys, direct Postgres connection strings/passwords, Anthropic/Claude credentials, imported private Skill packages, or runtime registry data under `data/`.
- Runtime data: `data/skill-registry/`, `data/workflows/`, `.dwp/`, and `tmp/` are working state, not product source.
- Repository boundaries: this is an individual repository. Do not treat it as an orchestrator hub and do not commit unrelated sibling repository changes from here.
- Progress reporting: for multi-step work, keep the user informed after significant phases. Do not block engineering work on status reporting if the reporting channel is unavailable.

## Branch Collaboration

BattleFlow uses a lightweight Git Flow model:

- `main` is the production branch. It must stay deployable and should only receive verified release changes or hotfixes.
- `develop` is the integration and test branch. New product work starts from `develop`.
- Before starting a new feature branch, make sure `develop` contains any newer changes from `main`. In practice, hotfixes merged to `main` must be merged back into `develop` immediately.
- Feature branches should be created from `develop`, using names such as `feature/<scope>`, `fix/<scope>`, or `chore/<scope>`.
- After implementation and validation, merge the feature branch back into `develop`, then delete the feature branch.
- After `develop` passes validation, merge `develop` into `main` for deployment.
- Production incidents must be fixed from `main` on a `hotfix/<scope>` branch.
- After a hotfix passes validation, merge it into `main`, deploy it, then merge `main` back into `develop` so the production fix is not lost.
- Delete hotfix branches after they have been merged back into the required long-lived branches.
- Prefer pull requests for merges into `develop` and `main`. Run `pnpm validate` before merging code changes; run `pnpm build` for server, runtime, dependency, or deployment-impacting changes.

## Deep Work Plan Commands

Thin command files live under `.agents/commands/` and delegate to `.agents/skills/deepworkplan`.

| Command | Purpose |
| --- | --- |
| `/dwp-create` | Create a refined Deep Work Plan draft. |
| `/dwp-execute` | Execute an approved plan task by task. |
| `/dwp-refine` | Revise a draft or existing plan while preserving completed work. |
| `/dwp-resume` | Resume the first incomplete task in an interrupted plan. |
| `/dwp-status` | Report plan status without making changes. |
| `/dwp-verify` | Check repository and plan conformance. |
| `/design-system` | Refresh `docs/DESIGN.md` through the DWP design-system addon. |
| `/skill-create` | Author or update a repo-specific skill. |
| `/agent-create` | Author or update a repo-specific agent persona. |

## Module Guides

Read the module README closest to the files you touch:

- [src/app/README.md](src/app/README.md)
- [src/app/api/README.md](src/app/api/README.md)
- [src/app/dashboard/README.md](src/app/dashboard/README.md)
- [src/components/README.md](src/components/README.md)
- [src/lib/README.md](src/lib/README.md)
- [src/storage/README.md](src/storage/README.md)
- [scripts/README.md](scripts/README.md)
- [skills/official/README.md](skills/official/README.md)

## Review Gates

Before finishing work, report:

1. Files changed and why.
2. Validation commands run and their results.
3. Any checks not run, with the reason.
4. Security impact: secrets, auth, imports, file-system writes, and user-provided content.
5. Follow-up gaps, especially missing automated tests when behavior changed.
