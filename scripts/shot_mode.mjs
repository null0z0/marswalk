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

// first view: route mode, nothing preselected
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(url, { waitUntil: 'networkidle' });
await p.waitForSelector('.leaflet-container', { timeout: 15000 });
await p.evaluate(() => localStorage.removeItem('marswalk-plan-v1'));
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('.leaflet-container', { timeout: 15000 });
await p.waitForTimeout(1200);
await p.screenshot({ path: '/downloads/m8_firstview.png' });
const t0 = await p.evaluate(() => document.body.innerText);
console.log('firstview prompt:', /Pick two places/.test(t0) ? 'OK' : 'MISSING');
console.log('no budget metric in route mode:', !/Budget/.test(t0.split('metrics-strip')[1] || '') ? 'OK' : 'CHECK');

// select a pair, least-cost model
await p.selectOption('select[aria-label="Route from"]', 'Depot');
await p.selectOption('select[aria-label="Route to"]', 'Kukaklek');
await p.click('summary:has-text("Layers")');
await p.waitForTimeout(300);
await p.selectOption('select[aria-label="Route model"]', 'leastcost');
await p.click('summary:has-text("Layers")');
await p.waitForTimeout(1800);
await p.screenshot({ path: '/downloads/m8_pair_leastcost.png' });
const t1 = await p.evaluate(() => document.body.innerText);
console.log('pair readout:', /Base - Three Forks depot site . Kukaklek|Distance/.test(t1) ? 'OK' : 'MISSING');
console.log('planner footnote mode-aware check happens in planner mode');

// planner mode still intact
await p.click('button:has-text("Mission planner")');
await p.waitForTimeout(1200);
const t2 = await p.evaluate(() => document.body.innerText);
console.log('planner footnote least-cost:', /least-cost path geometry/.test(t2) ? 'OK' : 'MISSING: ' + (t2.match(/Times: declared[^\n]*/)?.[0] || 'none'));
await p.screenshot({ path: '/downloads/m8_planner.png' });

// mobile route mode
const m = await b.newPage({ viewport: { width: 390, height: 844 } });
await m.goto(url, { waitUntil: 'networkidle' });
await m.waitForSelector('.leaflet-container', { timeout: 15000 });
await m.evaluate(() => localStorage.removeItem('marswalk-plan-v1'));
await m.reload({ waitUntil: 'networkidle' });
await m.waitForSelector('.leaflet-container', { timeout: 15000 });
await m.waitForTimeout(1200);
await m.screenshot({ path: '/downloads/m8_mobile.png' });
await b.close(); server.close(); process.exit(0);
