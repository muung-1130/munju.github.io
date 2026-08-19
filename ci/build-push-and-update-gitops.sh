#!/bin/sh
set -eu

project_dir="${CI_PROJECT_DIR:-.}"
services_file="$project_dir/ci-output/changed-services.tsv"
updates_file="$project_dir/ci-output/image-updates.tsv"
registry="${ECR_REGISTRY:?ECR_REGISTRY is required}"
trivy_image="${TRIVY_IMAGE:?TRIVY_IMAGE is required}"
trivy_cache_dir="${TRIVY_CACHE_DIR:-$project_dir/.trivy-cache}"
trivy_reports_dir="$project_dir/ci-output/trivy"
runner_uid="$(id -u)"
runner_gid="$(id -g)"
docker_socket_gid="$(stat -c '%g' /var/run/docker.sock)"
trivy_container_cache_dir="/tmp/trivy-cache"

if [ ! -s "$services_file" ]; then
  echo "No production service changed; ECR and GitOps update skipped."
  exit 0
fi

: "${GITOPS_PUSH_TOKEN:?Protected masked CI variable GITOPS_PUSH_TOKEN is required}"
: "${GITOPS_REPOSITORY_URL:?GITOPS_REPOSITORY_URL is required}"

umask 077
docker_config="$(mktemp -d "$project_dir/.docker-auth.XXXXXX")"
gitops_dir="$(mktemp -d "$project_dir/.gitops.XXXXXX")"

cleanup() {
  DOCKER_CONFIG="$docker_config" docker logout "$registry" >/dev/null 2>&1 || true
  rm -rf -- "$docker_config" "$gitops_dir"
}
trap cleanup EXIT HUP INT TERM

export DOCKER_CONFIG="$docker_config"
: >"$updates_file"
mkdir -p "$trivy_cache_dir" "$trivy_reports_dir"
docker pull "$trivy_image"

aws sts get-caller-identity --query Account --output text
aws ecr get-login-password --region "$AWS_DEFAULT_REGION" \
  | docker login --username AWS --password-stdin "$registry"

image_tag="gitlab-${CI_COMMIT_SHORT_SHA:-local}-${CI_PIPELINE_IID:-0}"

while IFS='|' read -r service_id _watch_paths dockerfile context repository; do
  image="$registry/$repository:$image_tag"
  echo "Building $service_id -> $image"
  docker build --pull --file "$dockerfile" --tag "$image" "$context"

  echo "Recording HIGH and CRITICAL vulnerability findings for $service_id"
  docker run --rm \
    --user "$runner_uid:$runner_gid" \
    --group-add "$docker_socket_gid" \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "$trivy_cache_dir:$trivy_container_cache_dir" \
    -v "$trivy_reports_dir:/reports" \
    "$trivy_image" image \
    --cache-dir "$trivy_container_cache_dir" \
    --scanners vuln \
    --severity HIGH,CRITICAL \
    --format json \
    --output "/reports/$service_id.json" \
    "$image"

  echo "Enforcing the fixed CRITICAL vulnerability gate for $service_id"
  docker run --rm \
    --user "$runner_uid:$runner_gid" \
    --group-add "$docker_socket_gid" \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "$trivy_cache_dir:$trivy_container_cache_dir" \
    "$trivy_image" image \
    --cache-dir "$trivy_container_cache_dir" \
    --scanners vuln \
    --severity CRITICAL \
    --ignore-unfixed \
    --exit-code 1 \
    --format table \
    "$image"

  echo "Security gate passed; pushing $service_id to ECR"
  docker push "$image"

  digest=""
  attempt=0
  while [ "$attempt" -lt 12 ]; do
    digest="$(aws ecr describe-images \
      --region "$AWS_DEFAULT_REGION" \
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

  printf '%s|%s\n' "$repository" "$digest" >>"$updates_file"
done <"$services_file"

export GIT_ASKPASS="$project_dir/ci/git-askpass.sh"
export GIT_TERMINAL_PROMPT=0

git clone --branch stg --single-branch "$GITOPS_REPOSITORY_URL" "$gitops_dir"
"$project_dir/ci/update-gitops-images.sh" "$gitops_dir" "$updates_file"

cd "$gitops_dir"
git diff --check

for environment in frontend backend ai; do
  if command -v kubectl >/dev/null 2>&1; then
    kubectl kustomize "environments/prod/$environment" >/dev/null
  fi
done

if git diff --quiet; then
  echo "GitOps stg already contains the requested digests."
  exit 0
fi

git config user.name "DAI RUN GitLab CI"
git config user.email "gitlab-ci@dai-run.internal"
git add environments/prod
git commit -m "Deploy application ${CI_COMMIT_SHORT_SHA:-unknown} [skip ci]"
git pull --rebase origin stg
git push origin HEAD:stg

echo "GitOps stg updated; requesting a stg -> main deploy merge request."

# Project access token above must additionally carry the `api` scope (write_repository alone
# cannot call the REST API). Reused as PRIVATE-TOKEN here so no second CI variable is needed.
gitlab_base="$(printf '%s' "$GITOPS_REPOSITORY_URL" | sed -E 's#^(https?://[^/]+)/.*#\1#')"
gitlab_project_path_encoded="$(printf '%s' "$GITOPS_REPOSITORY_URL" \
  | sed -E 's#^https?://[^/]+/##; s#\.git$##; s#/#%2F#g')"
merge_requests_api="$gitlab_base/api/v4/projects/$gitlab_project_path_encoded/merge_requests"

open_deploy_mr_count="$(curl --fail --silent --show-error \
  --header "PRIVATE-TOKEN: $GITOPS_PUSH_TOKEN" \
  --get \
  --data-urlencode "state=opened" \
  --data-urlencode "source_branch=stg" \
  --data-urlencode "target_branch=main" \
  "$merge_requests_api" | jq 'length')"

if [ "$open_deploy_mr_count" -eq 0 ]; then
  curl --fail --silent --show-error \
    --header "PRIVATE-TOKEN: $GITOPS_PUSH_TOKEN" \
    --data-urlencode "source_branch=stg" \
    --data-urlencode "target_branch=main" \
    --data-urlencode "title=Deploy application ${CI_COMMIT_SHORT_SHA:-unknown}" \
    --data-urlencode "description=Automated GitOps deploy MR from Application pipeline ${CI_PIPELINE_IID:-unknown} (commit ${CI_COMMIT_SHORT_SHA:-unknown}). Review environments/prod digest changes and the Trivy report artifact on the source pipeline before approving." \
    --data-urlencode "remove_source_branch=false" \
    "$merge_requests_api" >/dev/null
  echo "Opened new GitOps deploy merge request: stg -> main"
else
  echo "An open GitOps deploy merge request (stg -> main) already covers this push; no duplicate MR created."
fi

echo "Argo CD only syncs GitOps main; the deploy merge request above must be approved and merged first."
