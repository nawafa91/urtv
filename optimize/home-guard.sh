#!/system/bin/sh
# No package is disabled/removed. State survives normal reboot; the watchdog PROCESS does not.
set -eu
STATE=${URTV_HOME_STATE:-/data/local/tmp/urtv-home}
SELF=${URTV_HOME_HELPER:-/data/local/tmp/urtv-home-guard.sh}
mkdir -p "$STATE"
chmod 700 "$STATE"
boot() { cat /proc/sys/kernel/random/boot_id; }
component() {
  value=$(printf '%s\n' "$1" | tail -n 1 | tr -d '\r')
  case "$value" in *[!a-zA-Z0-9_./\$]*|*/*/*|*/|/*) return 1 ;; esac
  case "$value" in */*) ;; *) return 1 ;; esac
  pkg=${value%%/*}; cls=${value#*/}
  case "$cls" in .*) cls="$pkg$cls" ;; esac
  printf '%s/%s\n' "$pkg" "$cls"
}
resolved() { component "$(cmd package resolve-activity --brief --user 0 -a android.intent.action.MAIN -c android.intent.category.HOME)"; }
foreground_is() {
  expected=$1
  for entry in $(dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity' | awk '{for(i=1;i<=NF;i++) if(index($i,"/")){gsub(/[{}]/,"",$i); print $i}}'); do
    [ "$(component "$entry")" = "$expected" ] && return 0
  done
  return 1
}
original() {
  [ -s "$STATE/original" ] || { echo 'No recorded original Home; refusing to guess.' >&2; return 1; }
  ORIGINAL=$(component "$(cat "$STATE/original")")
  case "$ORIGINAL" in sa.urtv.*/*|android/*) echo 'Invalid original Home.' >&2; return 1 ;; esac
  pm path "${ORIGINAL%%/*}" | grep -q '^package:'
}
capture() {
  current=$(resolved)
  case "$current" in sa.urtv.*/*|android/*) original; return ;; esac
  if [ -s "$STATE/original" ]; then
    original
    [ "$current" = "$ORIGINAL" ] || { echo 'Home differs from saved state; review it first.' >&2; return 1; }
  else
    printf '%s\n' "$current" > "$STATE/original.tmp"
    for key in screensaver_enabled screensaver_components screensaver_default_component; do
      settings get secure "$key" > "$STATE/$key.tmp"
      mv "$STATE/$key.tmp" "$STATE/$key"
    done
    mv "$STATE/original.tmp" "$STATE/original"
  fi
  original
  printf '%s\n' "$ORIGINAL"
}
restore_home() {
  original
  before=$(boot)
  pm enable --user 0 "${ORIGINAL%%/*}"
  cmd package set-home-activity --user 0 "$ORIGINAL"
  am start -n "$ORIGINAL"
  input keyevent KEYCODE_HOME
  # Verify preferred Home AND foreground twice before disarming.
  passed=0
  for attempt in 1 2 3 4 5; do
    sleep 2
    if [ "$(resolved)" = "$ORIGINAL" ] && foreground_is "$ORIGINAL"; then
      passed=$((passed + 1)); [ "$passed" -ge 2 ] && break
    else passed=0; fi
  done
  [ "$passed" -ge 2 ] && [ "$(boot)" = "$before" ] || { echo 'Original Home not verified; recovery remains armed.' >&2; return 1; }
  printf '%s\n' "$before" > "$STATE/restored.tmp"
  mv "$STATE/restored.tmp" "$STATE/restored"
  rm -f "$STATE/ready"
  rmdir "$STATE/lock" 2>/dev/null || true
  echo "Verified original Home: $ORIGINAL. UrTV apps and preferences retained."
}
case "${1:-}" in
  capture) capture ;;
  arm)
    original
    token=${2:?session token required}
    case "$token" in ''|*[!a-f0-9]*) exit 1 ;; esac
    [ ${#token} -eq 32 ] || exit 1
    mkdir "$STATE/lock" || { echo 'Another trial is armed; restore it first.' >&2; exit 1; }
    rm -f "$STATE/restored" "$STATE/ready"
    nohup sh "$SELF" watch "$token" "$(boot)" > "$STATE/watch.log" 2>&1 < /dev/null &
    ;;
  status)
    token=${2:?session token required}
    [ -f "$STATE/ready" ] && [ ! -f "$STATE/restored" ] || exit 1
    read -r saved pid boot_id < "$STATE/ready"
    [ "$saved" = "$token" ] && [ "$boot_id" = "$(boot)" ] && kill -0 "$pid" || exit 1
    tr '\000' ' ' < "/proc/$pid/cmdline" | grep -Fq "watch $token $boot_id"
    ;;
  watch)
    token=${2:?}; boot_id=${3:?}
    [ "$(boot)" = "$boot_id" ]
    printf '%s %s %s\n' "$token" "$$" "$boot_id" > "$STATE/ready.tmp"
    mv "$STATE/ready.tmp" "$STATE/ready"
    i=0
    while [ "$i" -lt 300 ]; do
      [ -f "$STATE/restored" ] && exit 0
      [ "$(boot)" = "$boot_id" ] || exit 1
      sleep 1; i=$((i + 1))
    done
    # Failure must leave recovery armed, retry while this boot is alive.
    while [ "$(boot)" = "$boot_id" ]; do
      sh "$SELF" restore && exit 0
      sleep 5
    done
    exit 1 ;;
  trial-status)
    sh "$SELF" status "${2:?}"
    [ "$(resolved)" = sa.urtv.home/sa.urtv.home.MainActivity ]
    foreground_is sa.urtv.home/sa.urtv.home.MainActivity
    ;;
  restore) restore_home ;;
  restore-saver)
    for key in screensaver_enabled screensaver_components screensaver_default_component; do
      [ -f "$STATE/$key" ] || { echo 'No saved screensaver state.' >&2; exit 1; }
      value=$(cat "$STATE/$key")
      if [ "$value" = null ]; then settings delete secure "$key"; else settings put secure "$key" "$value"; fi
      [ "$(settings get secure "$key")" = "$value" ] || exit 1
    done ;;
  *) echo 'usage: home-guard.sh capture|arm TOKEN|status TOKEN|restore|restore-saver' >&2; exit 2 ;;
esac
