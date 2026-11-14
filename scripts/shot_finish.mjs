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
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForSelector('.leaflet-container', { timeout: 15000 });
  await p.waitForTimeout(1200);
  if (fn) await fn(p);
  await p.waitForTimeout(800);
  await p.screenshot({ path: `/tmp/${name}.png` });
  console.log(name, 'done');
  await p.close();
}

// 1. Jezero default: SolTimeline at full archive in the left panel
await shot('fin_jezero_timeline_full', 1440, 900);

// 2. Jezero slider mid-range: route filtered to records <= sol 477
await shot('fin_jezero_timeline_477', 1440, 900, async p => {
  const slider = p.locator('input[type=range]').first();
  await slider.evaluate((el) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, '477');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
});

// 3. MEDA caption: open the Wildcat card details
await shot('fin_meda_wildcat', 1440, 900, async p => {
  await p.evaluate(() => {
    const sums = [...document.querySelectorAll('summary')].filter(el => el.textContent.includes('measured conditions'));
    const wild = sums.find(el => {
      let n = el.parentElement;
      while (n) { if (n.textContent.includes('Wildcat Ridge') && !n.textContent.includes('Skinner Ridge')) return true; n = n.parentElement; }
      return false;
    });
    (wild || sums[0]).click();
  });
  await p.waitForTimeout(400);
  await p.locator('text=Air temperature by sensor').first().scrollIntoViewIfNeeded();
});

// 4. A/B compare: pin plan A, then shrink the window so B differs
await shot('fin_ab_compare', 1440, 900, async p => {
  await p.click('text=Pin as Plan A');
  await p.waitForTimeout(300);
  // find the window control (number input or slider labeled window) - try range sliders in right panel
  await p.click('text=Assumptions');
  await p.waitForTimeout(300);
  const el = p.locator('input[type=range][max="480"]');
  await el.evaluate((node) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(node, '120');
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.waitForTimeout(600);
  await p.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find(e => e.textContent.trim() === 'A/B compare');
    let n = el;
    while (n && n.scrollHeight <= n.clientHeight) n = n.parentElement;
    if (n) n.scrollTop = n.scrollHeight;
  });
  await p.waitForTimeout(400);
});

// 5. Gale: slider mid-range (stops filtered by solFirst <= 120)
await shot('fin_gale_timeline_120', 1440, 900, async p => {
  await p.selectOption('select', 'gale');
  await p.waitForTimeout(1800);
  const slider = p.locator('input[type=range]').first();
  await slider.evaluate((el) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, '120');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
});

await b.close(); server.close();
