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
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
await p.waitForSelector('.leaflet-container', { timeout: 15000 });
await p.evaluate(() => localStorage.removeItem('marswalk-plan-v1'));
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('.leaflet-container', { timeout: 15000 });
await p.waitForTimeout(1000);
// Gale
await p.evaluate(() => {
  const sel = document.querySelectorAll('select')[0];
  const opt = [...sel.options].find(o => o.textContent.includes('Gale'));
  sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await p.waitForSelector('select[aria-label="Route from"]', { timeout: 25000 });
await p.waitForTimeout(1500);
await p.selectOption('select[aria-label="Route from"]', 'Rocknest');
await p.selectOption('select[aria-label="Route to"]', { label: 'Drill sites' });
await p.waitForTimeout(1200);
await p.screenshot({ path: '/downloads/m8_gale_ab_straight.png' });
// follow the recorded drive path
await p.click('text=Follow Curiosity');
await p.waitForTimeout(2500);
await p.screenshot({ path: '/downloads/m8_gale_traverse.png' });
const t = await p.evaluate(() => document.body.innerText);
console.log('traverse readout:', (t.match(/[\d.]+ km along the recorded drives[^\n]*/) || ['MISSING'])[0]);
// reversed direction disclosure
await p.selectOption('select[aria-label="Route from"]', 'Departure');
await p.selectOption('select[aria-label="Route to"]', 'Rocknest');
await p.waitForTimeout(2500);
const t2 = await p.evaluate(() => document.body.innerText);
console.log('reversed disclosure:', /Against the driven record/.test(t2) ? 'OK' : 'MISSING');
await p.screenshot({ path: '/downloads/m8_gale_reversed.png' });
await b.close(); server.close(); process.exit(0);
