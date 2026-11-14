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
p.on('console', m => console.log('[console]', m.type(), m.text().slice(0, 200)));
p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
await p.goto(url, { waitUntil: 'networkidle' });
await p.waitForSelector('.leaflet-container', { timeout: 15000 });
await p.selectOption('select', 'amalik');
await p.click('button:has-text("3D Terrain")');
await p.waitForTimeout(8000);
const info = await p.evaluate(() => {
  const c = document.querySelector('canvas');
  if (!c) return { canvas: false };
  let px = null;
  try {
    const t = document.createElement('canvas');
    t.width = c.width; t.height = c.height;
    t.getContext('2d').drawImage(c, 0, 0);
    const d = t.getContext('2d').getImageData(0, 0, t.width, t.height).data;
    let mn = 255, mx = 0;
    for (let i = 0; i < d.length; i += 400) { mn = Math.min(mn, d[i]); mx = Math.max(mx, d[i]); }
    px = { w: c.width, h: c.height, min: mn, max: mx };
  } catch (e) { px = { err: String(e) }; }
  return { canvas: true, px };
});
console.log('canvas info:', JSON.stringify(info));
await p.screenshot({ path: '/tmp/shot4_3d_amalik.png' });
console.log('shot saved');
await b.close(); server.close();
