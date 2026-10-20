// Exercise the real launcher-only WebView script without changing the shared screensaver page.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'android/launcher/src/main/assets/latin-digits.js');
const browser = await chromium.launch(process.env.CHROMIUM ? {executablePath: process.env.CHROMIUM} : {});
try {
  const page = await browser.newPage();
  await page.setContent('<style>p { color: rgb(30, 40, 50); font-size: 24px }</style><p id="value">المفضلة · ٥ من ١٠</p><script type="application/json" id="data">{"value":"١٢"}</script>');
  const before = await page.evaluate(() => ({color:getComputedStyle(document.querySelector('p')).color, size:getComputedStyle(document.querySelector('p')).fontSize}));
  await page.addScriptTag({path:script});
  assert.equal(await page.locator('#value').textContent(), 'المفضلة · 5 من 10');
  assert.equal(await page.locator('#data').textContent(), '{"value":"١٢"}');
  await page.evaluate(() => {document.querySelector('p').firstChild.nodeValue = 'الصلاة ۱۲:٣٠';});
  await page.waitForFunction(() => document.querySelector('p').textContent === 'الصلاة 12:30');
  await page.evaluate(() => {const el=document.createElement('span'); el.id='added'; el.textContent='١٤٤٨ هـ'; document.body.append(el);});
  await page.waitForFunction(() => document.querySelector('#added').textContent === '1448 هـ');
  const after = await page.evaluate(() => ({color:getComputedStyle(document.querySelector('p')).color, size:getComputedStyle(document.querySelector('p')).fontSize}));
  assert.deepEqual(after,before);
  console.log('PASS initial numbers, later updates, added text, Arabic labels, styling and script data');

  // Load the actual generated card, then apply exactly the asset injected by HomeCard.java.
  await page.route('http://urtv.test/**', r => r.fulfill({contentType:'text/html', body:readFileSync(path.join(root,'dist/tv.html'))}));
  await page.route('https://**', r => r.abort());
  await page.goto('http://urtv.test/#widget=1&panel=prayers');
  await page.waitForFunction(() => document.querySelectorAll('#week-list li').length === 6);
  await page.addScriptTag({path:script});
  assert.match(await page.locator('#week-list').innerText(), /[0-9]+:[0-9]{2}/);
  assert.doesNotMatch(await page.locator('#week-list').innerText(), /[٠-٩۰-۹]/);
  await page.evaluate(() => renderPanel(false));
  await page.waitForFunction(() => !/[٠-٩۰-۹]/.test(document.querySelector('#week-list').innerText));
  console.log('PASS real optional card and its refresh use Western digits');
} finally {
  await browser.close();
}
