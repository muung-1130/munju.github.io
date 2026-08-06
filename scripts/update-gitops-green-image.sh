#!/bin/sh
set -eu

repo_dir="${1:?GitOps repository path is required}"
image_ref="${2:?Digest image reference is required}"
harbor_repository="${3:?Harbor repository name (e.g. frontend, auth-service) is required}"
green_manifest="${4:?Green manifest path relative to the GitOps repo root is required}"
blue_manifest="${5:?Blue manifest path relative to the GitOps repo root is required}"

green_path="${repo_dir}/${green_manifest}"
blue_path="${repo_dir}/${blue_manifest}"

printf '%s\n' "$image_ref" \
    | grep -Eq "^harbor\.dai-run\.internal/dai-run/${harbor_repository}@sha256:[0-9a-f]{64}\$" \
    || {
        echo "Invalid Green image digest reference for ${harbor_repository}: $image_ref" >&2
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
image_pattern="^[[:space:]]*image:[[:space:]]*harbor\.dai-run\.internal/dai-run/${harbor_repository}(:[^[:space:]]+|@sha256:[0-9a-f]{64})[[:space:]]*\$"
match_count="$(grep -Ec "$image_pattern" "$green_path")"

test "$match_count" -eq 1 || {
    echo "Expected one Green ${harbor_repository} image, found $match_count." >&2
    exit 1
}

sed -i -E \
    's#^([[:space:]]*image:[[:space:]]*)harbor\.dai-run\.internal/dai-run/'"${harbor_repository}"'(:[^[:space:]]+|@sha256:[0-9a-f]{64})[[:space:]]*$#\1'"${image_ref}"'#' \
    "$green_path"

updated_image="$(awk '$1 == "image:" {print $2}' "$green_path")"

test "$updated_image" = "$image_ref" || {
    echo "Green image update verification failed for ${harbor_repository}." >&2
    exit 1
}

blue_after="$(sha256sum "$blue_path" | awk '{print $1}')"
test "$blue_before" = "$blue_after" || {
    echo "Blue manifest changed unexpectedly: $blue_path" >&2
    exit 1
}

git -C "$repo_dir" diff --check -- "$green_manifest"

changed_files="$(git -C "$repo_dir" diff --name-only -- "$green_manifest")"
test "$changed_files" = "$green_manifest" || {
    echo "Unexpected GitOps files changed:" >&2
    printf '%s\n' "$changed_files" >&2
    exit 1
}

echo "Updated Green image for ${harbor_repository} to ${image_ref}"
