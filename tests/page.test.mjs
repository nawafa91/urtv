// Screen tests in a real browser, offline: both pages, every card, card-only mode, old settings links.
//
//   npm install playwright@1.56.1 && npx playwright install chromium     (once)
//   node tests/page.test.mjs
//
// Network is cut; the photos and fonts the app serves from the device are served from the repo instead,
// the way PhotoCache.java answers them on the TV.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = name => 'file://' + path.join(ROOT, 'dist', name);
const INDEX = readFileSync(path.join(ROOT, 'photos/index.json'), 'utf8');
const source = JSON.parse(readFileSync(path.join(ROOT, 'config/repository.json'), 'utf8'));
const ASSET_BASE = `https://raw.githubusercontent.com/${source.repository}/${source.ref}/`;
let failed = 0;
const check = (name, ok, detail = '') => {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  -> ' + detail));
  if (!ok) failed++;
};

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

async function open(file, hash, { width = 1920, height = 1080, seed = true, clockTime = null, timezoneId = undefined } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, timezoneId });
  await ctx.route(/^https?:/, r => {
    const u = r.request().url(), rel = u.startsWith(ASSET_BASE) ? u.slice(ASSET_BASE.length) : '';
    if (/^(assets\/(backgrounds|screensaver|fonts)|photos)\//.test(rel))
      return r.fulfill({ path: path.join(ROOT, rel), headers: { 'Access-Control-Allow-Origin': '*' } });
    return r.abort();
  });
  if (seed) await ctx.addInitScript(i => { try { localStorage.setItem('photoIndex', i); } catch (e) {} }, INDEX);
  const p = await ctx.newPage();
  if(clockTime){ await p.clock.install({time:clockTime}); await p.clock.pauseAt(clockTime); }
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(page(file) + '#' + hash);
  await p.waitForFunction(() => document.documentElement.classList.contains('ready'), null, { timeout: 4000 })
    .catch(() => errors.push('never revealed'));
  await p.waitForTimeout(300);
  return { p, ctx, errors };
}

// ---- both pages, three screen sizes: no errors, shown, clock right, nothing off screen, Western digits
for (const file of ['urtv.html', 'tv.html']) {
  for (const [w, h] of [[1920, 1080], [1280, 720], [960, 540]]) {
    const { p, ctx, errors } = await open(file, 'city=جدة&lat=21.5433&lon=39.1728', { width: w, height: h });
    const tag = `${file} ${w}x${h}`;
    check(`${tag}: no script errors, page shown`, !errors.length, errors.join('; '));
    check(`${tag}: stable-content health acknowledgement`, await p.evaluate(() => window.URTV_READY === true
      && document.querySelector('meta[name="urtv-content-contract"]').content === '1'));
    const r = await p.evaluate(() => {
      const hh = document.getElementById('ck-h').textContent, mm = document.getElementById('ck-m').textContent;
      const toN = s => +s;
      const off = [...document.querySelectorAll('.stage *')].filter(e => {
        const b = e.getBoundingClientRect(), cs = getComputedStyle(e);
        return cs.display !== 'none' && b.width && (b.left < -2 || b.right > innerWidth + 2 || b.bottom > innerHeight + 2);
      }).map(e => e.className || e.id || e.tagName).slice(0, 5);
      const a=document.querySelector('.clockwrap').getBoundingClientRect(), b=document.querySelector('.prayer-schedule').getBoundingClientRect();
      const overlaps = a.left<b.right && a.right>b.left && a.top<b.bottom && a.bottom>b.top;
      const eastern = document.querySelector('.stage').innerText.match(/[٠-٩]/g) || [];
      return { hh, mm, h: toN(hh), m: toN(mm), ap: document.getElementById('ck-ap').textContent,
               sub: document.getElementById('wx-city').textContent, off, eastern, overlaps,
               photo: !!document.querySelector('.photo').style.backgroundImage };
    });
    check(`${tag}: 12-hour clock in Western digits`, /^[0-9]{1,2}$/.test(r.hh) && r.h >= 1 && r.h <= 12
      && /^[0-9]{2}$/.test(r.mm) && r.m < 60 && ['ص', 'م'].includes(r.ap), JSON.stringify(r));
    check(`${tag}: city from the settings`, r.sub === 'جدة', r.sub);
    check(`${tag}: nothing off screen or overlapping prayer schedule`, !r.off.length && !r.overlaps, r.off.join(', ') + ' overlap=' + r.overlaps);
    check(`${tag}: no Eastern Arabic digits`, !r.eastern.length, r.eastern.join(' '));
    check(`${tag}: a background photo`, r.photo);
    await ctx.close();
  }
}

