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
│   ├── lib/                    # File-backed registries, agent adapters, knowledge repositories, auth helpers
│   ├── storage/                # Direct Postgres client boundary
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
| Production start | `BATTLEFLOW_PROJECT_ENV=PROD DEPLOY_RUN_PORT=5100 pnpm start` | Runs `dist/server.js`; requires a prior build. Production start enables Claude Code `Read,Grep,Glob,WebSearch,WebFetch,Write,Edit` unless `BATTLEFLOW_CLAUDE_TOOLS` is explicitly overridden. |

## Local Test Deployment

After code development and validation, run BattleFlow locally against a local Postgres database. The local app should be exercised through `http://localhost:5100` unless the user explicitly asks for remote deployment.

Required flow:

1. Install dependencies when `package.json` or `pnpm-lock.yaml` changed:
   - `pnpm install`
2. Ensure local Postgres is running and reachable on `127.0.0.1:5432`.
   - Homebrew example: `brew services start postgresql@16`
   - Health check: `pg_isready -h 127.0.0.1 -p 5432`
3. Create or reuse the local `battleflow` database and `battleflow` role. Keep the connection string in a local `.env` file only.
4. Prepare `.env` for local runtime. At minimum it should provide:
   - `BATTLEFLOW_PROJECT_ENV=DEV`
   - `BATTLEFLOW_DATABASE_URL=postgresql://...`
   - `BATTLEFLOW_DATABASE_SSL=false`
   - `BATTLEFLOW_AUTH_SECRET=...`
   - local Claude CLI settings when workflow chat needs CLI-backed tool calls.
   - `BATTLEFLOW_CLAUDE_TOOLS=Read,Grep,Glob,WebSearch,WebFetch,Write,Edit` only when workflow chat needs Claude Code file-read, web, and guarded node-local write tools.
5. When working from an additional git worktree, check whether the canonical repository already has a local `.env` and a running local service before creating or initializing anything:
   - canonical local env path: `/Users/lichunhe/Documents/Playground/BattleFlow/.env`;
   - if the current worktree has no `.env`, source the canonical `.env` or pass the same environment variables explicitly;
   - if the expected port is already occupied, inspect the process working directory and reuse that service or start this worktree on another port; do not stop an existing local BattleFlow service unless the user explicitly asks;
   - do not create a new local Postgres database and do not rerun migrations just because a worktree has no `.env`;
   - for a one-off worktree run, prefer `set -a && source /Users/lichunhe/Documents/Playground/BattleFlow/.env && set +a` before `BATTLEFLOW_WORKSPACE_PATH="$(pwd)" CLAUDE_WORKSPACE_DIR="$(pwd)" CLAUDE_COMMAND=claude BATTLEFLOW_CLAUDE_TOOLS=Read,Grep,Glob,WebSearch,WebFetch,Write,Edit DEPLOY_RUN_PORT=5101 pnpm dev`;
   - if `GET /api/auth/me` returns `503` with `Authentication storage is not configured`, treat it as a missing runtime env problem first, not as a database bootstrap problem;
   - a healthy unauthenticated local service should return `401 Authentication required` from `/api/auth/me`, not `503`.
6. Run the local database initialization scripts only when the local `battleflow` database or tables are actually missing:
   - `pnpm db:postgres:init` for the full local Postgres bootstrap; or run the targeted scripts below when only one schema area is missing.
   - `pnpm db:knowledge:init`
   - `pnpm db:accounts:init`
   - `pnpm db:sso:init`
   - `pnpm db:notifications:init`
   - `pnpm db:chat-runs:init`
   - `pnpm db:resources:migrate` after auth/user bootstrap when resource metadata is needed.
7. Run the repository validation gate before handing the app back:
   - `pnpm validate`
   - `pnpm build` only for server/runtime, dependency, route-handler, or deployment-impacting changes.
8. Start the local service:
   - `DEPLOY_RUN_PORT=5100 pnpm dev`
9. Open `http://localhost:5100` and verify the requested flow in the browser.

Remote deployment is no longer the default verification path. Use `ssh boxhub-r` and `/root/data/BattleFlow` only when the user explicitly asks to deploy or verify on the shared remote Linux host.

Remote production deployments that use `pnpm start` do not need a manual tool environment edit: `scripts/start.sh` defaults `BATTLEFLOW_CLAUDE_TOOLS` to `Read,Grep,Glob,WebSearch,WebFetch,Write,Edit`. Docker deployments must also keep `Dockerfile` pointed at `pnpm start` and keep `docker-compose.yml` passing `BATTLEFLOW_CLAUDE_TOOLS: "${BATTLEFLOW_CLAUDE_TOOLS:-Read,Grep,Glob,WebSearch,WebFetch,Write,Edit}"`. Codex still needs to ensure the remote host has Claude Code CLI installed/authenticated, outbound network access from the host, and the repository `.agents/settings.json` with `skipWebFetchPreflight: true`.

Production and Docker deployments that use workflow chat must run `pnpm db:postgres:init` or at least `pnpm db:chat-runs:init` against the target `BATTLEFLOW_DATABASE_URL` before serving traffic. `/api/chat` stores detached run state in Postgres tables from `scripts/database/006_chat_runs.sql`; missing tables will make chat start/list/resume fail even when auth and workflow registries are healthy.

After any production or Docker deployment, verify `GET /api/agent-runtime` returns `toolsEnabled: true`, `writeToolsEnabled: true`, `writeGuardEnabled: true`, and includes `Read`, `Grep`, `Glob`, `WebSearch`, `WebFetch`, `Write`, and `Edit`. This catches cases where the image or compose entrypoint bypasses `scripts/start.sh`.

Never commit `.env*`, direct Postgres connection strings, Claude credentials, `FRIEREN_DEMO_HMAC_SECRET`, imported private Skill packages, or runtime registry data under `data/`.

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
- Secrets: never commit `.env*`, direct Postgres connection strings/passwords, Anthropic/Claude credentials, imported private Skill packages, or runtime registry data under `data/`.
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
