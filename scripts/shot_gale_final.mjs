import path from 'node:path';
import http from 'node:http';
import fs from 'node:fs';
import { chromium } from 'playwright';
const dist = '/home/sandbox/marswalk/dist';
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
const gale = async p => { await p.selectOption('select', 'gale'); await p.waitForTimeout(1000); };
const layersOn = async p => {
  const sum = await p.$('summary:has-text("Layers")');
  if (sum) { await sum.click(); }
  for (const label of ['NASA recorded traverse geometry', 'Recorded rover stops', 'Elevation colors', 'Contours', 'CRISM 770 nm reflectance']) {
    const lbl = await p.$(`label:has-text("${label}") input`);
    if (lbl && !(await lbl.isChecked())) await lbl.check();
  }
  await p.waitForTimeout(700);
};
await shot('gale_final_desktop', 1440, 900, async p => { await gale(p); await layersOn(p); });
await shot('gale_final_3d', 1440, 900, async p => { await gale(p); await p.click('text=3D Terrain'); await p.waitForTimeout(2500); });
await shot('gale_final_mobile', 390, 844, async p => { await gale(p); });
await shot('gale_final_mobile_profile', 390, 844, async p => { await gale(p); await p.evaluate(() => {
  const els = [...document.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight + 200 && e.clientHeight > 300);
  els.forEach(e => { e.scrollTop = e.scrollHeight; });
}); await p.waitForTimeout(700); });
await b.close(); server.close();
