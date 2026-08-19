#!/bin/sh
set -eu

project_dir="${CI_PROJECT_DIR:-.}"
registry="${ECR_REGISTRY:?ECR_REGISTRY is required}"
region="${AWS_DEFAULT_REGION:?AWS_DEFAULT_REGION is required}"
trivy_image="${TRIVY_IMAGE:?TRIVY_IMAGE is required}"
mode="${DEMO_CACHE_MODE:-warm}"
theme="${DEMO_THEME:-course}"
repository="dai-run/frontend"
output_dir="$project_dir/ci-output/demo"
trivy_cache_dir="${TRIVY_CACHE_DIR:-$project_dir/.trivy-cache}"

case "$mode" in
  cold|warm) ;;
  *) echo "DEMO_CACHE_MODE must be cold or warm: $mode" >&2; exit 1 ;;
esac
case "$theme" in
  blue|orange|green|purple|course) ;;
  *) echo "DEMO_THEME must be blue, orange, green, purple, or course: $theme" >&2; exit 1 ;;
esac

umask 077
docker_config="$(mktemp -d "$project_dir/.demo-docker-auth.XXXXXX")"
cleanup() {
  DOCKER_CONFIG="$docker_config" docker logout "$registry" >/dev/null 2>&1 || true
  rm -rf -- "$docker_config"
}
trap cleanup EXIT HUP INT TERM

export DOCKER_CONFIG="$docker_config"
mkdir -p "$output_dir" "$trivy_cache_dir"
image_tag="demo-${theme}-${mode}-${CI_COMMIT_SHORT_SHA:-local}-${CI_PIPELINE_IID:-0}-${CI_JOB_ID:-0}"
image="$registry/$repository:$image_tag"

echo "DAI RUN frontend demo build"
echo "  cache_mode: $mode"
echo "  theme:      $theme"
echo "  image:      $image"
echo "  note:       this job pushes ECR only; it does not update GitOps or EKS"

aws sts get-caller-identity --query Account --output text
aws ecr get-login-password --region "$region" \
  | docker login --username AWS --password-stdin "$registry"

build_started_at="$(date +%s)"
if [ "$mode" = cold ]; then
  docker build --pull --no-cache \
    --label com.dairun.cicd-demo=true \
    --file Dockerfile.frontend \
    --tag "$image" \
    .
else
  docker build --pull \
    --label com.dairun.cicd-demo=true \
    --file Dockerfile.frontend \
    --tag "$image" \
    .
fi
build_finished_at="$(date +%s)"
build_seconds="$((build_finished_at - build_started_at))"
echo "DEMO_BUILD_RESULT mode=$mode service=frontend seconds=$build_seconds"

docker pull "$trivy_image"
runner_uid="$(id -u)"
runner_gid="$(id -g)"
docker_socket_gid="$(stat -c '%g' /var/run/docker.sock)"

echo "Running the production-equivalent fixed CRITICAL vulnerability gate"
docker run --rm \
  --user "$runner_uid:$runner_gid" \
  --group-add "$docker_socket_gid" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$trivy_cache_dir:/tmp/trivy-cache" \
  "$trivy_image" image \
  --cache-dir /tmp/trivy-cache \
  --scanners vuln \
  --severity CRITICAL \
  --ignore-unfixed \
  --exit-code 1 \
  --format table \
  "$image"

docker push "$image"

digest=""
attempt=0
while [ "$attempt" -lt 12 ]; do
  digest="$(aws ecr describe-images \
    --region "$region" \
    --repository-name "$repository" \
    --image-ids "imageTag=$image_tag" \
    --query 'imageDetails[0].imageDigest' \
    --output text 2>/dev/null || true)"
  if printf '%s\n' "$digest" | grep -Eq '^sha256:[0-9a-f]{64}$'; then
    break
  fi
  digest=""
  attempt=$((attempt + 1))
  sleep 5
done

[ -n "$digest" ] || {
  echo "ECR digest lookup failed for $repository:$image_tag" >&2
  exit 1
}

image_by_digest="$registry/$repository@$digest"
{
  printf 'DEMO_IMAGE=%s\n' "$image_by_digest"
  printf 'DEMO_BUILD_SECONDS=%s\n' "$build_seconds"
  printf 'DEMO_CACHE_MODE=%s\n' "$mode"
} >"$output_dir/image.env"

{
  printf 'cache_mode=%s\n' "$mode"
  printf 'build_seconds=%s\n' "$build_seconds"
  printf 'image=%s\n' "$image_by_digest"
  printf 'manual_deploy_command=keks set image deployment/dir-frontend dir-frontend=%s -n dir-frontend-ns\n' "$image_by_digest"
} >"$output_dir/result.txt"

echo "DEMO_IMAGE=$image_by_digest"
echo "Manual deployment command:"
echo "keks set image deployment/dir-frontend dir-frontend=$image_by_digest -n dir-frontend-ns"
echo "The demo image is intentionally retained on this Runner for the warm-cache comparison."