// ---- Industrial Yanbu defaults, retired shows, and shared weather/prayer coordinates
{
  const { p, ctx, errors } = await open('tv.html', '');
  const before = await p.evaluate(() => ({ city:CONFIG.city, lat:CONFIG.latitude, lon:CONFIG.longitude,
    tz:CONFIG.timezone, panel:!!document.querySelector('.week'),
    clock:document.querySelector('.clock').getBoundingClientRect().x,
    width:document.querySelector('.clock').getBoundingClientRect().width }));
  check('default is Industrial Yanbu, not Yanbu al-Bahr', before.city === 'ينبع الصناعية'
    && before.lat === 23.99 && before.lon === 38.23 && before.tz === 'Asia/Riyadh', JSON.stringify(before));
  check('weekly shows removed and clock placed on the right', !before.panel
    && before.clock > 960 && !errors.length, JSON.stringify(before));
  const seen = [];
  await ctx.route('https://api.aladhan.com/**', r => {
    seen.push(r.request().url());
    return r.fulfill({json:{data:{meta:{method:{id:4},timezone:'Asia/Riyadh'},timings:{Fajr:'05:10', Sunrise:'06:25', Dhuhr:'12:15', Asr:'15:30', Maghrib:'18:05', Isha:'19:35'}}}});
  });
  await ctx.route('https://api.open-meteo.com/**', r => {
    seen.push(r.request().url());
    return r.fulfill({json:{current:{temperature_2m:32,weather_code:2},daily:{time:['2026-10-20'],temperature_2m_max:[35],temperature_2m_min:[27],weather_code:[2]}}});
  });
  await p.evaluate(() => Promise.all([loadPrayers(), loadWeather()]));
  check('weather and prayer services use the same Industrial Yanbu location', seen.length === 2 && seen.every(s => {
    const u = new URL(s); return u.searchParams.get('latitude') === '23.99'
      && u.searchParams.get('longitude') === '38.23';
  }) && seen.some(s => new URL(s).searchParams.get('method') === '4'), JSON.stringify(seen));
  const values = await p.evaluate(() => ({text:document.querySelector('.stage').innerText,
    weather:document.getElementById('wx-temp').textContent, range:document.getElementById('wx-range').textContent,
    hijri:document.getElementById('hijri').textContent, greg:document.getElementById('greg').textContent,
    prayer:document.getElementById('prayer-time').textContent}));
  check('Western digits in dates, weather and prayer times', !/[٠-٩]/.test(values.text)
    && values.weather === '32°' && values.range === '35° / 27°'
    && /[0-9]/.test(values.hijri) && /[0-9]/.test(values.greg) && /[0-9]+:[0-9]{2}/.test(values.prayer), JSON.stringify(values));
  check('validated Aladhan response reports the expected calculation source',await p.evaluate(()=>PRAYER_SOURCE.startsWith('Aladhan')));
  await ctx.route('https://api.aladhan.com/**', r=>r.fulfill({json:{data:{meta:{method:{id:3},timezone:'UTC'},timings:{Fajr:'01:00',Dhuhr:'02:00',Asr:'03:00',Maghrib:'04:00',Isha:'05:00'}}}}));
  await p.evaluate(()=>loadPrayers());
  check('wrong method or timezone is rejected in favour of the local calculation',await p.evaluate(()=>PRAYER_SOURCE.includes('محلي') && PRAYERS[0].h!==1));
  const collection=await p.evaluate(()=>({mode:CONFIG.backgrounds,count:REMOTE_BGS.length,names:new Set(REMOTE_BGS.map(p=>p.f)).size}));
  check('all 86 distinct indexed backgrounds available by default', collection.mode==='all' && collection.count===86 && collection.names===86,JSON.stringify(collection));
  await ctx.close();
}
{
  const { p, ctx } = await open('tv.html', 'city=جدة&lat=21.5433&lon=39.1728&backgrounds=all');
  const requests=[];
  await ctx.route('https://api.aladhan.com/**', r => {requests.push(r.request().url());return r.abort();});
  await ctx.route('https://api.open-meteo.com/**', r => {requests.push(r.request().url());return r.abort();});
  await p.evaluate(() => Promise.all([loadPrayers(),loadWeather()]));
  await p.evaluate(() => { REMOTE_BGS=[{f:'f5ZB0LHwi0s.jpg',d:.88}]; applyBackground(true); });
  await p.waitForFunction(() => document.querySelector('.photo').style.backgroundImage.includes('f5ZB0LHwi0s.jpg'));
  const c=await p.evaluate(()=>({city:CONFIG.city,backgrounds:CONFIG.backgrounds}));
  check('city override reaches both services; full wallpaper collection remains selectable', c.city === 'جدة'
    && c.backgrounds === 'all' && requests.length === 2 && requests.every(s => {
      const q=new URL(s).searchParams;return q.get('latitude') === '21.5433' && q.get('longitude') === '39.1728';
    }), JSON.stringify({c,requests}));
  await ctx.close();
}

