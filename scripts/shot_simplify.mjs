import path from 'node:path'; import http from 'node:http'; import fs from 'node:fs';
import { chromium } from 'playwright';
const dist = '/downloads/marswalk/dist';
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.bin':'application/octet-stream','.geojson':'application/json' };
const server = http.createServer((req,res)=>{ const rel = req.url==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/,'');
  fs.readFile(path.join(dist,rel),(e,buf)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'content-type':MIME[path.extname(rel).toLowerCase()]||'application/octet-stream'}); res.end(buf); }); });
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url = `http://127.0.0.1:${server.address().port}`;
const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox','--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport:{ width:1440, height:950 } })).newPage();
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.goto(url, { waitUntil:'networkidle' });
await p.waitForSelector('.leaflet-container', { timeout: 20000 });
await p.waitForTimeout(1800);

// 1. Left rail: concise cards, collapsed disclosures
const rail = p.locator('aside.rail').first();
await rail.screenshot({ path: '/downloads/s17_leftrail.png' });

// 2. Layers panel open with grouped sections
await p.locator('summary', { hasText: 'Layers' }).first().click();
await p.waitForTimeout(500);
const layersPanel = p.locator('details:has(> summary:text-is("Layers"))').first();
await layersPanel.screenshot({ path: '/downloads/s17_layers.png' });

// 3. Point inspector: plain summary line + collapsed Details & sources
await p.locator('summary', { hasText: 'Layers' }).first().click(); // close layers
await p.click('button:has-text("Inspect a point on the map")');
await p.waitForTimeout(400);
const map = await p.locator('.leaflet-container').boundingBox();
await p.mouse.click(map.x + map.width * 0.52, map.y + map.height * 0.42);
await p.waitForSelector('section.panel:has-text("Point inspector")', { timeout: 15000 });
await p.waitForTimeout(1000);
const insp = p.locator('section.panel', { hasText: 'Point inspector' }).last();
await insp.scrollIntoViewIfNeeded();
await p.waitForTimeout(400);
await insp.screenshot({ path: '/downloads/s17_inspector.png' });
// expanded details variant
await insp.locator('summary', { hasText: 'Details & sources' }).click();
await p.waitForTimeout(400);
await insp.screenshot({ path: '/downloads/s17_inspector_details.png' });

await b.close(); server.close();
console.log('simplify shots done');
