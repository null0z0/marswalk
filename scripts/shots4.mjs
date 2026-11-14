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

await shot('shot4_desktop_default', 1440, 900);
await shot('shot4_amalik', 1440, 900, async p => {
  await p.selectOption('select', 'amalik');
  await p.waitForTimeout(600);
  // open one station card details to show objective/photo
  await p.click('text=Shuyak');
});
await shot('shot4_amalik_layers', 1440, 900, async p => {
  await p.selectOption('select', 'amalik');
  await p.click('summary:has-text("Layers")');
  for (const label of ['Recorded rover positions (connected)', 'Recorded rover stops', 'Elevation colors', 'Contours']) {
    await p.check(`label:has-text("${label}") input`);
  }
});
await shot('shot4_overrun', 1440, 900, async p => {
  await p.click('button:has-text("overrun")');
  await p.waitForTimeout(700);
});
await shot('shot4_3d_amalik', 1440, 900, async p => {
  await p.selectOption('select', 'amalik');
  await p.click('button:has-text("3D Terrain")');
  await p.waitForTimeout(2500);
});
await shot('shot4_mobile_amalik', 390, 844, async p => {
  await p.selectOption('select', 'amalik');
});
await b.close(); server.close();
