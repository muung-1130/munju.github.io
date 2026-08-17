#!/bin/sh
set -eu

repo_dir="${1:?GitOps repository path is required}"
image_ref="${2:?Digest image reference is required}"
new_harbor_repository="${3:?New Harbor repository name (matches the dev image Jenkins builds, e.g. crew-service) is required}"
old_harbor_repository="${4:?Harbor repository name currently referenced in the prod manifest (e.g. dir-crew) is required}"
manifest="${5:?Prod manifest path relative to the GitOps repo root is required}"

manifest_path="${repo_dir}/${manifest}"

printf '%s\n' "$image_ref" \
    | grep -Eq "^harbor\.dai-run\.internal/dai-run/${new_harbor_repository}@sha256:[0-9a-f]{64}\$" \
    || {
        echo "Invalid digest image reference for ${new_harbor_repository}: $image_ref" >&2
        exit 1
    }

test -d "${repo_dir}/.git" || {
    echo "Not a Git repository: $repo_dir" >&2
    exit 1
}
test -f "$manifest_path" || {
    echo "Prod manifest not found: $manifest_path" >&2
    exit 1
}

# Accepts either the pre-migration repository name (old_harbor_repository,
# e.g. dir-crew) or the post-migration one (new_harbor_repository, e.g.
# crew-service) so this stays idempotent across the one-time repository-name
# switch: the first run matches the old name and rewrites it to the new one,
# every run after that matches the new name it just wrote.
image_pattern="^[[:space:]]*image:[[:space:]]*harbor\.dai-run\.internal/dai-run/(${old_harbor_repository}|${new_harbor_repository})(:[^[:space:]]+|@sha256:[0-9a-f]{64})[[:space:]]*\$"
match_count="$(grep -Ec "$image_pattern" "$manifest_path")"

test "$match_count" -eq 1 || {
    echo "Expected one ${old_harbor_repository}/${new_harbor_repository} image line in ${manifest}, found $match_count." >&2
    exit 1
}

sed -i -E \
    's#^([[:space:]]*image:[[:space:]]*)harbor\.dai-run\.internal/dai-run/('"${old_harbor_repository}"'|'"${new_harbor_repository}"')(:[^[:space:]]+|@sha256:[0-9a-f]{64})[[:space:]]*$#\1'"${image_ref}"'#' \
    "$manifest_path"

updated_image="$(awk '$1 == "image:" {print $2}' "$manifest_path")"

test "$updated_image" = "$image_ref" || {
    echo "Prod image update verification failed for ${manifest}." >&2
    exit 1
}

echo "Updated prod image for ${manifest} to ${image_ref}"
