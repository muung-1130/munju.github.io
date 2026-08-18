#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_DIR="$ROOT_DIR/services/environment-dynamodb-consumer"
AWS_REGION="${AWS_REGION:-ap-northeast-2}"
AWS_PROFILE="${AWS_PROFILE:-}"
REPOSITORY="${ECR_REPOSITORY:-dai-run/dir-environment-consumer}"
TAG="${1:-$(git -C "$ROOT_DIR" rev-parse --short=12 HEAD 2>/dev/null || date -u +%Y%m%dT%H%M%SZ)}"
AWS_ARGS=(--region "$AWS_REGION")
if [[ -n "$AWS_PROFILE" ]]; then AWS_ARGS+=(--profile "$AWS_PROFILE"); fi

AWS_ACCOUNT_ID="$(aws "${AWS_ARGS[@]}" sts get-caller-identity --query Account --output text)"
REGISTRY="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
IMAGE="$REGISTRY/$REPOSITORY:$TAG"

aws "${AWS_ARGS[@]}" ecr describe-repositories --repository-names "$REPOSITORY" >/dev/null
aws "${AWS_ARGS[@]}" ecr get-login-password | docker login --username AWS --password-stdin "$REGISTRY"
docker build --pull -t "$IMAGE" "$SERVICE_DIR"
docker push "$IMAGE"
mkdir -p "$ROOT_DIR/dist"
printf '%s\n' "$IMAGE" > "$ROOT_DIR/dist/environment-consumer-image-uri.txt"
echo "Pushed immutable image: $IMAGE"
