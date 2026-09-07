#!/usr/bin/env bash
set -euo pipefail
[[ -z "${INPUT_TAG:-}" || "$INPUT_TAG" == "sha-$GITHUB_SHA" ]] || { echo "Image and workflow commit differ"; exit 1; }
case "${DEPLOY_ENV:-}" in
  staging) [[ "$GITHUB_REF" == refs/heads/staging ]] ;;
  production)
    [[ "$GITHUB_REF" == refs/tags/v* ]]
    git merge-base --is-ancestor "$GITHUB_SHA" origin/main
    [[ "$(gh release view "$GITHUB_REF_NAME" --json isDraft,publishedAt --jq '.isDraft == false and .publishedAt != null')" == true ]]
    ;;
  *) exit 1 ;;
esac
