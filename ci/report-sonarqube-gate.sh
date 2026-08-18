#!/bin/sh
set -eu

: "${SONAR_HOST_URL:?SONAR_HOST_URL is required}"
: "${SONAR_TOKEN:?SONAR_TOKEN is required}"

sonar_get() {
  path="$1"
  printf 'user = "%s:"\n' "$SONAR_TOKEN" |
    curl --config - --fail --silent --show-error "${SONAR_HOST_URL%/}${path}"
}

if gate_json="$(sonar_get "/api/qualitygates/project_status?projectKey=dai-run-application")"; then
  printf '%s\n' "$gate_json" | jq '.projectStatus | {status, conditions}'
else
  echo "Quality Gate details were unavailable; inspect the SonarQube dashboard."
fi

if period_json="$(sonar_get "/api/new_code_periods/show?project=dai-run-application")"; then
  echo "Current New Code period:"
  printf '%s\n' "$period_json" | jq '{projectKey, type, value, inherited, updatedAt}'
else
  echo "New Code period details were unavailable."
fi
