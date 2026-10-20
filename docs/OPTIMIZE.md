# Optimizing a TCL Google TV / Android TV — what we learned

From hands-on work on three TCL sets (Android 11, 12 and 14, 1.7–2.3 GB RAM, 32-bit). The tools are in `optimize/`.

## What works

| Change | Effect | How |
|---|---|---|
| Disable TCL/Google telemetry, promos and demos | +85 to +215 MB free RAM, nothing lost | `optimize/lists/tcl-safe.txt` |
| Restrict the Play Store in the background (never disable it) | its idle CPU fell from ~31% to ~6% on one set; the app still opens and updates | `optimize/tweaks.sh apply` |
| Animations at 0.5× | menus feel faster | `optimize/tweaks.sh apply` |
| At most 16 closed apps kept in memory (only lowered, never raised); cached apps frozen | more free RAM on 2 GB sets; an app not used for a while starts a little slower (not yet measured on every set) | `optimize/tweaks.sh apply` (`restore` undoes it) |
| Free storage | a set at 96–100% full was slow everywhere; app download folders (e.g. a video app's offline downloads) were the cause | check `df /sdcard` and `du -sh /sdcard/Android/data/*`; ask before deleting anything |

Judge results by `MemAvailable`, the Play Store's CPU and how the remote feels — not by load average,
which sits high on these sets from I/O wait even when idle.

## Running it

`optimize/run.sh` does the whole setup in order and remembers each finished step: over slow or dropping ADB just
run it again. Results go to `optimize/run/` (before/after table in `summary.md`, `report.md`). `optimize/reset.sh`
restores the recorded Home/screensaver selection without uninstalling apps; it does not undo debloat lists/tweaks. The ADB client (`optimize/tv.py`) retries and
reconnects by itself, uploads APKs in verified pieces that resume after a drop, and restarts the TV only through
`tv.py --reboot` (sent once, so a retry can never restart it twice).

## What must stay on

`optimize/lists/keep.txt`, enforced by `disable.sh`. In short: **AirPlay, Chromecast, screen mirroring, voice
assistant, the remote and keyboard, HDMI inputs and the tuner, the quick panel, firmware updates, the Play Store,
WebView and Google services.** One set had AirPlay, mirroring and voice disabled; those were mistakes. A set
optimized before still had voice, mirroring and firmware updates off after a reset, so `optimize/keep.sh` turns
everything in keep.txt back on; `run.sh` runs it.

## The black screen (what not to do)

Disabling the stock home (`launcherx` or `tvlauncher`) **and** the setup app (`setupwraith`) with no working
replacement leaves the TV with no home: black screen, reboot loop, and Wi-Fi did not come up for ~10 minutes,
so ADB was gone too. Recovery needed someone at the TV to rejoin Wi-Fi from the remote.

The old disable-stock-home workflow has been retired. `install.sh` defaults to installation and preview,
keeping the original default Home enabled. `--trial-home` verifies a live watchdog and boot identity before
changing Home for a five-minute trial, and NEVER disables stock Home or setup packages. The watchdog is a
shell process: power loss/reboot kills it. A trial is therefore NOT reboot-safe. Restore uses the exact
recorded component, verifies preferred and foreground Home, and only then disarms recovery.
`restore.sh` / `reset.sh` retain UrTV and preferences. See [TCL readiness](TCL-READINESS.md).
