#!/bin/sh
case "$1" in
  *sername*) printf '%s\n' "${GITOPS_PUSH_USERNAME:-oauth2}" ;;
  *assword*) printf '%s\n' "${GITOPS_PUSH_TOKEN:?GITOPS_PUSH_TOKEN is required}" ;;
  *) exit 1 ;;
esac
