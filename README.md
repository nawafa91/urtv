<p align="center"><img src=".github/brand/hero.png" alt="تلفزيونك · UrTV" width="100%"></p>

<h1 align="center">تلفزيونك · UrTV</h1>

<p align="center" dir="rtl">واجهة رئيسية عربية وشاشة توقف سعودية لتلفزيونات Android TV و Google TV، وتسريع آمن للتلفزيون.<br>يركّبها لك مساعد ذكاء اصطناعي بأمر واحد.</p>

<p align="center">An Arabic home screen and a Saudi screensaver for Android TV / Google TV, and a safe speed-up.<br>Your AI agent sets it all up.</p>

<p align="center"><img src=".github/screens/before-after-home.jpg" alt="Before: Google TV home. After: the تلفزيونك home screen" width="100%"></p>
<p align="center"><img src=".github/screens/before-after-screensaver.jpg" alt="Before: the Google screensaver. After: شاشة تلفزيونك" width="100%"></p>

<div dir="rtl">

## ركّبه بمساعد الذكاء الاصطناعي

1. **على التلفزيون:** الإعدادات ← النظام ← حول ← اضغط OK على **Build** سبع مرات ← خيارات المطوّر ← شغّل
   **USB debugging** (و**Network debugging** إن وُجد).
2. **على كمبيوتر في نفس شبكة الواي فاي**، افتح أي مساعد ذكاء اصطناعي يقدر يشغّل أوامر، والصق:

   > ركّب تلفزيوني من https://github.com/nawafa91/urtv: انسخ المستودع واتبع `docs/SETUP-PROMPT.md` خطوة بخطوة.

وبس. المساعد يتصل بالتلفزيون، ويحفظ أول 6 تطبيقات مفضلة من واجهتك الحالية، ويسألك كل الأسئلة مرة وحدة: مدينتك،
والأندية اللي تتابع مبارياتها، ووش يطلع جنب الساعة (آية وحديث، جديد المسلسلات، مواقيت الصلاة…)، ووش ما تستخدمه أبداً.
بعدها يكمل الباقي في حوالي 40 دقيقة، ويقيس الذاكرة قبل وبعد.

**تهيئة الفرع المستقل:** التثبيت العادي يفتح معاينة دون تغيير Home أو تعطيل حزم النظام.
التجربة المؤقتة اختيارية، وحمايتها غير مضمونة بعد إعادة التشغيل. الرجوع يحافظ على التطبيقين
وإعداداتهما. راجع [جاهزية TCL](docs/TCL-READINESS.md) قبل استخدام أدوات التثبيت القديمة.

</div>

## Set it up with your AI agent

1. **On the TV:** Settings → System → About → press OK on **Build** 7 times → Developer options → turn on
   **USB debugging** (and **Network debugging** if listed).
2. **On a computer on the same Wi-Fi**, open any AI agent that can run commands, and paste:

   > Set up my TV with https://github.com/nawafa91/urtv: clone it and follow `docs/SETUP-PROMPT.md` step by step.

That's it. The agent connects, keeps your 6 favourite apps from the current home screen, asks a few questions in
one go (your city, the clubs whose games you follow, what goes beside the clock: verse and hadith, new episodes,
prayer times…, and what you never use), then does the rest in about 40 minutes, measuring memory before and after.
The full prompt is in [docs/SETUP-PROMPT.md](docs/SETUP-PROMPT.md) if you want to read or adapt it.

**Independent branch:** the installer defaults to preview without changing Home or disabling system packages.
The optional temporary Home trial is NOT reboot-safe. Rollback keeps UrTV and its settings.
Read [TCL readiness](docs/TCL-READINESS.md) before using the legacy optimization workflow.

**Make your own:** to build a different screen or port it to another TV, give your agent this repo and
[docs/RECREATE-PROMPT.md](docs/RECREATE-PROMPT.md) (the full design and behaviour spec).

## What you get

| | | |
|---|---|---|
| **شاشة تلفزيونك** · screensaver | Clock, Hijri date, prayer times and iqama, Ramadan, your teams' matches, weather, markets, and beside the clock your choice of new episodes, today's prayers, the 5-day forecast, all your teams' games, or a verse/hadith of the day, over Saudi landscapes | `urtv-screensaver.apk` |
| **تلفزيونك** · home screen | Clean Arabic launcher: favourites row (5–10 apps) arranged in «ترتيب المفضلة», all apps, inputs, Wi-Fi, settings; optional card from the screensaver (off by default) | `urtv-home.apk` |
| **Speed-up** | Telemetry, ads and demos off (reversibly), fewer apps kept in memory, Play Store kept from running in the background, faster animations | `optimize/` |

