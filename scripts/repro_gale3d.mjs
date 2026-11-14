// Crash repro for the QA blocker: Gale planner + least-cost route model with
// the zero-length GaleBase->Rocknest leg (identical coordinates -> 1-cell A*
// path) must NOT white-screen when the 3D terrain mounts, including after a
// region change cycle. Before the fix: drei Line RangeError (typed array -6).
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
p.on('pageerror', e => errors.push(String(e)));
await p.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil:'networkidle' });
await p.waitForTimeout(2500);

async function mount3D(label) {
  await p.click('button:has-text("3D Terrain")');
  await p.waitForTimeout(6000);
  const canvas = await p.evaluate(() => !!document.querySelector('canvas'));
  const textLen = await p.evaluate(() => document.body.innerText.length);
  console.log(`${label}: canvas=${canvas} textLen=${textLen} pageerrors=${errors.length}`);
  if (errors.length) console.log('  ERRORS:', errors.slice(0, 3).join(' | ').slice(0, 400));
}

// Gale scenario, mission planner, least-cost model (2D layers panel)
await p.selectOption('select:has(option[value="gale"])', 'gale');
await p.waitForTimeout(4000);
await p.click('button:has-text("Mission planner")');
await p.waitForTimeout(3000);
await p.click('summary:has-text("Layers")');
await p.waitForTimeout(400);
await p.selectOption('select[aria-label="Route model"]', 'leastcost');
await p.waitForTimeout(12000); // A* compute on the 2 m Gale grid
await mount3D('gale planner least-cost -> 3D');
await p.screenshot({ path: '/downloads/repro_gale3d.png' });

// region change cycle: back to Jezero, then Gale again, 3D each time
async function setRegion(id) {
  await p.click('button:has-text("2D Map")').catch(() => {});
  await p.waitForTimeout(1500);
  await p.evaluate((id) => {
    const s = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => o.value === 'delta'));
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(s, id);
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }, id);
}
await setRegion('delta');
await p.waitForTimeout(4000);
console.log('region now:', await p.evaluate(() => document.querySelector('h1, header, .app')?.textContent?.includes('Gale') ? 'gale?' : 'switched'));
await mount3D('jezero after region change -> 3D');
await setRegion('gale');
await p.waitForTimeout(8000);
await mount3D('gale again after region change -> 3D');
await p.screenshot({ path: '/downloads/repro_gale3d_again.png' });

console.log(errors.length === 0 ? 'PASS: no page errors, no white screen' : 'FAIL: page errors present');
await b.close(); server.close();
process.exit(errors.length === 0 ? 0 : 1);
