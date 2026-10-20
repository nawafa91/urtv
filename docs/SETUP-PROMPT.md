> Independent branch safety rules: [TCL-READINESS.md](TCL-READINESS.md) supersedes the legacy workflow below.
> Do not run the full optimization workflow for a preview. The installer never disables original Home,
> defaults to preview, requires a published signed apk-vN release, and has no reboot-safe Home switch.
> reset/restore retain both apps and settings; they do not undo debloat/tweaks.

# Set up a TV with تلفزيونك: the prompt for your AI agent

**On the TV first:** Settings → System → About → press OK on **Build** 7 times → back → Developer options →
turn on **USB debugging** (and **Network debugging** if it is listed). Keep the TV on.

**Then** open any AI agent that can run commands, on a computer on the **same Wi-Fi** as the TV, and paste
everything below the line.

---

Set up my Android TV / Google TV with **تلفزيونك** from https://github.com/nawafa91/urtv: a faster TV
(bloat off, safely), an Arabic home screen, and the screensaver «شاشة تلفزيونك». Talk to me in Arabic (or my
language); keep commands in English.

## Rules (protective layer: these win over everything else here)

- Use only the scripts in `optimize/`. They are made for slow, dropping ADB over Wi-Fi: they retry by themselves
  and remember progress. **If a command fails, run the same command again.** Don't write your own adb loops.
- One command at a time: never run two scripts against the TV at once, or in the background while you run another.
- Long commands (`run.sh`, `measure.sh`, `--reboot`) can be silent for 5 minutes. Give them a long timeout (40
  minutes for `run.sh`). If your tool kills one anyway, nothing is lost: run the same command again, it continues.
- Never send `reboot` as a shell command. Restart only with `optimize/venv/bin/python -I optimize/tv.py --reboot`.
- Never disable anything in `optimize/lists/keep.txt` (AirPlay, Chromecast, mirroring, voice, remote, inputs,
  tuner, firmware updates, Play Store, Google services), and never edit `keep.txt` to get past a refusal. Never
  disable the TV's own home screen or setup app yourself; the installer also keeps them enabled.
- Never uninstall system apps, never `pm clear`, never factory-reset, never touch accounts, Wi-Fi, network or
  developer settings (turning ADB off locks us out). Never delete `optimize/run/` or `optimize/backup-*.txt`: they
  are how we undo. `optimize/reset.sh` restores recorded Home/screensaver selection without removing UrTV; debloat/tweaks need separate review.
- Ask me before anything not in this prompt. If something fails twice, stop, show me the output, propose a fix.
- Never tell me something worked without its proof: the script's own success line, or a screenshot you looked at.

## When something goes wrong (expected, and what to do)

Lines starting with `!!` are the scripts telling you to stop and act. These are the ones we have seen:

| You see | It means | Do |
|---|---|---|
| `(connection problem: …; retrying in 5s)` | Wi-Fi ADB dropped for a moment | nothing, it retries by itself |
| `resuming upload at 40%` | an earlier upload was cut off | nothing, it continues and checks the file |
| no output for several minutes | a restart, or the 3-minute settle before measuring | wait; don't interrupt |
| the first connection hangs for up to 2 minutes | the TV is showing «Allow USB debugging?» | ask me to press Allow and tick «Always allow» |
| `Don't know your TV's IP` | `find-tv.sh` was not run or found nothing | `optimize/find-tv.sh`, or ask me for the IP (TV: Settings → Network) and use `TV_HOST=<ip>` |
| `No TV with ADB open` | debugging off, TV asleep, or the computer is on another (guest) Wi-Fi | ask me to check all three, then `optimize/find-tv.sh` again |
| `!! TV not answering after 4 tries` | TV went to standby, lost Wi-Fi, or got a new IP | ask me to wake the TV; run `optimize/find-tv.sh` if the IP may have changed; then the same command |
| `!! TV did not come back within 5 minutes` | slow restart, or it stayed in standby | ask me to turn it on, then `optimize/venv/bin/python -I optimize/tv.py --wait`, then the same command |
| `!! upload keeps failing` or `md5 mismatch` | bad Wi-Fi or the TV's storage is full | the same command once; if again, `optimize/venv/bin/python -I optimize/tv.py "df -h /data"` and show me |
| `Refusing: these are in …keep.txt` | a protected package got into `mine.txt` | take that line out of `mine.txt`, run again |
| `!! … has a package rated Unsafe` | `mine.txt` has a package the TV may need | take it out of `mine.txt`, run again |
| `Unknown package` or `not installed` while disabling | that package is not on this model | nothing, normal |
| `An older … signed with another key is installed` | an older build of our app | nothing, it reinstalls; redo step 4 for that app |
| `!! Install of … failed` | usually storage, or a very old Android | stop and show me |
| `!! The safety switch put the stock home back` | ADB was slower than the 5-minute switch | nothing is broken: the same command again |
| `!! Home did not open the new launcher` | slow ADB, or firmware that pins its own home | leave the TV 5 minutes; `optimize/run.sh` once more; if again, `SKIP_LAUNCHER=1 optimize/run.sh` |
| `!! The stock home is not on screen` (reset) | the stock home was slow to start | ask me to press Home, then `optimize/reset.sh` again |
| `!! still off` (keep.sh) | a protected feature would not turn back on | **stop**, show me; don't continue |
| the TV's own screensaver screenshot is black | Android hides it from screenshots | expected; ours can be shot |
| our screensaver shot has no weather or matches yet | data still loading | `optimize/saver.sh update`, wait a minute, shoot again |
| `find-team` finds nothing | TheSportsDB uses English names | try the English name, without «FC», or the city (e.g. `Hilal`, `Saudi Arabia`) |
| `optimize/run.sh status` has no «protected features» step | an old copy of this repo | `git pull`, then `optimize/run.sh` |

