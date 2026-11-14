// UI count-consistency assertion: with via waypoints present and with start-at
// overrides, the header, the decision banner and the plan summary must report
// the SAME science-objective counts (vias are navigation, never objectives).
// Serves the production build, drives real scenarios in Chromium, exits 1 on
// any mismatch. Run: node scripts/verify_counts.mjs  (after: npx vite build)
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
const check = (name, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + detail : ''}`);
  if (!cond) failures++;
};

async function freshPage() {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
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

async function readCounts(p) {
  return p.evaluate(() => {
    const t = document.body.innerText;
    // header metric: "OBJECTIVES  1 kept / 3 lost" (label and value split across elements)
    const head = t.match(/OBJECTIVES\s*\n?\s*(\d+)\s*kept(?:\s*\/\s*(\d+)\s*lost)?/);
    // banner metric card: "KEPT  1 / 4"
    const banner = t.match(/KEPT\s*\n?\s*(\d+)\s*\/\s*(\d+)/);
    return {
      kept: head ? +head[1] : null,
      lost: head && head[2] != null ? +head[2] : 0,
      bannerKept: banner ? +banner[1] : null,
      bannerTotal: banner ? +banner[2] : null,
    };
  });
}

async function selectScenario(p, name) {
  await p.evaluate((nm) => {
    const sel = document.querySelectorAll('select')[0];
    const opt = [...sel.options].find(o => o.textContent.includes(nm));
    sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, name);
  await p.waitForTimeout(1400);
}

async function addVia(p, lat, lon) {
  await p.fill('input[placeholder="lat"]', String(lat));
  await p.fill('input[placeholder="lon"]', String(lon));
  await p.click('button[type="submit"]');
  await p.waitForTimeout(1000);
}

// Case 1: Jezero delta + one via (nothing dropped): header kept must equal science stop count (3), no via inflation
{
  const p = await freshPage();
  await addVia(p, 18.455, 77.412);
  const c = await readCounts(p);
  check('delta+via: header counts science only', c.kept === 3 && c.lost === 0, JSON.stringify(c));
  check('delta+via: no banner when nothing is deferred', c.bannerKept === null, JSON.stringify(c));
  await p.close();
}

// Case 2: Gale + far via forcing deferrals: banner kept/total == header kept/(kept+lost)
{
  const p = await freshPage();
  await selectScenario(p, 'Gale');
  await addVia(p, -4.612, 137.424);
  const c = await readCounts(p);
  check('gale+via: banner appears with matching kept', c.bannerKept !== null && c.bannerKept === c.kept, JSON.stringify(c));
  check('gale+via: banner total == kept+lost == 4 science stops', c.bannerTotal === c.kept + c.lost && c.bannerTotal === 4, JSON.stringify(c));

  // Case 3: same but start at a science stop (Rocknest) - counts must stay consistent
  await p.evaluate(() => {
    const sels = [...document.querySelectorAll('select')];
    const st = sels.find(s => [...s.options].some(o => o.textContent.includes('Rocknest')));
    const opt = [...st.options].find(o => o.textContent.includes('Rocknest'));
    st.value = opt.value; st.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.waitForTimeout(1000);
  const c3 = await readCounts(p);
  check('gale+via+start-at-science: banner kept == header kept', c3.bannerKept === null || c3.bannerKept === c3.kept, JSON.stringify(c3));
  check('gale+via+start-at-science: totals add up', c3.bannerKept === null || c3.bannerTotal === c3.kept + c3.lost, JSON.stringify(c3));
  await p.close();
}

await b.close();
server.close();
console.log(failures ? `FAILURES: ${failures}` : 'ALL COUNT CHECKS PASS');
process.exit(failures ? 1 : 0);
