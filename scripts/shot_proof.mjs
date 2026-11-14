import path from 'node:path';
import http from 'node:http';
import fs from 'node:fs';
import { chromium } from 'playwright';

const dist = '/tmp/marswalk/dist';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.geojson': 'application/json' };
const server = http.createServer((req, res) => {
  const rel = req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  fs.readFile(path.join(dist, rel), (e, buf) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });

const setSol = (p, v) => p.locator('input[type=range]').first().evaluate((el, val) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, val);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, String(v));

async function shot(name, w, h, fn) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForSelector('.leaflet-container', { timeout: 15000 });
  await p.waitForTimeout(1200);
  if (fn) await fn(p);
  await p.waitForTimeout(800);
  await p.screenshot({ path: `/tmp/${name}.png` });
  console.log(name, 'done');
  await p.close();
}

const jezeroRouteOn = async p => {
  await p.locator('text=Layers').first().click();
  await p.locator('label', { hasText: 'Recorded rover positions' }).locator('input[type=checkbox]').first().check();
  await p.locator('summary', { hasText: 'Layers' }).first().click(); // close panel so it does not cover the zoom control
  // zoom out so the full archived route is visible, not just the station cluster
  await p.locator('.leaflet-control-zoom-out').click(); await p.waitForTimeout(300);
};

// before/after: Jezero recorded route filtered by the slider
await shot('proof_jezero_route_full', 1440, 900, jezeroRouteOn);
await shot('proof_jezero_route_477', 1440, 900, async p => { await jezeroRouteOn(p); await setSol(p, 477); await p.waitForTimeout(400); });

// before/after: Gale recorded stops filtered by the slider
const galeOn = async p => {
  await p.selectOption('select', 'gale');
  await p.waitForTimeout(1800);
  await p.locator('text=Layers').first().click();
  await p.locator('label', { hasText: 'NASA recorded traverse geometry' }).locator('input[type=checkbox]').first().check();
  await p.locator('label', { hasText: 'Recorded rover stops' }).locator('input[type=checkbox]').first().check();
  await p.locator('summary', { hasText: 'Layers' }).first().click();
  await p.locator('.leaflet-control-zoom-out').click();
  await p.waitForTimeout(300);
};
await shot('proof_gale_stops_full', 1440, 900, galeOn);
await shot('proof_gale_stops_100', 1440, 900, async p => { await galeOn(p); await setSol(p, 100); await p.waitForTimeout(400); });

// mobile pixels per scenario (timeline labels after collision fix)
await shot('proof_mobile_delta', 390, 844);
await shot('proof_mobile_amalik', 390, 844, async p => { await p.selectOption('select', 'amalik'); await p.waitForTimeout(1200); });
await shot('proof_mobile_gale', 390, 844, async p => { await p.selectOption('select', 'gale'); await p.waitForTimeout(1800); });

await b.close(); server.close();
