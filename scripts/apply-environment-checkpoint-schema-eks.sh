#!/usr/bin/env bash
# EKS 클러스터 안에서만 도달 가능한 PostgreSQL에 db/044_environment_consumer_checkpoint.sql을
# 적용한다. 로컬에서 PGHOST로 직접 접속하는 대신, 이미 배포된 dir-environment-consumer-secret의
# 접속 정보를 그대로 재사용하는 1회성 Pod를 클러스터 안에 띄워 적용하고 즉시 삭제한다.
# 사전 조건: 이 EKS 클러스터를 가리키는 kubectl context, dir-environment-consumer-secret가
# 이미 apply되어 있어야 한다(k8s/environment-consumer/secret.example.yaml 참고, GitOps 저장소 쪽).
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAMESPACE="${NAMESPACE:-dir-backend-ns}"
SECRET_NAME="${SECRET_NAME:-dir-environment-consumer-secret}"
SQL_FILE="${1:-$ROOT_DIR/db/044_environment_consumer_checkpoint.sql}"
POD_NAME="dir-environment-consumer-schema-migration-$(date +%s)"

test -f "$SQL_FILE" || { echo "SQL file not found: $SQL_FILE" >&2; exit 1; }
kubectl -n "$NAMESPACE" get secret "$SECRET_NAME" >/dev/null

kubectl -n "$NAMESPACE" run "$POD_NAME" \
  --rm -i --restart=Never \
  --image=postgres:16-alpine \
  --overrides="{
    \"spec\": {
      \"containers\": [{
        \"name\": \"psql\",
        \"image\": \"postgres:16-alpine\",
        \"stdin\": true,
        \"envFrom\": [{ \"secretRef\": { \"name\": \"${SECRET_NAME}\" } }],
        \"command\": [\"psql\", \"-h\", \"\$(PGHOST)\", \"-p\", \"\$(PGPORT)\", \"-U\", \"\$(PGUSER)\", \"-d\", \"\$(PGDATABASE)\", \"-v\", \"ON_ERROR_STOP=1\", \"-f\", \"-\"]
      }]
    }
  }" \
  < "$SQL_FILE"

echo "Applied $(basename "$SQL_FILE") against ${SECRET_NAME} (namespace ${NAMESPACE})"
