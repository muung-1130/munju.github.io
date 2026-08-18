#!/usr/bin/env bash
# 로컬/Docker Compose에서 직접 도달 가능한 PostgreSQL에 적용할 때 사용한다.
# EKS에 배포된 PostgreSQL(클러스터 내부에서만 도달 가능)에는 대신
# scripts/apply-environment-checkpoint-schema-eks.sh를 사용한다.
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Set DATABASE_URL to the target PostgreSQL connection string." >&2
  exit 2
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/db/044_environment_consumer_checkpoint.sql"
