#!/usr/bin/env bash
# Restore the recorded Home only; no guessed package or uninstall/data clearing.
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${PY:-optimize/venv/bin/python}"
[[ $# -eq 0 || ( $# -eq 1 && "$1" = --screensaver ) ]] || { echo 'usage: restore.sh [--screensaver]' >&2; exit 2; }
"$PY" -I optimize/tv.py --push-b64 optimize/home-guard.sh /data/local/tmp/urtv-home-guard.sh
"$PY" -I optimize/tv.py --checked 'sh /data/local/tmp/urtv-home-guard.sh restore'
if [[ ${1:-} = --screensaver ]]; then
  "$PY" -I optimize/tv.py --checked 'sh /data/local/tmp/urtv-home-guard.sh restore-saver'
fi
echo 'Original Home verified. Both UrTV apps and all preferences retained.'
