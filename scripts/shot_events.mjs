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
await p.click('button:has-text("Global")');
await p.waitForSelector('.global-view canvas', { timeout: 20000 });
await p.waitForTimeout(4000);

const evCount = await p.evaluate(() => document.querySelectorAll('.global-view button[aria-label^="recorded natural events"]').length);
console.log('event marker buttons (front-facing):', evCount);

// open the info banner so the legend + events toggle show
await p.click('button:has-text("info")').catch(()=>{});
await p.waitForTimeout(300);
const legend = await p.evaluate(() => document.querySelector('.global-view').innerText);
console.log('legend point line:', /Recorded event \(verified position\)/.test(legend) ? 'OK' : 'MISSING');
console.log('legend region line:', /Region-level records \(NOT positions\)/.test(legend) ? 'OK' : 'MISSING');
console.log('events toggle:', /Show recorded natural events/.test(legend) ? 'OK' : 'MISSING');

// rotate the globe until at least one event marker is front-facing (drag on canvas)
const cv = await p.$('.global-view canvas');
const bb = await cv.boundingBox();
for (let i = 0; i < 14 && (await p.evaluate(() => document.querySelectorAll('.global-view button[aria-label^="recorded natural events"]').length)) === 0; i++) {
  await p.mouse.move(bb.x + bb.width/2, bb.y + bb.height/2);
  await p.mouse.down();
  await p.mouse.move(bb.x + bb.width/2 - 220, bb.y + bb.height/2, { steps: 8 });
  await p.mouse.up();
  await p.waitForTimeout(500);
}
const evCount2 = await p.evaluate(() => document.querySelectorAll('.global-view button[aria-label^="recorded natural events"]').length);
console.log('event markers after rotate:', evCount2);
await p.screenshot({ path: '/downloads/ev_globe_markers.png' });

// click an event marker -> event card
await p.evaluate(() => { const btn = document.querySelector('.global-view button[aria-label^="recorded natural events"]'); btn?.click(); });
await p.waitForTimeout(400);
const card = await p.evaluate(() => document.querySelector('.global-view').innerText);
console.log('event card anchorNote:', /NOT the epicenters|for orientation only|Marker =/.test(card) ? 'OK' : 'MISSING');
console.log('event card disclaimer:', /Historical record - not current conditions/.test(card) ? 'OK' : 'MISSING');
console.log('event card source:', /Source:/.test(card) ? 'OK' : 'MISSING');
await p.screenshot({ path: '/downloads/ev_globe_card.png' });

// local Jezero map: events card (crater-level, no pins)
await p.click('button:has-text("Open Jezero workspace")');
await p.waitForTimeout(3500);
const mapText = await p.evaluate(() => document.body.innerText);
console.log('jezero events card:', /Recorded natural events - Jezero Crater/.test(mapText) ? 'OK' : 'MISSING');
console.log('jezero no-pins honesty:', /nothing is pinned - no position is guessed/.test(mapText) ? 'OK' : 'MISSING');
console.log('jezero layers toggle:', /Historical event records \(crater-level/.test(mapText) ? 'OK' : 'MISSING');
await p.screenshot({ path: '/downloads/ev_jezero_map.png' });
await b.close(); server.close();
