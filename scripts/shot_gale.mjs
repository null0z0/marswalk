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
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForSelector('.leaflet-container', { timeout: 15000 });
  await p.waitForTimeout(1200);
  if (fn) await fn(p);
  await p.waitForTimeout(900);
  await p.screenshot({ path: `/tmp/${name}.png` });
  console.log(name, 'done');
  await p.close();
}
await shot('shot5_gale', 1440, 900, async p => {
  await p.selectOption('select', 'gale');
  await p.waitForTimeout(800);
  const header = await p.textContent('body');
  const m = header.match(/Route\s+([\d.]+)\s*km/);
  console.log('GALE HEADER ROUTE:', m && m[1]);
  const plan = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('td, div')].map(e => e.textContent).filter(t => /→/.test(t)).slice(0, 12);
    return rows;
  });
  console.log('PLAN ROWS:', JSON.stringify(plan));
});
await shot('shot5_gale_layers', 1440, 900, async p => {
  await p.selectOption('select', 'gale');
  await p.click('summary:has-text("Layers")');
  for (const label of ['NASA recorded traverse geometry', 'Recorded rover stops']) {
    await p.check(`label:has-text("${label}") input`);
  }
  await p.waitForTimeout(800);
});
await b.close(); server.close();
