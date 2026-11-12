#!/usr/bin/env bash
# Install Playwright Chromium for GitHub Actions.
#
# `playwright install --with-deps` also apt-installs extra CJK fonts from
# Ubuntu archives. Those mirrors flake on DNS (Temporary failure resolving
# security.ubuntu.com / azure.archive.ubuntu.com) and fail the whole verify
# job after product tests already passed. Download the browser binary first
# (required). OS packages are best-effort: GitHub-hosted Ubuntu already has
# the libraries Chromium needs for the isolated journey.
set -euo pipefail

n=0
until npx playwright install chromium; do
  n=$((n + 1))
  if [ "$n" -ge 4 ]; then
    echo "playwright install chromium failed after $n attempts" >&2
    exit 1
  fi
  sleep $((n * 8))
done

if ! npx playwright install-deps chromium; then
  echo "note: playwright install-deps failed (often apt DNS). Continuing with the Chromium binary."
fi