// ---- every card beside the clock, with sample data where the card needs the network
const SAMPLE = {
  forecast: () => { FORECAST = [0, 1, 2, 3, 4].map(i => ({ date: new Date(Date.now() + i * 864e5).toISOString().slice(0, 10), code: 2, hi: 37 - i, lo: 24 - i })); },
  matches: () => {
    const ev = (id, h, a, hrs) => ({ idEvent: id, strHomeTeam: h, strAwayTeam: a, strTimestamp: new Date(Date.now() + hrs * 36e5).toISOString() });
    NEXT_LIST = { '136013': [ev('a', 'Al-Hilal', 'Al-Nassr', 3), ev('b', 'Al-Ahli', 'Al-Hilal', 80)] };
  },
};
const EXPECT = { prayers: [6, 'مواقيت اليوم'], forecast: [5, 'الأيام القادمة'], matches: [2, 'مباريات فرقك'],
                 verse: [2, null] };
for (const [panel, [rows, title]] of Object.entries(EXPECT)) {
  const { p, ctx, errors } = await open('tv.html', 'widget=1&teams=136013&panel=' + panel);
  if (SAMPLE[panel]) await p.evaluate(`(${SAMPLE[panel]})(); renderPanel(false);`);
  const r = await p.evaluate(() => ({ n: document.querySelectorAll('#week-list li').length,
    hd: document.getElementById('week-hd').textContent, shown: getComputedStyle(document.querySelector('.week')).display !== 'none' }));
  check(`card ${panel}: no errors`, !errors.length, errors.join('; '));
  check(`card ${panel}: ${rows} rows, title right`, r.shown && r.n === rows && (!title || r.hd === title)
    && (title || ['آية اليوم', 'حديث اليوم'].includes(r.hd)), JSON.stringify(r));
  await ctx.close();
}
{
  const { p, ctx } = await open('tv.html', 'widget=1&panel=verse');
  const both = await p.evaluate(() => {
    const day = riyadhDayNumber, out = [];
    for (const k of [0, 1]) { window.riyadhDayNumber = () => day() + k; out.push(quoteOfDay().title); }
    return out.sort().join(',');
  });
  check('card verse: a verse one day, a hadith the next', both === 'آية اليوم,حديث اليوم', both);
  await ctx.close();
}

// ---- old settings links and «لا شيء»
for (const [hash, panel, shown] of [['', 'none', false], ['week=0', 'none', false], ['week=1', 'none', false],
                                     ['panel=none', 'none', false], ['panel=shows', 'none', false], ['panel=bogus', 'none', false]]) {
  const { p, ctx, errors } = await open('tv.html', hash);
  const r = await p.evaluate(() => [CONFIG.panel, !!document.querySelector('.week')]);
  check(`link #${hash || '(empty)'} → ${panel}, card ${shown ? 'shown' : 'hidden'}`,
    !errors.length && r[0] === panel && r[1] === shown, JSON.stringify(r) + errors.join('; '));
  await ctx.close();
}

