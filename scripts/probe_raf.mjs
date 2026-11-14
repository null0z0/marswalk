import path from 'node:path'; import http from 'node:http'; import fs from 'node:fs';
import { chromium } from 'playwright';
const dist = '/downloads/marswalk/dist';
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.bin':'application/octet-stream','.geojson':'application/json' };
const server = http.createServer((req,res)=>{ const rel = req.url==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/,'');
  fs.readFile(path.join(dist,rel),(e,buf)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'content-type':MIME[path.extname(rel).toLowerCase()]||'application/octet-stream'}); res.end(buf); }); });
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox','--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport:{ width:1356, height:820 } })).newPage();
await p.addInitScript(() => {
  window.__rafLog = [];
  const orig = window.requestAnimationFrame;
  window.requestAnimationFrame = function(cb) {
    return orig.call(window, (t) => { const s = performance.now(); cb(t); window.__rafLog.push(performance.now() - s); });
  };
});
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
const log = await p.evaluate(() => new Promise(res => {
  window.__rafLog = [];
  let n = 0;
  const t0 = performance.now();
  const tick = () => { if (++n < 8) requestAnimationFrame(tick); else res({ frames: 8, wallMs: performance.now() - t0, rafLog: window.__rafLog.slice() }); };
  requestAnimationFrame(tick);
}));
console.log(JSON.stringify(log));
await b.close(); server.close();
