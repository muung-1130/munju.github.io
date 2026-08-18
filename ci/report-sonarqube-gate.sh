#!/bin/sh
set -eu

: "${SONAR_HOST_URL:?SONAR_HOST_URL is required}"
: "${SONAR_TOKEN:?SONAR_TOKEN is required}"

gate_url="${SONAR_HOST_URL%/}/api/qualitygates/project_status?projectKey=dai-run-application"

if gate_json="$(printf 'user = "%s:"\n' "$SONAR_TOKEN" | curl --config - --fail --silent --show-error "$gate_url")"; then
  printf '%s\n' "$gate_json" | jq '.projectStatus | {status, conditions}'
else
  echo "Quality Gate details were unavailable; inspect the SonarQube dashboard."
fi
