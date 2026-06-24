#!/bin/bash
set -Eeuo pipefail

BATTLEFLOW_WORKSPACE_PATH="${BATTLEFLOW_WORKSPACE_PATH:-$(pwd)}"

PORT=5000
DEPLOY_RUN_PORT="${DEPLOY_RUN_PORT:-$PORT}"
BATTLEFLOW_PROJECT_ENV="${BATTLEFLOW_PROJECT_ENV:-PROD}"
NODE_ENV="${NODE_ENV:-production}"


start_service() {
    cd "${BATTLEFLOW_WORKSPACE_PATH}"
    echo "Starting HTTP service on port ${DEPLOY_RUN_PORT} for deploy..."
    PORT=${DEPLOY_RUN_PORT} BATTLEFLOW_PROJECT_ENV=${BATTLEFLOW_PROJECT_ENV} NODE_ENV=${NODE_ENV} node dist/server.js
}

echo "Starting HTTP service on port ${DEPLOY_RUN_PORT} for deploy..."
start_service
