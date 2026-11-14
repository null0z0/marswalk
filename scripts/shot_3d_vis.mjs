import path from 'node:path'; import http from 'node:http'; import fs from 'node:fs';
import { chromium } from 'playwright';
const dist = '/downloads/marswalk/dist';
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.bin':'application/octet-stream','.geojson':'application/json' };
const server = http.createServer((req,res)=>{ const rel = req.url==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/,'');
  fs.readFile(path.join(dist,rel),(e,buf)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'content-type':MIME[path.extname(rel).toLowerCase()]||'application/octet-stream'}); res.end(buf); }); });
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox','--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport:{ width:1356, height:820 } })).newPage();
const errors = []; p.on('pageerror', e => errors.push(String(e)));
await p.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil:'networkidle' });
await p.waitForTimeout(2500);
await p.click('button:has-text("3D Terrain")');
await p.waitForTimeout(6000);
await p.screenshot({ path: '/downloads/s18_3d_jezero_route.png' });
// planner mode with planned route legs
await p.click('button:has-text("Mission planner")');
await p.waitForTimeout(2500);
await p.screenshot({ path: '/downloads/s18_3d_jezero_planner.png' });
// Gale 3D
await p.evaluate(() => {
  const s = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => o.value === 'gale'));
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(s, 'gale'); s.dispatchEvent(new Event('change', { bubbles: true }));
});
await p.waitForTimeout(22000);
await p.screenshot({ path: '/downloads/s18_3d_gale.png' });
console.log('pageerrors:', errors.length, errors.slice(0,3));
await b.close(); server.close();
