#!/bin/sh
set -eu

project_dir="${CI_PROJECT_DIR:-.}"
services_file="$project_dir/ci-output/changed-services.tsv"
updates_file="$project_dir/ci-output/image-updates.tsv"
registry="${ECR_REGISTRY:?ECR_REGISTRY is required}"

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

aws sts get-caller-identity --query Account --output text
aws ecr get-login-password --region "$AWS_DEFAULT_REGION" \
  | docker login --username AWS --password-stdin "$registry"

image_tag="gitlab-${CI_COMMIT_SHORT_SHA:-local}-${CI_PIPELINE_IID:-0}"

while IFS='|' read -r service_id _watch_paths dockerfile context repository; do
  image="$registry/$repository:$image_tag"
  echo "Building $service_id -> $image"
  docker build --pull --file "$dockerfile" --tag "$image" "$context"
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

git clone --branch main --single-branch "$GITOPS_REPOSITORY_URL" "$gitops_dir"
"$project_dir/ci/update-gitops-images.sh" "$gitops_dir" "$updates_file"

cd "$gitops_dir"
git diff --check

for environment in frontend backend ai; do
  if command -v kubectl >/dev/null 2>&1; then
    kubectl kustomize "environments/prod/$environment" >/dev/null
  fi
done

if git diff --quiet; then
  echo "GitOps already contains the requested digests."
  exit 0
fi

git config user.name "DAI RUN GitLab CI"
git config user.email "gitlab-ci@dai-run.internal"
git add environments/prod
git commit -m "Deploy application ${CI_COMMIT_SHORT_SHA:-unknown} [skip ci]"
git pull --rebase origin main
git push origin HEAD:main

echo "GitOps main updated; Argo CD auto sync will deploy the new digests."
