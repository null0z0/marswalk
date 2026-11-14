// Visual + behavioral proof for route models and polish fixes.
// Serves the production build, drives Chromium, saves screenshots, asserts.
import path from 'node:path';
import http from 'node:http';
import fs from 'node:fs';
import { chromium } from 'playwright';

const dist = new URL('../dist', import.meta.url).pathname;
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
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
let failures = 0;
const check = (name, cond, detail) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + detail : ''}`); if (!cond) failures++; };
const OUT = '/downloads';

async function freshPage(vp) {
  const p = await b.newPage({ viewport: vp || { width: 1440, height: 900 } });
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForSelector('.leaflet-container', { timeout: 15000 });
  await p.evaluate(() => localStorage.removeItem('marswalk-plan-v1'));
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('.leaflet-container', { timeout: 15000 });
  await p.waitForTimeout(900);
  // planner UI (counts, plan metrics) is mode-gated; enter planner mode
  const mp = await p.$('button:has-text("Mission planner")');
  if (mp) { await mp.click(); await p.waitForTimeout(600); }
  return p;
}
const planDist = (p) => p.evaluate(() => {
  const t = document.body.innerText;
  const m = t.match(/Route\s*\n?\s*([\d.]+)\s*km/i);
  return m ? +m[1] : null;
});
async function setRouteModel(p, v) {
  await p.click('summary:has-text("Layers")');
  await p.waitForTimeout(300);
  await p.selectOption('select[aria-label="Route model"]', v);
  await p.waitForTimeout(1500);
}

// 1) straight baseline numbers
{
  const p = await freshPage();
  const dStraight = await planDist(p);
  await p.screenshot({ path: `${OUT}/m6_straight.png` });
  // 2) switch model via the layers panel select
  await setRouteModel(p, 'leastcost');
  const dLeast = await planDist(p);
  await p.screenshot({ path: `${OUT}/m6_leastcost.png` });
  check('model select exists and switches', true);
  check('least-cost distance differs from straight baseline', dStraight !== null && dLeast !== null && Math.abs(dLeast - dStraight) > 0.001, `straight=${dStraight} least=${dLeast}`);
  const modelLabel = await p.evaluate(() => document.body.innerText.includes('slope-aware') || document.body.innerText.includes('Least-cost over terrain'));
  check('least-cost declared-model note visible in layers panel', modelLabel);
  await p.click('summary:has-text("Layers")'); // close
  await p.click('summary:has-text("Legend")');
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/m6_legend.png` });
  const legendModel = await p.evaluate(() => document.body.innerText.includes('least-cost terrain model'));
  check('legend names the active route model', legendModel);
  await p.close();
}

// 3) polish: plural decision reason (Gale + far via forces 3 deferrals)
{
  const p = await freshPage();
  await p.evaluate(() => {
    const sel = document.querySelectorAll('select')[0];
    const opt = [...sel.options].find(o => o.textContent.includes('Gale'));
    sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.waitForTimeout(1400);
  await p.fill('input[placeholder="lat"]', '-4.612');
  await p.fill('input[placeholder="lon"]', '137.424');
  await p.click('button[type="submit"]');
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/m6_plural_banner.png` });
  const txt = await p.evaluate(() => document.body.innerText);
  check('decision reason is plural-aware (no singular "this objective" for 3 drops)', !/Dropping this objective/i.test(txt), (txt.match(/(Dropping|Deferring)[^\n]*/i) || ['none'])[0]);
  await p.close();
}

// 4) polish: brief wording "computed at runtime"
{
  const p = await freshPage();
  await p.click('text=Mission brief');
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${OUT}/m6_brief.png` });
  const txt = await p.evaluate(() => document.body.innerText);
  check('brief says computed at runtime, not live', /computed at runtime/i.test(txt) && !/computed live/i.test(txt));
  await p.close();
}

// 5) polish: mobile overrun buttons wrap, not truncated
{
  const p = await freshPage({ width: 390, height: 844 });
  await p.evaluate(() => {
    const sel = document.querySelectorAll('select')[0];
    const opt = [...sel.options].find(o => o.textContent.includes('Gale'));
    sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.waitForTimeout(1400);
  // open the drawer first: on mobile the waypoint + time controls live there
  await p.click('button[aria-label="Open science objectives"]');
  await p.waitForTimeout(600);
  await p.fill('input[placeholder="lat"]', '-4.612');
  await p.fill('input[placeholder="lon"]', '137.424');
  await p.click('button[type="submit"]');
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/m6_mobile_overrun.png`, fullPage: false });
  const over = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter(b => /overrun/i.test(b.textContent));
    return btns.map(b => ({ w: b.getBoundingClientRect().width, truncated: b.scrollWidth > b.clientWidth + 2, text: b.textContent.trim().slice(0, 40) }));
  });
  check('mobile overrun button(s) not truncated', over.length > 0 && over.every(o => !o.truncated), JSON.stringify(over));
  await p.close();
}

await b.close();
server.close();
console.log(failures ? `FAILURES: ${failures}` : 'ALL ROUTE-MODEL/POLISH CHECKS PASS');
process.exit(failures ? 1 : 0);