Anything else, or anything twice: stop, show me the output and what you think it is.

## 1. Connect and look (5 minutes)

```
git clone https://github.com/nawafa91/urtv; cd urtv && git pull   # always the latest
optimize/setup.sh
optimize/find-tv.sh                       # accept "Allow USB debugging?" on the TV, tick "Always allow"
optimize/venv/bin/python -I optimize/tv.py --probe
optimize/shot.sh home my-apps
```
Tell me the model and Android version. Look at `optimize/run/shots/my-apps.png` and write down the first **6 apps**
of my apps / favourites row, left to right, by name: they become the favourites of the new home screen in step 4.
Only then, if this TV was set up with these tools before (also older versions, whose apps are `sa.yourtv.*` or `com.abdullah.*`),
run `optimize/reset.sh` so we start like new.

## 2. My choices (5 minutes, with me, all at once so the rest runs on its own)

Ask me these together, in plain Arabic, and write the answers down:
1. **My city** (for prayer times, weather and the clock line).
2. **My favourite clubs** (and national team) whose games I want to follow (up to 10, most important first).
3. **Beside the clock on the screensaver:** «آية أو حديث اليوم», «جديد المسلسلات», «مواقيت الصلاة اليوم»,
   «طقس الأيام القادمة», «مباريات فرقي القادمة», or nothing. If episodes: which genres and languages I like.
4. **The same card on the home screen too?** (off unless I say so)
5. **After how many minutes** the screensaver should start.
6. **What I never use**, from `optimize/lists/tcl-optional.txt`, group by group in plain words (the TCL tab and
   channels, the game bar, T-Cast, accessory updates, Google TV / Play Movies, YouTube Music, region leftovers).
   Copy the package lines of what I give up into `optimize/lists/mine.txt`; if I keep everything, skip it.

Read my 6 apps from step 1 back to me and let me swap any.

## 3. Run it (20–30 minutes, the TV restarts twice)

```
optimize/run.sh
```
It saves the TV's state, measures memory and the TV's own screensaver, disables telemetry/ads/demos and my picks,
applies the speed and memory tweaks, installs the screensaver and the home screen (behind the safety switch),
measures again and writes `optimize/run/report.md`. If it stops for any reason: `optimize/run.sh` again (it
continues), and `optimize/run.sh status` shows where it is.

If the home-screen step says Home did not switch, leave the TV alone for 5 minutes (the stock home comes back by
itself) and tell me. Some TCL firmware keeps its own home: then `SKIP_LAUNCHER=1 optimize/run.sh`.

## 4. Apply my choices (5 minutes; no remote needed)

```
optimize/saver.sh cities                          # find my city, then: optimize/saver.sh city <name>   (or: city <name> <lat> <lon>)
optimize/saver.sh find-team <club>                # for each club, then: optimize/saver.sh teams <id:Name> <id:Name> ...  (my order)
optimize/saver.sh card <verse|shows|prayers|forecast|matches|none>        # beside the clock
optimize/saver.sh home-card <verse|shows|prayers|forecast|matches|none>   # home screen (none unless I said yes)
optimize/dock.sh apps                             # match my 6 apps to packages, then: optimize/dock.sh set <pkg> ... (in my order)
optimize/venv/bin/python -I optimize/tv.py "settings put system screen_off_timeout <minutes × 60000>"
optimize/saver.sh update
optimize/saver.sh show ; optimize/dock.sh show    # read it back to me
```
If I chose episodes: `optimize/saver.sh genres <Drama,Comedy,...>` and `optimize/saver.sh langs <Arabic,English,...>`
(only what I asked for; nothing = all). `optimize/saver.sh` without arguments lists the names.

## 5. Check (5 minutes)

```
optimize/shot.sh home
optimize/shot.sh screensaver
```
Look at both screenshots (in `optimize/run/shots/`) and describe them to me. Then with me: press Home inside an
app (it must come back to the new home), and try AirPlay or Cast from a phone once.

## 6. Before you tell me it's done

Check each, and fix or report what fails:
```
optimize/keep.sh                                  # must end with «Protected features: all on.»
optimize/run.sh status                            # every step ✓
grep '!!' optimize/run/report.md || echo none     # must print «none»
```
- `report.md` shows Home as `sa.urtv.home` (or the stock home if we used `SKIP_LAUNCHER=1`) and the screensaver
  as `sa.urtv.screensaver`.
- You looked at the step 5 screenshots yourself and they show my city, my card and my favourites.
- I tried voice from the remote and casting from a phone, and both work.

## 7. Tell me

- The before/after table from `optimize/run/report.md` and its feature check.
- What was disabled, my settings, and anything that looked wrong or slow.
- Undo, any time: `optimize/reset.sh`.
