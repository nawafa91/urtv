#!/usr/bin/env bash
# Compatibility entry point: reset now means non-destructive rollback, never uninstall.
set -euo pipefail
exec bash "$(dirname "$0")/restore.sh" --screensaver "$@"
