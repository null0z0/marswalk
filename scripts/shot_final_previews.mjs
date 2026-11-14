import path from 'node:path'; import http from 'node:http'; import fs from 'node:fs';
import { chromium } from 'playwright';
const dist = '/home/sandbox/marswalk/dist';
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.geojson':'application/json' };
const server = http.createServer((req,res)=>{ const rel = req.url==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/,'');
  fs.readFile(path.join(dist,rel),(e,buf)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'content-type':MIME[path.extname(rel).toLowerCase()]||'application/octet-stream'}); res.end(buf); }); });
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url = `http://127.0.0.1:${server.address().port}`;
const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox','--enable-unsafe-swiftshader'] });

async function page(w, h) {
  const p = await (await b.newContext({ viewport:{ width:w, height:h } })).newPage();
  await p.goto(url, { waitUntil:'networkidle' });
  await p.waitForSelector('.leaflet-container', { timeout: 20000 });
  await p.waitForTimeout(1500);
  return p;
}
const scenarioSelect = p => p.locator('section.panel', { hasText: 'Region & mission' }).locator('select');

// 1. Jezero two-point route, desktop
let p = await page(1440, 900);
await p.selectOption('select[aria-label="Route from"]', 'Depot');
await p.selectOption('select[aria-label="Route to"]', 'Kukaklek');
await p.waitForTimeout(1800);
await p.screenshot({ path: '/downloads/fin_jezero_route.png' });
// 2. Jezero 3D terrain
await p.click('button:has-text("3D Terrain")');
await p.waitForTimeout(2500);
await p.screenshot({ path: '/downloads/fin_jezero_3d.png' });
// rotated view: drag the canvas to orbit ~half a turn, proving line continuity
const cv = await p.locator('.map-pane.is-active canvas').boundingBox();
await p.mouse.move(cv.x + cv.width / 2, cv.y + cv.height / 2);
await p.mouse.down();
await p.mouse.move(cv.x + cv.width / 2 + 420, cv.y + cv.height / 2 - 30, { steps: 24 });
await p.mouse.up();
await p.waitForTimeout(1200);
await p.screenshot({ path: '/downloads/fin_jezero_3d_rot.png' });
// 3. Mission planner
await p.click('button:has-text("2D Map")');
await p.click('button:has-text("Mission planner")');
await p.waitForTimeout(1500);
await p.screenshot({ path: '/downloads/fin_jezero_planner.png' });
await p.close();

// 4. Gale two-point route, desktop
p = await page(1440, 900);
await scenarioSelect(p).selectOption('gale');
await p.waitForFunction(() => [...document.querySelectorAll('.leaflet-overlay-pane img, .leaflet-image-layer')].some(i => i.complete && i.naturalWidth > 0), undefined, { timeout: 30000 });
await p.waitForTimeout(1200);
await p.locator('label', { hasText: 'recorded drive path' }).locator('input').check();
await p.selectOption('select[aria-label="Route from"]', 'Rocknest');
await p.selectOption('select[aria-label="Route to"]', 'Shaler');
await p.waitForTimeout(1800);
await p.screenshot({ path: '/downloads/fin_gale_route.png' });
// Gale 3D: recorded pair (solid green, no synthetic)
await p.click('button:has-text("3D Terrain")');
await p.waitForTimeout(2500);
await p.screenshot({ path: '/downloads/fin_gale_3d_recorded.png', timeout: 90000, animations: 'disabled' });
// Gale 3D: experiment pair with synthetic connectors (dashed distinction)
await p.click('button:has-text("2D Map")');
await p.waitForTimeout(600);
await p.locator('label', { hasText: 'synthetic connectors' }).locator('input').check();
await p.selectOption('select[aria-label="Route from"]', 'JohnKleinCumberland');
await p.selectOption('select[aria-label="Route to"]', 'Departure');
await p.waitForTimeout(1500);
await p.click('button:has-text("3D Terrain")');
await p.waitForTimeout(2000);
await p.screenshot({ path: '/downloads/fin_gale_3d_synth.png', timeout: 90000, animations: 'disabled' });
await p.close();

// 5. Mobile route view
p = await page(390, 844);
await p.selectOption('select[aria-label="Route from"]', 'Depot');
await p.selectOption('select[aria-label="Route to"]', 'Kukaklek');
await p.waitForTimeout(1800);
await p.screenshot({ path: '/downloads/fin_mobile_route.png' });
await p.close();

await b.close(); server.close();
console.log('final previews done');
