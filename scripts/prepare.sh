#!/bin/bash
set -Eeuo pipefail

BATTLEFLOW_WORKSPACE_PATH="${BATTLEFLOW_WORKSPACE_PATH:-$(pwd)}"

cd "${BATTLEFLOW_WORKSPACE_PATH}"

echo "Installing dependencies..."
pnpm install --prefer-frozen-lockfile --prefer-offline --loglevel debug --reporter=append-only
