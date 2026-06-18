# BattleFlow Documentation

This directory is the durable context hub for humans and AI agents working on BattleFlow.

## Start Here

| Guide | Read when |
| --- | --- |
| [PRODUCT_SPEC.md](PRODUCT_SPEC.md) | You need the non-technical product intent, audience, capabilities, and non-goals. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | You need the system map, data flow, route-handler boundaries, or storage model. |
| [DEVELOPMENT_COMMANDS.md](DEVELOPMENT_COMMANDS.md) | You need exact pnpm commands for development, validation, build, or deployment. |
| [STANDARDS.md](STANDARDS.md) | You are editing TypeScript, React, Next.js, shadcn/ui, route handlers, or scripts. |
| [TESTING_GUIDE.md](TESTING_GUIDE.md) | You are validating changes or adding the first automated test runner. |
| [SECURITY.md](SECURITY.md) | You are touching auth, credentials, Skill imports, file-system writes, or external tools. |
| [PERFORMANCE.md](PERFORMANCE.md) | You are changing dashboard rendering, workflow state, chat streaming, imports, or build output. |
| [DESIGN.md](DESIGN.md) | You are changing visual UI, tokens, components, layout, or user-facing styling. |
| [AI_AGENT_ONBOARDING.md](AI_AGENT_ONBOARDING.md) | You are an agent starting a new session in this repo. |
| [AI_AGENT_COLLAB.md](AI_AGENT_COLLAB.md) | You are coordinating with another agent or leaving a handoff. |

## Module Guides

- [../src/app/README.md](../src/app/README.md) - App Router pages, layouts, route handlers, and metadata.
- [../src/app/api/README.md](../src/app/api/README.md) - API route-handler contracts.
- [../src/app/dashboard/README.md](../src/app/dashboard/README.md) - Product workspace screens and responsive shell.
- [../src/components/README.md](../src/components/README.md) - shadcn/ui and BattleFlow component conventions.
- [../src/lib/README.md](../src/lib/README.md) - Registries, agent adapters, Skill tuning, and config helpers.
- [../src/storage/README.md](../src/storage/README.md) - Supabase and Drizzle schema boundaries.
- [../scripts/README.md](../scripts/README.md) - Build, run, and validation scripts.
- [../skills/official/README.md](../skills/official/README.md) - Seeded product-planning Skills.
