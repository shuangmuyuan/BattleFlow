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

## Rules

- Keep scripts POSIX/bash compatible with `set -Eeuo pipefail` where practical.
- Use pnpm inside scripts.
- Do not add npm or yarn commands.
- Keep database scripts idempotent where practical and require `BATTLEFLOW_DATABASE_URL` instead of embedding connection values.
- If UI layout contracts intentionally change, update the corresponding validation script and docs in the same change.
