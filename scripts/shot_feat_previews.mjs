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
await p.waitForTimeout(1500);

// 1+2. Jezero two-point comparison: table + elevation/slope profile charts
await p.selectOption('select[aria-label="Route from"]', 'Depot');
await p.selectOption('select[aria-label="Route to"]', 'Kukaklek');
await p.waitForSelector('text=Route comparison', { timeout: 30000 });
await p.waitForTimeout(2000);
// dismiss the local events card so the map paths are unobstructed
await p.click('button[aria-label="Hide event records"]').catch(() => {});
await p.waitForTimeout(400);
await p.screenshot({ path: '/downloads/fin_compare_jezero.png', fullPage: true });
const panel = p.locator('section.panel', { hasText: 'Elevation along each route' }).last();
await panel.scrollIntoViewIfNeeded();
await p.waitForTimeout(600);
await panel.screenshot({ path: '/downloads/fin_profiles_jezero.png' });

// 3. Point inspector on the 4 m DTM: click map, then capture the inspector panel itself
await p.click('button:has-text("Inspect a point on the map")');
await p.waitForTimeout(500);
const map = await p.locator('.leaflet-container').boundingBox();
await p.mouse.click(map.x + map.width * 0.52, map.y + map.height * 0.42);
await p.waitForSelector('section.panel:has-text("Point inspector")', { timeout: 15000 });
await p.waitForTimeout(1200);
const insp = p.locator('section.panel', { hasText: 'Point inspector' }).last();
await insp.scrollIntoViewIfNeeded();
await p.waitForTimeout(400);
await insp.screenshot({ path: '/downloads/fin_inspector_jezero.png' });

await b.close(); server.close();
console.log('feature previews done');
