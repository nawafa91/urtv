#!/usr/bin/env bash
# Preflight EVERY requested release before ADB. Default: install + preview, retain default Home.
# Optional --trial-home is a 5-minute trial, NOT reboot-safe. No system package is disabled.
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${PY:-optimize/venv/bin/python}"
what="${1:?usage: optimize/install.sh saver|launcher|all [--trial-home]}"
case "$what" in saver|launcher|all) ;; *) echo 'Invalid install target.' >&2; exit 2 ;; esac
trial=${2:-}
[[ $# -le 2 && ( -z "$trial" || "$trial" = --trial-home ) ]] || exit 2
[[ -z "$trial" || "$what" != saver ]] || exit 2
REL=$(python3 - <<'SOURCE'
import json,re
from pathlib import Path
s=json.loads(Path('config/repository.json').read_text())
if not re.fullmatch(r'[\w.-]+/[\w.-]+',s['repository']) or not re.fullmatch(r'apk-v[1-9][0-9]*',s['release_tag']):
    raise SystemExit('Configure an explicit approved apk-vN release; latest/moving tags are refused.')
print(f"https://github.com/{s['repository']}/releases/download/{s['release_tag']}")
SOURCE
)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
apks=()
[[ "$what" = launcher ]] || apks+=(urtv-screensaver.apk)
[[ "$what" = saver ]] || apks+=(urtv-home.apk)
for apk in "${apks[@]}"; do
  if ! curl --proto '=https' --proto-redir '=https' -fSL --retry 2 --connect-timeout 15 --max-time 180 -o "$tmp/$apk" "$REL/$apk"; then
    echo "!! Published release unavailable: $REL/$apk. No TV action was started." >&2; exit 1
  fi
  python3 - "$tmp/$apk" <<'APK'
import sys,zipfile
try:
    with zipfile.ZipFile(sys.argv[1]) as z:
        if 'AndroidManifest.xml' not in z.namelist() or z.testzip(): raise ValueError('invalid APK archive')
except Exception as e: raise SystemExit(f'Invalid release APK; no TV action started: {e}')
APK
done
tv() { "$PY" -I optimize/tv.py --checked "$1"; }
helper='sh /data/local/tmp/urtv-home-guard.sh'
"$PY" -I optimize/tv.py --push-b64 optimize/home-guard.sh /data/local/tmp/urtv-home-guard.sh
tv "$helper capture"   # actual original, saved on this device BEFORE install/settings changes
for apk in "${apks[@]}"; do
  "$PY" -I optimize/tv.py --push-b64 "$tmp/$apk" "/data/local/tmp/$apk"
  out=$(tv "pm install -r /data/local/tmp/$apk")
  if ! grep -q '^Success' <<< "$out"; then
    echo "!! Install failed; no uninstall or data clearing will be attempted: $out" >&2; exit 1
  fi
  tv "rm -f /data/local/tmp/$apk"
done
if [[ "$what" != launcher ]]; then
  tv 'settings put secure screensaver_enabled 1 && settings put secure screensaver_components sa.urtv.screensaver/.ScreenDream && settings put secure screensaver_default_component sa.urtv.screensaver/.ScreenDream'
  tv "test \"\$(settings get secure screensaver_components)\" = sa.urtv.screensaver/.ScreenDream"
fi
if [[ "$what" != saver ]]; then
  if [[ "$trial" = --trial-home ]]; then
    echo 'WARNING: temporary Home trial is NOT reboot-safe; original Home stays enabled. Recovery requires power and a live watchdog.' >&2
    token=$(python3 -c 'import secrets; print(secrets.token_hex(16))')
    tv "$helper arm $token"
    armed=no
    for attempt in 1 2 3 4 5; do
      sleep 1
      if tv "$helper status $token"; then armed=yes; break; fi
    done
    [[ "$armed" = yes ]] || { echo '!! Recovery not verified. Home was not changed.' >&2; exit 1; }
    # Status + set in ONE checked remote shell: failed verification cannot reach set-home.
    tv "$helper status $token && cmd package set-home-activity --user 0 sa.urtv.home/.MainActivity"
    tv 'input keyevent KEYCODE_HOME'
    sleep 2
    tv "$helper trial-status $token"
    echo 'Trial only: recovery remains armed and restores recorded Home in 5 minutes.'
  else
    tv 'am start -n sa.urtv.home/.MainActivity'
    echo 'Preview opened. Default Home and all system packages retained.'
  fi
else tv 'am start -n sa.urtv.screensaver/.SettingsActivity'; fi
echo 'Return without removing UrTV or its settings: bash optimize/restore.sh'
