#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

for path in environments/prod/backend environments/prod/frontend environments/prod/ai; do
  echo "render: $path"
  kubectl kustomize "$path" >/dev/null
done

if rg -n 'harbor\.dai-run|dir-harbor-pull-secret|dairun.io/(pool|app-capable)|dir-backend-waypoint' environments/prod argocd; then
  echo "오류: prod에 Harbor/옛 node label/backend waypoint 참조가 남아 있습니다." >&2
  exit 1
fi

for file in environments/prod/backend/deployment-*.yaml environments/prod/frontend/deployment-*.yaml; do
  grep -q 'workload: app' "$file" || { echo "오류: workload=app 누락: $file" >&2; exit 1; }
done

for file in environments/prod/backend/hpa-*.yaml environments/prod/frontend/hpa-*.yaml; do
  jq -e '.spec.minReplicas == 1' "$file" >/dev/null
done
jq -e '.items[] | select(.kind=="HorizontalPodAutoscaler") | .spec.minReplicas == 1' environments/prod/ai/hpas.yaml >/dev/null

echo "OK: prod Kustomize/ECR/scheduling/HPA 정책 검증 완료"
