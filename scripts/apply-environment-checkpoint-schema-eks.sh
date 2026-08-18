#!/usr/bin/env bash
# EKS 클러스터 안에서만 도달 가능한 PostgreSQL(CloudNativePG)에
# db/044_environment_consumer_checkpoint.sql을 적용한다.
#
# 이 클러스터의 워커 노드에는 인터넷 아웃바운드가 없어(NAT 없음, README_dev.md의 SES 관련
# 서브넷 설명과 동일한 제약) postgres:16-alpine 같은 외부 이미지를 새 Pod로 pull할 수 없다
# (2026-08-18 실측: ImagePullBackOff). 대신 이미 떠 있는 CloudNativePG Pod(자체적으로 psql을
# 내장) 중 현재 primary에 직접 kubectl exec로 붙어서 적용한다.
#
# 사전 조건: 이 EKS 클러스터를 가리키는 kubectl context, dir-db-ns의 CloudNativePG 클러스터가
# 이미 떠 있어야 한다.
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAMESPACE="${NAMESPACE:-dir-db-ns}"
PG_USER="${PG_USER:-postgres}"
PG_DATABASE="${PG_DATABASE:-dai_run}"
SQL_FILE="${1:-$ROOT_DIR/db/044_environment_consumer_checkpoint.sql}"

test -f "$SQL_FILE" || { echo "SQL file not found: $SQL_FILE" >&2; exit 1; }

PRIMARY_POD="$(kubectl -n "$NAMESPACE" get pods -l role=primary -o jsonpath='{.items[0].metadata.name}')"
test -n "$PRIMARY_POD" || { echo "CloudNativePG primary pod를 찾지 못했습니다 (namespace: $NAMESPACE, label role=primary)." >&2; exit 1; }

kubectl -n "$NAMESPACE" exec -i "$PRIMARY_POD" -c postgres -- \
  psql -U "$PG_USER" -d "$PG_DATABASE" -v ON_ERROR_STOP=1 \
  < "$SQL_FILE"

echo "Applied $(basename "$SQL_FILE") against ${PRIMARY_POD} (namespace ${NAMESPACE}, db ${PG_DATABASE})"
