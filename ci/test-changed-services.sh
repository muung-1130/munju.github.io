#!/bin/sh
set -eu

services_file="${CI_PROJECT_DIR:-.}/ci-output/changed-services.tsv"

if [ ! -s "$services_file" ]; then
  echo "No changed service requires unit tests."
  exit 0
fi

while IFS='|' read -r service_id _watch_paths dockerfile context _repository; do
  case "$service_id" in
    ai-dashboard)
      echo "Running Docker test target for $service_id"
      test_tag="dairun-test:${CI_JOB_ID:-local}-$service_id"
      docker build --pull --target test --file "$dockerfile" --tag "$test_tag" "$context"
      container_id=$(docker create "$test_tag")
      mkdir -p "${CI_PROJECT_DIR:-.}/ci-output/ai-dashboard-test"
      docker cp "$container_id:/app/coverage" "${CI_PROJECT_DIR:-.}/ci-output/ai-dashboard-test/coverage"
      docker rm "$container_id" >/dev/null
      ;;
    ai-assistant-service|challenge-service|crew-service|notification-service|course-stats-consumer|crew-notification-consumer)
      echo "Running Docker test target for $service_id"
      docker build --pull --target test --file "$dockerfile" --tag "dairun-test:${CI_JOB_ID:-local}-$service_id" "$context"
      ;;
    *)
      echo "No Docker test target for $service_id; production build will validate it on main."
      ;;
  esac
done <"$services_file"
