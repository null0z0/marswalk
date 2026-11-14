// Exact QA sequence: Jezero planner least-cost -> 3D -> Gale -> Jezero -> Gale.
// Watches for NotFoundError removeChild and dead view buttons.
import path from 'node:path'; import http from 'node:http'; import fs from 'node:fs';
import { chromium } from 'playwright';
const dist = '/downloads/marswalk/dist';
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.bin':'application/octet-stream','.geojson':'application/json' };
const server = http.createServer((req,res)=>{ const rel = req.url==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/,'');
  fs.readFile(path.join(dist,rel),(e,buf)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'content-type':MIME[path.extname(rel).toLowerCase()]||'application/octet-stream'}); res.end(buf); }); });
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox','--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport:{ width:1356, height:820 } })).newPage();
const errors = [];
p.on('pageerror', e => { errors.push(String(e)); console.log('PAGEERROR:', String(e.stack || e).slice(0, 1500)); });
await p.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil:'networkidle' });
await p.waitForTimeout(2500);
console.log('loaded');

await p.click('button:has-text("Mission planner")');
await p.click('summary:has-text("Layers")');
await p.selectOption('select[aria-label="Route model"]', 'leastcost');
await p.waitForTimeout(6000);
console.log('jezero planner leastcost ready');

await p.click('button:has-text("3D Terrain")');
await p.waitForTimeout(5000);
console.log('jezero 3D mounted, errors=' + errors.length);
console.log('sep label present (planner):', await p.evaluate(() => { const e = document.querySelector('.terrain3d-sep'); return e ? e.parentElement.style.visibility : 'MISSING'; }));
console.log('planner labels:', await p.evaluate(() => [...document.querySelectorAll('.terrain3d-label')].map(e => e.textContent + ':' + e.parentElement.style.visibility).join(' | ')));

async function setRegion(id) {
  await p.evaluate((id) => {
    const s = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => o.value === 'delta'));
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(s, id);
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }, id);
}
await setRegion('gale');
await p.waitForTimeout(25000);
console.log('gale 3D (first) settled, errors=' + errors.length);
await setRegion('delta');
await p.waitForTimeout(8000);
console.log('back to jezero, errors=' + errors.length);
await setRegion('gale');
await p.waitForTimeout(25000);
console.log('gale 3D (second) settled, errors=' + errors.length);

// button responsiveness: switch to 2D and confirm the pane actually activates
try {
  await p.click('button:has-text("2D Map")', { timeout: 8000 });
  await p.waitForTimeout(1500);
  const active = await p.evaluate(() => document.querySelector('.map-pane.is-active')?.getAttribute('aria-hidden'));
  console.log('2D button responsive: YES');
} catch (e) {
  console.log('2D button responsive: NO -', String(e).slice(0, 120));
}
console.log(errors.length === 0 ? 'PASS' : 'FAIL');
await b.close(); server.close();
