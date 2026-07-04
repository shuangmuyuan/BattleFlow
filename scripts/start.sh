#!/bin/bash
set -Eeuo pipefail

BATTLEFLOW_WORKSPACE_PATH="${BATTLEFLOW_WORKSPACE_PATH:-$(pwd)}"

PORT=5000
DEPLOY_RUN_PORT="${DEPLOY_RUN_PORT:-$PORT}"
BATTLEFLOW_PROJECT_ENV="${BATTLEFLOW_PROJECT_ENV:-PROD}"
NODE_ENV="${NODE_ENV:-production}"
BATTLEFLOW_CLAUDE_TOOLS="${BATTLEFLOW_CLAUDE_TOOLS:-Read,Grep,Glob,WebSearch,WebFetch}"
CLAUDE_WORKSPACE_DIR="${CLAUDE_WORKSPACE_DIR:-${BATTLEFLOW_WORKSPACE_PATH}}"

if [[ "${CLAUDE_COMMAND:-}" == *"claude-web-tools-wrapper.sh" ]]; then
    echo "Ignoring legacy Claude web-tools wrapper for production start; using claude directly."
    unset CLAUDE_COMMAND
fi
CLAUDE_COMMAND="${CLAUDE_COMMAND:-claude}"


start_service() {
    cd "${BATTLEFLOW_WORKSPACE_PATH}"
    echo "Starting HTTP service on port ${DEPLOY_RUN_PORT} for deploy..."
    PORT="${DEPLOY_RUN_PORT}" \
      BATTLEFLOW_PROJECT_ENV="${BATTLEFLOW_PROJECT_ENV}" \
      NODE_ENV="${NODE_ENV}" \
      BATTLEFLOW_CLAUDE_TOOLS="${BATTLEFLOW_CLAUDE_TOOLS}" \
      CLAUDE_COMMAND="${CLAUDE_COMMAND}" \
      CLAUDE_WORKSPACE_DIR="${CLAUDE_WORKSPACE_DIR}" \
      node dist/server.js
}

echo "Starting HTTP service on port ${DEPLOY_RUN_PORT} for deploy..."
start_service
