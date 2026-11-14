import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { extname, join } from 'path';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const srv = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = join('dist', p);
  if (!existsSync(f)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise(r => srv.listen(4577, r));
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await (await b.newContext({ viewport: { width: 1356, height: 820 } })).newPage();
p.on('request', r => { if (r.url().includes('trek.nasa.gov')) console.log('REQ', r.url().split('default028mm/')[1]); });
p.on('requestfailed', r => { if (r.url().includes('trek.nasa.gov')) console.log('FAIL', r.url().split('default028mm/')[1], r.failure()?.errorText); });
p.on('console', m => { if (m.type() === 'error') console.log('PAGEERR', m.text()); });
await p.goto('http://127.0.0.1:4577/', { waitUntil: 'networkidle' });
await p.click('button:has-text("Global")');
await p.waitForTimeout(15000);
const info = await p.evaluate(() => {
  const el = document.querySelector('.global-view .leaflet-container');
  const imgs = [...document.querySelectorAll('.leaflet-tile-pane img')];
  return { size: el ? [el.clientWidth, el.clientHeight] : null, tiles: imgs.length, loaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length };
});
console.log('map size/tiles:', JSON.stringify(info));
await p.screenshot({ path: '/downloads/m8_global.png' });
await b.close(); srv.close();
