import path from 'node:path'; import http from 'node:http'; import fs from 'node:fs';
import { chromium } from 'playwright';
const dist = '/downloads/marswalk/dist';
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.bin':'application/octet-stream' };
const server = http.createServer((req,res)=>{ const rel = req.url==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/,'');
  fs.readFile(path.join(dist,rel),(e,buf)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'content-type':MIME[path.extname(rel).toLowerCase()]||'application/octet-stream'}); res.end(buf); }); });
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox','--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport:{ width:1356, height:820 } })).newPage();
await p.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil:'networkidle' });
await p.waitForTimeout(2500);
// double-click-zoom toward the Skinner/Wildcat area (right side of the map)
const map = await p.$('.leaflet-container');
const bb = await map.boundingBox();
for (let i = 0; i < 3; i++) {
  await p.mouse.dblclick(bb.x + bb.width*0.62, bb.y + bb.height*0.42);
  await p.waitForTimeout(900);
}
const stars = await p.evaluate(() => document.querySelectorAll('.leaflet-marker-icon div[style*="fbbf24"]').length);
console.log('amber MEDA star markers rendered:', stars);
// hover one to show its tooltip
const icons = await p.$$('.leaflet-marker-icon');
for (const ic of icons) {
  const html = await ic.innerHTML();
  if (html.includes('fbbf24')) { await ic.hover(); break; }
}
await p.waitForTimeout(600);
const tip = await p.evaluate(() => document.querySelector('.leaflet-tooltip')?.textContent || '');
console.log('tooltip:', tip.slice(0, 160));
await p.screenshot({ path: '/downloads/ev_jezero_meda_zoom.png' });
await b.close(); server.close();
