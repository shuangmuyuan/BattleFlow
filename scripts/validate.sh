#!/bin/bash
set -Eeuo pipefail

BATTLEFLOW_WORKSPACE_PATH="${BATTLEFLOW_WORKSPACE_PATH:-$(pwd)}"

cd "${BATTLEFLOW_WORKSPACE_PATH}"

echo "🔍 Running validate..."
pnpm validate
echo "✅ Validate passed!"
