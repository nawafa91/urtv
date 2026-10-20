// Final screensaver integration: real Chromium, real generated pages/assets, no external services.
import {chromium} from 'playwright';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cfg=JSON.parse(readFileSync(path.join(ROOT,'config/repository.json')));
const base=`https://raw.githubusercontent.com/${cfg.repository}/${cfg.ref}/`;
let failed=0;
function check(name,ok,detail=''){console.log((ok?'PASS ':'FAIL ')+name+(ok?'':' '+JSON.stringify(detail)));if(!ok)failed++;}
const browser=await chromium.launch(process.env.CHROMIUM?{executablePath:process.env.CHROMIUM}:{});
async function open({file='tv.html',width=1920,height=1080,offline=false,storage=null,hold=false}={}){
 const ctx=await browser.newContext({viewport:{width,height},timezoneId:'Asia/Riyadh'});
 const requests=[];const state={offline,held:null};
 await ctx.route(/^https?:/,async r=>{
  const url=r.request().url();requests.push(url);
  if(url.startsWith('http://urtv-final.test/'))return r.fulfill({contentType:'text/html',body:readFileSync(path.join(ROOT,'dist',file))});
  if(url.startsWith(base)){
   const rel=url.slice(base.length);
   if(rel.startsWith('photos/')&&rel.endsWith('.jpg')){
    if(state.offline)return r.abort();
    if(hold&&!state.held){await new Promise(resolve=>{state.held={release:resolve};});}
   }
   if(/^(assets\/(screensaver|backgrounds|fonts)|photos)\//.test(rel))return r.fulfill({path:path.join(ROOT,rel),headers:{'Access-Control-Allow-Origin':'*'}});
  }
  if(url.startsWith('https://api.open-meteo.com/'))return r.fulfill({json:{current:{temperature_2m:32,weather_code:2},daily:{time:['2026-10-20'],temperature_2m_max:[35],temperature_2m_min:[27],weather_code:[2]}}});
  return r.abort();
 });
 if(storage)await ctx.addInitScript(storage=>localStorage.setItem('urtv-photo-cycle-v1',storage),storage);
 const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.install({time:new Date('2026-10-20T09:00:00Z')});
 await p.clock.pauseAt(new Date('2026-10-20T09:00:00Z'));
 await p.goto('http://urtv-final.test/'+file,{waitUntil:'domcontentloaded'});
 await p.evaluate(()=>document.fonts.ready);
 await p.waitForFunction(()=>window.URTV_READY===true);
 return {p,ctx,requests,state,errors};
}
for(const file of ['tv.html','urtv.html']){
 for(const [width,height] of [[960,540],[1280,720],[1920,1080]]){
  const {p,ctx,errors,requests}=await open({file,width,height});
  const layout=await p.evaluate(()=>{
   const rect=q=>document.querySelector(q).getBoundingClientRect();
   const clock=rect('.clockwrap'),prayer=rect('.prayer-schedule'),footer=rect('.bottom'),weather=rect('.markets'),dates=rect('.dates');
   let full=true;
   const now=Date.now;
   try{for(let i=0;i<REMINDERS.verses.length;i++){
    Date.now=()=>i*REMINDER_INTERVAL_MS;LAST_REMINDER_SLOT=null;renderReminder();
    const t=document.getElementById('reminder-text'),card=rect('.reminder-card');
    full&&=t.textContent===REMINDERS.verses[i].text && t.scrollHeight<=t.clientHeight+1 && card.bottom<innerHeight && card.left>=prayer.right;
   }}finally{Date.now=now;}
   return {placed:weather.right<dates.left&&clock.left>=prayer.right&&footer.right<=clock.left&&prayer.bottom<footer.top,
    full,clean:!document.querySelector('.mk,.p-match,.week,.subline,#prayer-method,#schedule-countdown'),
    western:!/[٠-٩]/.test(document.querySelector('.stage').innerText),prayers:document.querySelectorAll('#prayer-schedule li').length,
    selected:document.querySelectorAll('#prayer-schedule li.next').length,weather:document.getElementById('wx-temp').textContent};
  });
  check(`${file} ${width}x${height}: intended layout, all complete verses, five prayers and Western digits`,layout.placed&&layout.full&&layout.clean&&layout.western&&layout.prayers===5&&layout.selected===1&&layout.weather==='32°'&&!errors.length,{layout,errors});
  check(`${file} ${width}x${height}: no sports or market API calls`,!requests.some(u=>/thesportsdb|yahoo|coingecko|allorigins|corsproxy/.test(u)));
  await ctx.close();
 }
}
{
 const {p,ctx,requests,state}=await open();
 await p.waitForFunction(()=>!!BG_SHOWN);
 const photos=()=>requests.filter(u=>u.startsWith(base+'photos/')&&u.endsWith('.jpg'));
 check('startup downloads exactly one collection photo',photos().length===1,photos());
 const initial=await p.evaluate(()=>BG_SHOWN);
 await p.clock.fastForward(20000);
 check('no delayed collection prefetch',photos().length===1,photos());
 await p.clock.fastForward(1779000);
 check('background unchanged before 30 minutes',await p.evaluate(()=>BG_SHOWN)===initial&&photos().length===1);
 await p.clock.fastForward(1000);
 await p.waitForFunction(initial=>BG_SHOWN!==initial,initial);
 check('30-minute boundary downloads only the next photo',photos().length===2,photos());
 const current=await p.evaluate(()=>({url:BG_SHOWN,index:PHOTO_CYCLE.index,order:PHOTO_CYCLE.order,nextAt:PHOTO_CYCLE.nextAt}));
 await p.reload();await p.waitForFunction(()=>!!BG_SHOWN);
 check('reload preserves current image and full cycle progress',await p.evaluate(current=>BG_SHOWN===current.url&&PHOTO_CYCLE.index===current.index&&JSON.stringify(PHOTO_CYCLE.order)===JSON.stringify(current.order)&&PHOTO_CYCLE.nextAt===current.nextAt,current));
 state.offline=true;
 await p.evaluate(()=>{PHOTO_CYCLE.nextAt=Date.now();applyBackground();});
 await p.waitForTimeout(200);
 check('failed next image retains last valid background',await p.evaluate(current=>BG_SHOWN===current.url&&!!document.querySelector('.photo').style.backgroundImage,current));
 const cycle=await p.evaluate(()=>{
  PHOTO_CYCLE=null;localStorage.removeItem(PHOTO_CYCLE_KEY);
  const t=Date.now(),names=[];
  for(let i=0;i<REMOTE_BGS.length;i++)names.push(currentPhoto(REMOTE_BGS,t+i*PHOTO_INTERVAL_MS).f);
  const next=currentPhoto(REMOTE_BGS,t+REMOTE_BGS.length*PHOTO_INTERVAL_MS).f;
  return {n:names.length,unique:new Set(names).size,all:REMOTE_BGS.every(p=>names.includes(p.f)),boundary:next!==names.at(-1)};
 });
 check('entire shuffled 86-photo cycle has no repeats, including cycle boundary',cycle.n===86&&cycle.unique===86&&cycle.all&&cycle.boundary,cycle);
 check('unsafe/duplicate index names are refused',await p.evaluate(()=>validPhotoIndex([{f:'../x.jpg'},{f:'x.jpg'},{f:'x.jpg'},{f:'https://evil/x.jpg'}]).length===1));
 await ctx.close();
}
{
 const {p,ctx}=await open({offline:true,storage:'{"invalid":true}'});
 check('offline first start keeps bundled fallback with valid rebuilt cycle',await p.evaluate(()=>!!document.querySelector('.photo').style.backgroundImage&&PHOTO_CYCLE.order.length===86));
 check('disabled storage still allows in-memory photo rotation',await p.evaluate(()=>{
  Object.defineProperty(window,'localStorage',{get(){throw new Error('storage unavailable');}});
  PHOTO_CYCLE=null;return !!currentPhoto(REMOTE_BGS)&&PHOTO_CYCLE.order.length===86;
 }));
 await ctx.close();
}
{
 const {p,ctx,state}=await open({hold:true});
 await p.waitForFunction(()=>BG_LOADING!=='');
 await p.evaluate(()=>{PHOTO_CYCLE.nextAt=Date.now();applyBackground();});
 await p.waitForFunction(()=>!!BG_SHOWN);
 const shown=await p.evaluate(()=>BG_SHOWN);state.held.release();await p.waitForTimeout(250);
 check('late previous download cannot replace the newer selected background',await p.evaluate(shown=>BG_SHOWN===shown,shown));
 await ctx.close();
}
await browser.close();
console.log(failed?`${failed} failed`:'all final screensaver tests passed');process.exit(failed?1:0);
