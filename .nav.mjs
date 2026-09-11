import { chromium } from 'playwright';
const BASE='https://coach.klixostudio.com';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});
const p=await ctx.newPage();
await p.goto(`${BASE}/login`,{waitUntil:'networkidle'});
await p.fill('input[name="phone"]','9876500001');
await p.fill('input[name="pin"]','1234');
await Promise.all([p.waitForURL(u=>!u.pathname.startsWith('/login'),{timeout:90000}),p.click('button[type="submit"]')]);
await p.waitForLoadState('networkidle');

// Client-side navigation (Link click) vs full page load, warm cache.
const nav=async(label,fn)=>{
  const t=[];
  for(let i=0;i<4;i++){ const t0=Date.now(); await fn(); t.push(Date.now()-t0); await p.waitForTimeout(400); }
  t.sort((a,b)=>a-b);
  console.log(`${label.padEnd(38)} p50=${t[1]}ms  [${t.join(", ")}]`);
};
await nav("full reload /today", async()=>{ await p.goto(BASE+'/today',{waitUntil:'load'}); });
await nav("full reload /dashboard", async()=>{ await p.goto(BASE+'/dashboard',{waitUntil:'load'}); });
// SPA navigation via the nav links
await p.goto(BASE+'/today',{waitUntil:'networkidle'});
await nav("SPA nav today->dashboard->today", async()=>{
  await p.click('a[href="/dashboard"]'); await p.waitForURL(/dashboard/,{timeout:60000});
  await p.click('a[href="/today"]');     await p.waitForURL(/today/,{timeout:60000});
});
await b.close();
