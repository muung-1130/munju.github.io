#!/bin/sh
set -eu

services_file="${CI_PROJECT_DIR:-.}/ci-output/changed-services.tsv"

if [ ! -s "$services_file" ]; then
  echo "No changed service requires unit tests."
  exit 0
fi

while IFS='|' read -r service_id _watch_paths dockerfile context _repository; do
  case "$service_id" in
    ai-assistant-service|challenge-service|crew-service|notification-service|course-stats-consumer|crew-notification-consumer)
      echo "Running Docker test target for $service_id"
      docker build --pull --target test --file "$dockerfile" --tag "dairun-test:${CI_JOB_ID:-local}-$service_id" "$context"
      ;;
    *)
      echo "No Docker test target for $service_id; production build will validate it on main."
      ;;
  esac
done <"$services_file"