// ---- card-only mode for the launcher: transparent, only the card, no photo
for (const panel of ['prayers', 'verse', 'shows']) {
  const { p, ctx, errors } = await open('tv.html', `widget=1&panel=${panel}`, { width: 461, height: 250 });
  const r = await p.evaluate(() => ({
    bg: getComputedStyle(document.body).backgroundColor,
    visible: [...document.querySelectorAll('.top,.clockwrap,.bottom,.photo,.prayer-schedule,.reminder-card')].filter(e => getComputedStyle(e).display !== 'none').length,
    card: document.querySelector('.week').getBoundingClientRect().width }));
  check(`launcher card ${panel}: transparent, only the card`, !errors.length && r.bg === 'rgba(0, 0, 0, 0)'
    && r.visible === 0 && r.card > 400, JSON.stringify(r) + errors.join('; '));
  await ctx.close();
}

// ---- last panels come back at once on the next start
{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.route(/^https?:/, r => r.abort());
  const p = await ctx.newPage();
  await p.goto(page('tv.html') + '#panel=prayers');
  await p.waitForTimeout(800);
  await p.evaluate(() => { document.getElementById('wx-temp').textContent = '32°'; saveSnap(); });
  await p.reload();
  const t = await p.evaluate(() => document.getElementById('wx-temp').textContent);
  check('saved weather restored on the next start', t === '32°', t);
  await ctx.close();
}

// ---- Offline reminder rotation, no truncation and explicit opt-out
{
  const clockTime = new Date(Date.UTC(2026,9,20,9));
  const {p,ctx,errors}=await open('tv.html','',{clockTime});
  const read=()=>p.evaluate(()=>({title:document.getElementById('reminder-title').textContent,
    text:document.getElementById('reminder-text').textContent,source:document.getElementById('reminder-source').textContent}));
  const first=await read();
  await p.clock.fastForward(299000); const unchanged=await read();
  await p.clock.fastForward(1000); const second=await read();
  await p.clock.fastForward(300000); const third=await read();
  check('five-minute timer shows complete verses only without consecutive repeats',
    first.title==='آية قرآنية' && unchanged.text===first.text && second.title==='آية قرآنية'
    && third.title==='آية قرآنية' && first.text!==second.text && first.text!==third.text && second.text!==third.text && !errors.length,
    JSON.stringify({first,second,third,errors}));
  for(const [width,height] of [[960,540],[1280,720],[1920,1080]]){
    await p.setViewportSize({width,height});
    await p.evaluate(()=>document.fonts.ready);
    const audit=await p.evaluate(()=>{
    const realNow=Date.now, out=[];
    try{
      for(let slot=0;slot<REMINDERS.verses.length;slot++){
        Date.now=()=>slot*REMINDER_INTERVAL_MS;LAST_REMINDER_SLOT=null;renderReminder();
        const item=reminderForSlot(slot), t=document.getElementById('reminder-text'), card=document.getElementById('reminder-card');
        const source=document.getElementById('reminder-source'),clock=document.querySelector('.clockwrap').getBoundingClientRect();
        const schedule=document.querySelector('.prayer-schedule').getBoundingClientRect();
        const bottom=document.querySelector('.bottom').getBoundingClientRect();
        out.push(t.textContent===item.record.text && !!source.textContent
          && t.scrollHeight<=t.clientHeight+1 && getComputedStyle(t).textOverflow!=='ellipsis'
          && t.getBoundingClientRect().bottom<=source.getBoundingClientRect().top
          && source.getBoundingClientRect().bottom<=card.getBoundingClientRect().bottom
          && clock.top>=document.querySelector('.top').getBoundingClientRect().bottom
          && clock.left>=schedule.right && clock.bottom<=innerHeight && schedule.bottom<bottom.top && bottom.bottom<=innerHeight);
      }
    }finally{Date.now=realNow;}
    return out;
  });
    check(`all source verses fit without clipping or overlap at ${width}x${height}`,
      audit.length===12 && audit.every(Boolean),JSON.stringify(audit));
  }
  const prayers=await p.evaluate(()=>({count:document.querySelectorAll('#prayer-schedule li').length,
    selected:document.querySelectorAll('#prayer-schedule li.next').length,
    next:document.getElementById('prayer-count').textContent,
    technical:!!document.getElementById('prayer-method'),source:PRAYER_SOURCE}));
  check('offline schedule has five prayers, one next prayer and a countdown without technical text',
    prayers.count===5 && prayers.selected===1 && prayers.next.includes('بعد')
    && !prayers.technical && prayers.source.includes('محلي'),JSON.stringify(prayers));
  const afterIsha=await p.evaluate(()=>{const n=nextPrayerInfo(new Date('2026-10-20T23:30:00+03:00'));return {key:n.prayer.key,seconds:n.seconds,tomorrow:n.tomorrow};});
  check('after Isha countdown targets next-day Fajr',afterIsha.key==='Fajr' && afterIsha.tomorrow && afterIsha.seconds>0 && afterIsha.seconds<86400,JSON.stringify(afterIsha));
  await ctx.close();
}
{
  const {p,ctx,errors}=await open('tv.html','reminders=0');
  check('reminders opt-out hides the card while leaving all five prayers visible',await p.evaluate(()=>document.getElementById('reminder-card').hidden
    && !document.documentElement.classList.contains('has-reminders') && document.querySelectorAll('#prayer-schedule li').length===5) && !errors.length,errors.join('; '));
  await ctx.close();
}
// Independent Adhan 4.4.3 regression fixtures cover winter, summer and Ramadan.
{
  const reference=JSON.parse(readFileSync(path.join(ROOT,'tests/fixtures/prayer-reference.json'),'utf8'));
  const {p,ctx}=await open('tv.html','reminders=0',{timezoneId:'America/New_York'});
  const comparisons=await p.evaluate(rows=>rows.map(r=>({date:r.date,expected:r.timings,actual:computePrayers(new Date(r.date)),ramadan:hijriMonthNow(new Date(r.date))===9})),reference.fixtures);
  const minutes=s=>s.split(':').map(Number).reduce((h,m)=>h*60+m);
  check('Umm al-Qura calculation matches independent seasonal and Ramadan fixtures within one minute',comparisons.every(r=>r.ramadan===reference.fixtures.find(x=>x.date===r.date).ramadan
    && Object.keys(r.expected).every(k=>Math.abs(minutes(r.actual[k])-minutes(r.expected[k]))<=1)),JSON.stringify(comparisons));
  await ctx.close();
}

