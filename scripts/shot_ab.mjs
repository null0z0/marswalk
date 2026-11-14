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
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(url, { waitUntil: 'networkidle' });
await p.waitForSelector('.leaflet-container', { timeout: 15000 });
await p.evaluate(() => localStorage.removeItem('marswalk-plan-v1'));
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('.leaflet-container', { timeout: 15000 });
await p.waitForTimeout(900);
await p.selectOption('select[aria-label="Route from"]', 'Depot');
await p.selectOption('select[aria-label="Route to"]', 'Kukaklek');
await p.waitForTimeout(1500);
await p.screenshot({ path: '/downloads/m6_ab_straight.png' });
const t1 = await p.evaluate(() => document.body.innerText.match(/(\d\.\d+) km - (\d+) min walk/));
console.log('AB straight:', t1 ? t1[0] : 'NOT FOUND');
// switch model to least-cost and reshoot
await p.click('summary:has-text("Layers")');
await p.waitForTimeout(300);
await p.selectOption('select[aria-label="Route model"]', 'leastcost');
await p.click('summary:has-text("Layers")');
await p.waitForTimeout(1800);
await p.screenshot({ path: '/downloads/m6_ab_leastcost.png' });
const t2 = await p.evaluate(() => document.body.innerText.match(/(\d\.\d+) km - (\d+) min walk/));
console.log('AB leastcost:', t2 ? t2[0] : 'NOT FOUND');
await b.close(); server.close(); process.exit(0);
