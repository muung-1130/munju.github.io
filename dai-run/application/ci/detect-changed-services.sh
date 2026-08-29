#!/bin/sh
set -eu

mapping_file="${CI_PROJECT_DIR:-.}/ci/services.tsv"
output_dir="${CI_PROJECT_DIR:-.}/ci-output"
changed_file="$output_dir/changed-files.txt"
services_file="$output_dir/changed-services.tsv"

install -d -m 700 "$output_dir"
: >"$changed_file"
: >"$services_file"

select_service() {
  service_id="$1"
  selected="$(awk -F '|' -v id="$service_id" '$1 == id { print; found=1 } END { if (!found) exit 1 }' "$mapping_file")" || {
    echo "Unknown service in FORCE_SERVICES: $service_id" >&2
    exit 1
  }
  printf '%s\n' "$selected" >>"$services_file"
}

if [ -n "${FORCE_SERVICES:-}" ]; then
  if [ "$FORCE_SERVICES" = "all" ]; then
    awk 'NF && $1 !~ /^#/' "$mapping_file" >"$services_file"
  else
    old_ifs="$IFS"
    IFS=','
    for service_id in $FORCE_SERVICES; do
      IFS="$old_ifs"
      select_service "$service_id"
      IFS=','
    done
    IFS="$old_ifs"
  fi
else
  after="${CI_COMMIT_SHA:-HEAD}"
  before="${CI_MERGE_REQUEST_DIFF_BASE_SHA:-${CI_COMMIT_BEFORE_SHA:-}}"

  case "$before" in
    ''|0000000000000000000000000000000000000000)
      before="$(git rev-parse "${after}^" 2>/dev/null || git hash-object -t tree /dev/null)"
      ;;
  esac

  git diff --name-only "$before" "$after" | LC_ALL=C sort -u >"$changed_file"

  while IFS='|' read -r service_id watch_paths dockerfile context repository; do
    case "$service_id" in
      ''|'#'*) continue ;;
    esac

    matched=false
    old_ifs="$IFS"
    IFS=','
    for watch_path in $watch_paths; do
      IFS="$old_ifs"
      while IFS= read -r changed_path; do
        case "$watch_path" in
          */)
            case "$changed_path" in
              "$watch_path"*) matched=true ;;
            esac
            ;;
          *)
            [ "$changed_path" = "$watch_path" ] && matched=true
            ;;
        esac
      done <"$changed_file"
      [ "$matched" = true ] && break
      IFS=','
    done
    IFS="$old_ifs"

    [ "$matched" = true ] && printf '%s|%s|%s|%s|%s\n' \
      "$service_id" "$watch_paths" "$dockerfile" "$context" "$repository" >>"$services_file"
  done <"$mapping_file"
fi

LC_ALL=C sort -u "$services_file" -o "$services_file"

echo "Changed files: $(wc -l <"$changed_file" | tr -d ' ')"
if [ -s "$services_file" ]; then
  echo "Selected services:"
  cut -d '|' -f 1 "$services_file" | sed 's/^/  - /'
else
  echo "Selected services: none"
fi
