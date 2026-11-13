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
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(url, { waitUntil: 'networkidle' });
await p.waitForSelector('.leaflet-container', { timeout: 15000 });
await p.selectOption('select', 'gale');
await p.waitForTimeout(1200);
await p.click('summary:has-text("Layers")');
await p.check('label:has-text("CRISM 770 nm reflectance") input');
await p.waitForTimeout(700);
await p.click('summary:has-text("Legend & Data")');
await p.waitForTimeout(500);
await p.screenshot({ path: '/tmp/gale_crism_isolated.png' });
console.log('done');
await b.close(); server.close();
