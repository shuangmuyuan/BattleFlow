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

## Rules

- Keep scripts POSIX/bash compatible with `set -Eeuo pipefail` where practical.
- Use pnpm inside scripts.
- Do not add npm or yarn commands.
- If UI layout contracts intentionally change, update the corresponding validation script and docs in the same change.

