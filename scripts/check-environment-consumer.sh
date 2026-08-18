#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_DIR="$ROOT_DIR/services/environment-dynamodb-consumer"

node --check "$SERVICE_DIR/index.mjs"
node --check "$SERVICE_DIR/otel.mjs"
bash -n "$ROOT_DIR/scripts/build-push-environment-consumer.sh"
bash -n "$ROOT_DIR/scripts/apply-environment-checkpoint-schema-eks.sh"
echo "Static checks passed"
