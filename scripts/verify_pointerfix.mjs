import path from 'node:path'; import http from 'node:http'; import fs from 'node:fs';
import { chromium } from 'playwright';
const dist = '/downloads/marswalk/dist';
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.bin':'application/octet-stream','.geojson':'application/json' };
const server = http.createServer((req,res)=>{ const rel = req.url==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/,'');
  fs.readFile(path.join(dist,rel),(e,buf)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'content-type':MIME[path.extname(rel).toLowerCase()]||'application/octet-stream'}); res.end(buf); }); });
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox','--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport:{ width:1356, height:820 } })).newPage();
const errors = []; p.on('pageerror', e => { errors.push(String(e)); console.log('PAGEERROR:', String(e).slice(0,120)); });
await p.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil:'networkidle' });
await p.waitForTimeout(2500);
await p.evaluate(() => {
  const s = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => o.value === 'gale'));
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(s, 'gale'); s.dispatchEvent(new Event('change', { bubbles: true }));
});
await p.waitForTimeout(4000);
await p.click('button:has-text("3D Terrain")');
await p.waitForTimeout(25000);
console.log('gale 3D mounted, errors=' + errors.length);

// idle frame rate (demand mode: should be ~no continuous rendering)
const idle = await p.evaluate(() => new Promise(res => {
  let n = 0; const t0 = performance.now();
  const tick = () => { if (++n < 10) requestAnimationFrame(tick); else res({ frames: 10, wallMs: Math.round(performance.now() - t0) }); };
  requestAnimationFrame(tick);
}));
console.log('idle 10 rAF wall ms:', idle.wallMs, '(was ~6400 before, vsync-free pipeline)');

// real pointer sweep over the canvas
const cv = await p.$('.map-pane canvas');
const bb = await cv.boundingBox();
let t0 = Date.now();
for (let i = 0; i < 10; i++) await p.mouse.move(bb.x + 250 + i * 15, bb.y + 250 + i * 8, { steps: 1 });
console.log('10-step sweep total:', Date.now() - t0, 'ms (was ~7700)');

// orbit: drag 8 moves
t0 = Date.now();
await p.mouse.move(bb.x + 400, bb.y + 350);
await p.mouse.down();
for (let i = 0; i < 8; i++) await p.mouse.move(bb.x + 400 + (i+1)*25, bb.y + 350 + (i+1)*10, { steps: 1 });
await p.mouse.up();
console.log('8-move orbit total:', Date.now() - t0, 'ms (was ~18300)');
await p.waitForTimeout(4000); // damping settle frames

// labels still tracked after orbit?
const labels = await p.evaluate(() => [...document.querySelectorAll('.terrain3d-label')].map(e => ({ t: e.textContent, vis: e.parentElement.style.visibility, tr: e.parentElement.style.transform.slice(0, 40) })));
console.log('labels after orbit:', JSON.stringify(labels));
// view buttons responsive
await p.click('button:has-text("2D Map")', { timeout: 8000 });
await p.waitForTimeout(800);
console.log('2D button responsive: YES');
await p.click('button:has-text("3D Terrain")');
await p.waitForTimeout(4000);
const labels2 = await p.evaluate(() => [...document.querySelectorAll('.terrain3d-label')].filter(e => e.parentElement.style.visibility === 'visible').length);
console.log('labels visible after 2D->3D roundtrip:', labels2);
await p.screenshot({ path: '/downloads/fix_pointer_gale3d.png' });
console.log('pageerrors:', errors.length, errors.length === 0 ? 'PASS' : 'FAIL');
await b.close(); server.close();
