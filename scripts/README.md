# `scripts`

Repository automation scripts.

## Scripts

- `dev.sh`: clears the selected port and starts the custom Next server through `tsx watch`.
- `build.sh`: installs dependencies, runs `next build`, and bundles `src/server.ts` with `tsup`.
- `start.sh`: starts the bundled production server.
- `prepare.sh`: project preparation hook.
- `validate.sh`: wrapper around `pnpm validate`.
- `check-overlay-bounds.mjs`: static contract check for viewport-bounded overlay wrappers.
- `check-responsive-layout.mjs`: static contract check for dashboard responsive layout classes.
- `apply-postgres-migration.mjs`: applies static SQL migrations to `BATTLEFLOW_DATABASE_URL`.
- `migrate-resource-metadata.mjs`: backfills Skill/workflow business metadata and owner grants from file-backed runtime registries into Postgres.
- `cleanup-official-seed-skills.mjs`: reports or deletes the removed official Seed Skill rows and file-registry entries; apply mode preserves historical workflow steps while clearing their retired Skill bindings.
- `database/005_workflow_private_grants.sql`: removes legacy organization-wide workflow grants so user-created workflows stay private by default.
- `database/006_chat_runs.sql`: creates detached workflow chat run state and replayable SSE event tables used by `/api/chat`.
- `database/007_remove_unused_planning_surfaces.sql`: removes retired PRD, milestone, snapshot, and external knowledge-base connection storage from existing Postgres deployments.

## Rules

- Keep scripts POSIX/bash compatible with `set -Eeuo pipefail` where practical.
- Use pnpm inside scripts.
- Do not add npm or yarn commands.
- Keep database scripts idempotent where practical and require `BATTLEFLOW_DATABASE_URL` instead of embedding connection values.
- If UI layout contracts intentionally change, update the corresponding validation script and docs in the same change.
