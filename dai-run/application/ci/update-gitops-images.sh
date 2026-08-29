#!/bin/sh
set -eu

gitops_dir="${1:?gitops directory is required}"
updates_file="${2:?updates file is required}"
registry="${ECR_REGISTRY:?ECR_REGISTRY is required}"
prod_dir="$gitops_dir/environments/prod"

[ -d "$prod_dir" ] || {
  echo "GitOps production directory not found: $prod_dir" >&2
  exit 1
}

while IFS='|' read -r repository digest; do
  [ -n "$repository" ] || continue
  if ! printf '%s\n' "$digest" | grep -Eq '^sha256:[0-9a-f]{64}$'; then
    echo "Invalid digest for $repository: $digest" >&2
    exit 1
  fi

  image="$registry/$repository"
  matched=false

  for manifest in $(grep -RIl --include='*.yaml' --include='*.yml' "$image" "$prod_dir"); do
    if grep -Eq "${image}(@sha256:[0-9a-f]{64}|:[A-Za-z0-9._-]+)" "$manifest"; then
      sed -E -i "s#${image}(@sha256:[0-9a-f]{64}|:[A-Za-z0-9._-]+)#${image}@${digest}#g" "$manifest"
      matched=true
    fi
  done

  [ "$matched" = true ] || {
    echo "No production image reference found for $image" >&2
    exit 1
  }

  if grep -RIn --include='*.yaml' --include='*.yml' "$image" "$prod_dir" | grep -Fv "$image@$digest"; then
    echo "Not every production reference was updated for $image" >&2
    exit 1
  fi

  echo "Pinned $image@$digest"
done <"$updates_file"
