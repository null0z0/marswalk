import path from 'node:path'; import http from 'node:http'; import fs from 'node:fs';
import { chromium } from 'playwright';
const dist = '/home/sandbox/marswalk/dist';
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.png':'image/png' };
const server = http.createServer((req,res)=>{ const rel = req.url.split('?')[0]==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/,'');
  fs.readFile(path.join(dist,rel),(e,buf)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'content-type':MIME[path.extname(rel).toLowerCase()]||'application/octet-stream'}); res.end(buf); }); });
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox','--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport:{ width:1000, height:800 } })).newPage();
const target = process.env.GLOBE_TARGET || 'globelon=77.45&globelat=18.44';
await p.goto(`http://127.0.0.1:${server.address().port}/#${target}`, { waitUntil:'networkidle' });
await p.click('button:has-text("Global")');
await p.waitForSelector('.global-view canvas', { timeout: 20000 });
await p.waitForTimeout(5000);
await p.screenshot({ path: process.env.GLOBE_SHOT || '/downloads/m8_globe_align.png' });
// find Jezero marker screen pos
const dbg = await p.evaluate(() => {
  const c = document.querySelector('.global-view canvas');
  const r = c.getBoundingClientRect();
  return { canvas: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) }, hash: location.hash };
});
console.log('DBG', JSON.stringify(dbg));
const pos = await p.evaluate(() => [...document.querySelectorAll('.global-view button[aria-label]')].map(b => {
  const r = b.getBoundingClientRect();
  return { name: b.getAttribute('aria-label').slice(0, 28), x: Math.round(r.x), y: Math.round(r.y), hidden: b.closest('[style*="display: none"]') !== null };
}).filter(m => !m.hidden));
console.log(JSON.stringify(pos, null, 1));
await b.close(); server.close();