// ---- a finished game's score stays up for a day, even when the API has already moved on
{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.route(/^https?:/, r => r.abort());
  const p = await ctx.newPage();
  await p.goto(page('tv.html') + '#widget=1&teams=136013&panel=matches');
  await p.waitForTimeout(800);
  const slot = () => p.evaluate(() => western(document.getElementById('match-row').innerText).replace(/\s+/g, ' ').trim());
  const game = (id, hoursAgo, score, status) => `({idEvent:'${id}', strHomeTeam:'Al-Hilal', strAwayTeam:'Al-Nassr',
    strTimestamp:new Date(Date.now() - ${hoursAgo} * 36e5).toISOString(), intHomeScore:${score ? score[0] : null},
    intAwayScore:${score ? score[1] : null}, strStatus:'${status}'})`;

  await p.evaluate(`MATCHES['136013'] = ${game('g1', 1.8, [2, 1], 'FT')}; renderMatches();`);
  let t = await slot();
  check('whistle blown: final score at once, not «مباشر»', t.includes('النتيجة النهائية') && t.includes('2 - 1') && !t.includes('مباشر'), t);

  await p.evaluate(`keepResult('136013', MATCHES['136013']); MATCHES['136013'] = ${game('g2', -72, null, 'NS')};
                    RESULTS = {}; renderMatches();`);
  t = await slot();
  check('API moved to the next fixture: score still shown', t.includes('النتيجة النهائية') && t.includes('2 - 1'), t);

  await p.reload();
  await p.waitForTimeout(800);
  await p.evaluate(`MATCHES['136013'] = ${game('g2', -72, null, 'NS')}; renderMatches();`);
  t = await slot();
  check('after a restart the same day: score still shown', t.includes('2 - 1'), t);

  await p.evaluate(`KEPT['136013'] = [${game('g1', 27, [2, 1], 'FT')}]; renderMatches();`);
  t = await slot();
  check('a day later: score gone, next fixture shown', !t.includes('2 - 1') && t.includes('×'), t);
  await ctx.close();
}

await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall page tests passed');
process.exit(failed ? 1 : 0);
