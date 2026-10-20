#!/usr/bin/env bash
# The whole setup in one command, made for slow or flaky ADB: every finished step is remembered, so after
# any failure just run it again and it carries on where it stopped.
#   optimize/run.sh            do the next steps
#   optimize/run.sh status     what is done
#   SKIP_LAUNCHER=1 optimize/run.sh   keep the TV's own home screen (firmware that won't let another app be Home)
# Before: optimize/setup.sh and optimize/find-tv.sh. Optional packages the household gave up go in
# optimize/lists/mine.txt (one per line, picked from lists/tcl-optional.txt) before running.
# Results in optimize/run/: summary.md (before/after), ram-*.txt, backup.txt, report.md.
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${PY:-optimize/venv/bin/python}"
RUN=optimize/run
mkdir -p "$RUN"
tv() { "$PY" -I optimize/tv.py "$@"; }

STEPS=(probe backup keep before before-saver safe mine tweaks screensaver launcher after after-saver report)
title() {
  case "$1" in
    probe)       echo "Connect and identify the TV" ;;
    backup)      echo "Save the TV's current state" ;;
    keep)        echo "Turn protected features back on if anything turned them off" ;;
    before)      echo "Measure before (restart + 3 min)" ;;
    before-saver) echo "Measure the TV's own screensaver (1 min)" ;;
    safe)        echo "Disable telemetry, ads and demos (lists/tcl-safe.txt)" ;;
    mine)        echo "Disable the household's optional picks (lists/mine.txt)" ;;
    tweaks)      echo "Speed and memory tweaks" ;;
    screensaver) echo "Install شاشة تلفزيونك" ;;
    launcher)    echo "Install and preview home screen (original default retained)" ;;
    after)       echo "Measure after (restart + 3 min)" ;;
    after-saver) echo "Measure our screensaver (1 min)" ;;
    report)      echo "Write the report" ;;
  esac
}

if [ "${1:-}" = status ]; then
  for s in "${STEPS[@]}"; do printf '%s %s\n' "$([ -f "$RUN/.done-$s" ] && echo '✓' || echo '·')" "$(title "$s")"; done
  exit 0
fi

check_list() {   # never disable what UAD-ng rates Unsafe; show everything that is not "Recommended"
  local out
  out=$("$PY" -I optimize/check-packages.py "$1")
  echo "$out" | grep -v '^Recommended' | sed 's/^/   /' || true
  if echo "$out" | grep -q '^Unsafe'; then echo "!! $1 has a package rated Unsafe. Take it out and run again."; exit 1; fi
}

report() {
  echo "# TV setup report — $(date '+%Y-%m-%d %H:%M')"
  echo
  grep -E 'model|version.release|display.id' "$RUN/tv.txt" || true
  echo
  cat "$RUN/summary.md"
  echo
  echo "Features that must stay on:"
  for p in com.tcl.airplay2 com.google.android.apps.mediashell com.tcl.miracast com.google.android.katniss \
           com.tcl.tvinput com.android.vending com.google.android.gms; do
    if tv "pm list packages -d $p" | grep -qx "package:$p"; then echo "- !! $p is DISABLED"
    elif tv "pm list packages $p" | grep -qx "package:$p"; then echo "- ok: $p"
    fi
  done
  echo
  echo "Home: $(tv "cmd package resolve-activity --brief -c android.intent.category.HOME -a android.intent.action.MAIN" | tail -1)"
  echo "Screensaver: $(tv "settings get secure screensaver_components")"
  echo "Restore recorded Home/screensaver only (keep apps/settings): optimize/reset.sh"
}

do_step() {
  case "$1" in
    probe)       tv --probe | tee "$RUN/tv.txt" ;;
    backup)      optimize/backup.sh && cp "$(ls -t optimize/backup-*.txt | head -1)" "$RUN/backup.txt" ;;
    keep)        optimize/keep.sh | tee "$RUN/keep.txt" ;;
    before)      optimize/measure.sh before ;;
    before-saver) optimize/measure.sh before-screensaver --screensaver ;;
    safe)        check_list optimize/lists/tcl-safe.txt
                 optimize/disable.sh optimize/lists/tcl-safe.txt > /dev/null ;;
    mine)        if [ -s optimize/lists/mine.txt ]; then
                   check_list optimize/lists/mine.txt
                   optimize/disable.sh optimize/lists/mine.txt > /dev/null
                 else
                   echo "   (no lists/mine.txt: nothing optional)"
                 fi ;;
    tweaks)      optimize/tweaks.sh apply ;;
    screensaver) optimize/install.sh saver ;;
    launcher)    if [ "${SKIP_LAUNCHER:-}" = 1 ]; then echo "   skipped (SKIP_LAUNCHER=1): the TV keeps its own home screen"
                 else optimize/install.sh launcher; fi ;;
    after)       optimize/measure.sh after ;;
    after-saver) optimize/measure.sh after-screensaver --screensaver ;;
    report)      report > "$RUN/report.md"; cat "$RUN/report.md" ;;
  esac
}

for s in "${STEPS[@]}"; do
  [ -f "$RUN/.done-$s" ] && continue
  echo
  echo "▶ $(title "$s")"
  do_step "$s"
  touch "$RUN/.done-$s"
done
echo
echo "All steps done. Next: settings (optimize/saver.sh), favourites (optimize/dock.sh), photos (optimize/shot.sh)."
