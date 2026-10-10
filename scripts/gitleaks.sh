#!/bin/sh
# Runs gitleaks from a pinned container image so the pre-commit hook and CI
# always use exactly the same version. To upgrade, change IMAGE (tag and digest).
#
# Usage:
#   sh scripts/gitleaks.sh staged    scan the files staged for the next commit
#   sh scripts/gitleaks.sh history   scan the whole git history
set -eu

IMAGE="ghcr.io/gitleaks/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f"

if ! docker info >/dev/null 2>&1; then
  echo "gitleaks needs Docker, but the Docker daemon is not reachable." >&2
  echo "Start Docker and try again. CI scans every pull request regardless." >&2
  exit 1
fi

case "${1:-}" in
  staged) set -- git --pre-commit --staged ;;
  history) set -- git ;;
  *)
    echo "usage: sh scripts/gitleaks.sh staged|history" >&2
    exit 2
    ;;
esac

exec docker run --rm -v "$PWD:/repo" -w /repo "$IMAGE" "$@" --no-banner --redact --verbose /repo