**Installable builds:** require an approved, signed `apk-vN` release configured in `config/repository.json`.
No release is published by CI; unavailable APKs stop the installer before ADB is contacted.

## For agents and scripts

Everything is scriptable over ADB, made for slow Wi-Fi (retries, resumable uploads, every step remembered):

| | |
|---|---|
| `optimize/run.sh` | the whole setup; run again after any failure to continue · `status` |
| `optimize/saver.sh` | screensaver settings: `city`, `teams`, `find-team`, `card`, `home-card`, `update`, `show` |
| `optimize/dock.sh` | favourites row: `apps`, `set`, `show`, `reset` |
| `optimize/measure.sh` · `shot.sh` | memory before/after (restart + settle) · screenshots without navigating |
| `optimize/keep.sh` | turn back on anything protected (AirPlay, casting, voice, updates…) that something turned off |
| `optimize/reset.sh` | restore recorded Home/screensaver selection; keep both apps and their settings |

What we learned on real TCL sets, and what must stay on: [docs/OPTIMIZE.md](docs/OPTIMIZE.md). Manual test plan:
[docs/TEST-PLAN.md](docs/TEST-PLAN.md).

## For developers

```
src/template.html     the screen (HTML/CSS/JS, no framework); edit this, then run src/build.py
src/build.py          builds the two pages in dist/
dist/urtv.html        stand-alone page, fonts and photos inlined: open in any browser (F = full screen), works offline
dist/tv.html          light page the Android app loads (0.1 MB); the app serves fonts and photos from disk
android/app           the screensaver app (sa.urtv.screensaver): DreamService, settings, auto-update
android/launcher      the home screen (sa.urtv.home)
assets/               fonts, bundled photos, Arabic team names, verse and hadith texts
photos/               the hosted photo set (5 shown per 4 days, rotating every 30 min)
optimize/             TV tools (Python ADB client, no adb binary needed); lists/ says what may be turned off
docs/                 the agent prompts (setup, recreate), what we learned on real TVs, test plan, photo credits
.github/              CI: APK builds, checks, data tools (verses, hadith, clubs, photos), README images
tests/run.sh          every check: build, data, fonts, scripts, private data, flaky-ADB upload, the screen in a browser
```

GitHub Actions builds unsigned APKs for validation without publishing a release; `tests/run.sh` runs
on every push too. Independent sources, external signing and migration: [docs/INDEPENDENT-SETUP.md](docs/INDEPENDENT-SETUP.md). Local Android build (needs the SDK): `python3 src/build.py && gradle -p android assembleRelease`.

**Screen settings** come from the URL fragment (works on `file://` and in WebView):

```
urtv.html#city=جدة&lat=21.5433&lon=39.1728&tz=Asia/Riyadh&teams=136013,136137&panel=prayers
```

`teams`: up to 10 TheSportsDB ids in priority order. `panel`: the card beside the clock: `shows`, `prayers`,
`forecast`, `matches`, `verse` or `none`. Also `genres`, `langs`, `shows`, `minrating` for the episodes card.

**Data** (free, no keys): Aladhan (prayer times, Umm al-Qura), Open-Meteo (weather), Yahoo and CoinGecko (markets),
TVMaze (episodes), TheSportsDB (matches). Everything fails soft: offline, the clock, dates, prayer and Ramadan
countdowns still work and the last good data stays on screen. A finished game's score stays up for a day.

**Verse and hadith texts are never typed by hand:** verses come from the Quran API via CI
(`.github/tools/fetch_verses.py`); each hadith is checked by CI (`.github/tools/verify_hadith.py`) against the
Arabic text of the six Sunni books, and only those found are shown, with the books as the source line.

**The Android apps** update the screen page from this repo every 6 hours (so it must stay public), start fast
(the page shows once the clock, saved panels and photo are ready), and come back after a power cut.

## Credits

Photos: Unsplash photographers, listed in [docs/PHOTO-CREDITS.md](docs/PHOTO-CREDITS.md). Fonts: Thmanyah, and
Noto Naskh Arabic for ﷺ ﴿﴾ (OFL, `assets/fonts/`).
Home screen adapted from [mihirgupta0900/tv-home](https://github.com/mihirgupta0900/tv-home) (MIT,
`android/launcher/LICENSE-tv-home`). Package ratings from [UAD-ng](https://github.com/Universal-Debloater-Alliance/universal-android-debloater-next-generation).

Upstream project: [tshi-dev/UrTV](https://github.com/tshi-dev/UrTV). This fork keeps upstream attribution and reviews upstream changes separately.
