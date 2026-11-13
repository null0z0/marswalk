import path from 'node:path';
import http from 'node:http';
import fs from 'node:fs';
import { chromium } from 'playwright';
const dist = '/tmp/marswalk/dist';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.geojson': 'application/json' };
const server = http.createServer((req, res) => {
  const rel = req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  fs.readFile(path.join(dist, rel), (e, buf) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream' }); res.end(buf); });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 160)));
await p.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
await p.waitForSelector('.leaflet-container', { timeout: 15000 });
await p.selectOption('select', 'gale');
await p.waitForTimeout(2000);
const info = await p.evaluate(() => {
  const img = document.querySelector('.leaflet-image-layer');
  const r = img ? img.getBoundingClientRect() : null;
  const pane = document.querySelector('.leaflet-map-pane');
  return {
    imgRect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
    imgSrc: img ? img.src.split('/').slice(-2).join('/') : null,
    mapSize: (() => { const m = document.querySelector('.leaflet-container').getBoundingClientRect(); return { w: Math.round(m.width), h: Math.round(m.height) }; })(),
  };
});
console.log(JSON.stringify(info));
// expected overlay pixel span at current zoom: crop is 1898 m wide
const zoomInfo = await p.evaluate(() => {
  const sc = document.querySelector('.leaflet-control-scale-line');
  return sc ? { label: sc.textContent, w: sc.getBoundingClientRect().width } : null;
});
console.log('scale:', JSON.stringify(zoomInfo));
await p.screenshot({ path: '/tmp/dbg_gale_map.png' });
await b.close(); server.close();
