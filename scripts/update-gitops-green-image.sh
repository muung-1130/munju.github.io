#!/bin/sh
set -eu

repo_dir="${1:?GitOps repository path is required}"
image_ref="${2:?Digest image reference is required}"
green_manifest="environments/dev/deployment-green.yaml"
blue_manifest="environments/dev/deployment.yaml"
green_path="${repo_dir}/${green_manifest}"
blue_path="${repo_dir}/${blue_manifest}"

printf '%s\n' "$image_ref" \
    | grep -Eq '^harbor\.dai-run\.internal/dai-run/frontend@sha256:[0-9a-f]{64}$' \
    || {
        echo "Invalid Green image digest reference: $image_ref" >&2
        exit 1
    }

test -d "${repo_dir}/.git" || {
    echo "Not a Git repository: $repo_dir" >&2
    exit 1
}
test -f "$green_path" || {
    echo "Green manifest not found: $green_path" >&2
    exit 1
}
test -f "$blue_path" || {
    echo "Blue manifest not found: $blue_path" >&2
    exit 1
}

blue_before="$(sha256sum "$blue_path" | awk '{print $1}')"
image_pattern='^[[:space:]]*image:[[:space:]]*harbor\.dai-run\.internal/dai-run/frontend(:[^[:space:]]+|@sha256:[0-9a-f]{64})[[:space:]]*$'
match_count="$(grep -Ec "$image_pattern" "$green_path")"

test "$match_count" -eq 1 || {
    echo "Expected one Green frontend image, found $match_count." >&2
    exit 1
}

sed -i -E \
    's#^([[:space:]]*image:[[:space:]]*)harbor\.dai-run\.internal/dai-run/frontend(:[^[:space:]]+|@sha256:[0-9a-f]{64})[[:space:]]*$#\1'"${image_ref}"'#' \
    "$green_path"

updated_image="$(awk '$1 == "image:" {print $2}' "$green_path")"

test "$updated_image" = "$image_ref" || {
    echo "Green image update verification failed." >&2
    exit 1
}

blue_after="$(sha256sum "$blue_path" | awk '{print $1}')"
test "$blue_before" = "$blue_after" || {
    echo "Blue manifest changed unexpectedly." >&2
    exit 1
}

git -C "$repo_dir" diff --check

changed_files="$(git -C "$repo_dir" diff --name-only)"
test "$changed_files" = "$green_manifest" || {
    echo "Unexpected GitOps files changed:" >&2
    printf '%s\n' "$changed_files" >&2
    exit 1
}

echo "Updated Green image to ${image_ref}"
