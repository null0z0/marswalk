// Real-browser smoke regression: navigation crash guard + restored features.
// Catches the class of bugs that unit tests miss: runtime ReferenceErrors that
// blank the app ("view is not defined"), three.js geometry misuse
// ("byteLength" per-frame crashes), and merge losses (globe events layer).
//
// Run:  npm run build && node scripts/smoke.mjs
// (serves dist/ itself; needs nothing else running)

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const DIST = new URL('../dist', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.tif': 'image/tiff' };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const body = await readFile(join(DIST, p)).catch(() => readFile(join(DIST, 'index.html')));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const url = `http://localhost:${server.address().port}/`;

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));

try {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('.mode-tabs-header button', { timeout: 15000 });
  await page.waitForTimeout(1500);

  // 1. Every screen navigates without a runtime crash (the "view is not defined" guard)
  for (const tab of ['3D Terrain', 'Global', '2D Map']) {
    await page.locator(`button:has-text("${tab}")`).first().click();
    await page.waitForTimeout(2500);
  }
  await page.locator('button:has-text("Mission planner")').first().click();
  await page.waitForTimeout(1500);
  await page.locator('button:has-text("Two-point route")').first().click();
  await page.waitForTimeout(1000);
  check('all screens navigate without crash', errors.length === 0, errors[0] || '');

  // 2. Mode buttons render one label each (merge-lost CSS regression)
  const labels = await page.evaluate(() => [...document.querySelectorAll('.mode-tabs-header button')].map(x => x.innerText.trim()));
  check('mode buttons show a single label', JSON.stringify(labels) === JSON.stringify(['Two-point route', 'Mission planner']), labels.join(' | '));

  // 3. Two-point route computes
  await page.selectOption('select[aria-label="Route from"]', { index: 2 });
  await page.selectOption('select[aria-label="Route to"]', { index: 3 });
  await page.waitForTimeout(2500);
  const metrics = await page.locator('.metrics-strip').first().innerText().catch(() => '');
  check('two-point route computes distance', /DISTANCE/i.test(metrics), metrics.replace(/\n/g, ' ').slice(0, 80));

  // 4. Global view with an active route: no three.js geometry errors (BufferAttribute guard)
  const before = errors.length;
  await page.locator('button:has-text("Global")').first().click();
  await page.waitForTimeout(3500);
  check('route arc renders without geometry errors', errors.length === before, errors[before] || '');

  // 5. Restored natural-events layer: markers, list, sourced popup
  const evCount = await page.locator('button[aria-label^="recorded natural events"]').count();
  check('globe shows recorded-event markers', evCount > 0, `${evCount} visible`);
  await page.locator('button', { hasText: 'Meteoroid impact' }).first().click();
  await page.waitForTimeout(1200);
  const popup = await page.locator('text=Details + source').first().isVisible().catch(() => false);
  check('event selection opens sourced popup', popup);
  await page.keyboard.press('Escape').catch(() => {});

  // 6. Global sampler draws a far-apart great-circle pair without inventing a route
  await page.selectOption('select[aria-label="Profile from"]', { index: 1 });
  await page.selectOption('select[aria-label="Profile to"]', { index: 5 });
  await page.locator('button:has-text("Sample")').click();
  await page.waitForTimeout(4000);
  const profile = await page.locator('text=/km great-circle/').first().innerText().catch(() => '');
  check('global sampler reports great-circle distance + profile', /km great-circle/.test(profile), profile.slice(0, 80));
  const errAfterSample = errors.length;
  check('sampler arc renders without geometry errors', errAfterSample === before, errors[before] || '');

  // Globe two-point panel: walk minutes must match the km shown (pace 1.0 km/h)
  const panel = await page.locator('.globe-distance-panel').first().innerText().catch(() => '');
  const kmM = panel.match(/([\d.]+)\s*km/), minM = panel.match(/(\d+)\s*min walk/);
  const timeConsistent = kmM && minM && Math.abs(parseFloat(minM[1]) - Math.round(parseFloat(kmM[1]) * 60)) <= 1;
  check('globe panel walk time matches distance', !!timeConsistent, (kmM && minM) ? `${kmM[1]} km -> ${minM[1]} min` : panel.slice(0, 60));

  // 7. Radiation scoping: Gale measured (Hassler), Jezero honestly not computed
  await page.locator('button:has-text("2D Map")').first().click();
  await page.waitForTimeout(1500);
  const scen = page.locator('select').first();
  await scen.selectOption({ label: 'Gale - Yellowknife Bay' });
  await page.waitForTimeout(2500);
  check('Gale shows Hassler RAD card', (await page.locator('text=/Hassler/').count()) > 0);
  const fromVal = await page.locator('select[aria-label="Route from"]').inputValue();
  check('region switch resets stale route selection', fromVal === '' || fromVal === 'null', `from=${fromVal}`);
  await scen.selectOption({ label: 'Jezero - Delta Front' });
  await page.waitForTimeout(2500);
  check('Jezero marks radiation not computed', (await page.locator('text=/Not computed for this region/').count()) > 0);

  // 8. Planner mode: budget strip renders with a computed plan
  await page.locator('button:has-text("Mission planner")').first().click();
  await page.waitForTimeout(2000);
  const strip = await page.locator('.metrics-strip').first().innerText().catch(() => '');
  check('mission planner shows budget + planned time', /Budget/i.test(strip) && /Planned/i.test(strip), strip.replace(/\n/g, ' ').slice(0, 90));
  // Planner reacts to change: simulated +60 min stop overrun recomputes the
  // plan (planned time/buffer/walked change), Reset restores the baseline.
  const base = strip.replace(/\s+/g, ' ');
  await page.locator('button:has-text("+60 min overrun")').click();
  await page.waitForTimeout(1500);
  const over = (await page.locator('.metrics-strip').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
  await page.locator('button:has-text("Reset plan")').click();
  await page.waitForTimeout(1500);
  const reset = (await page.locator('.metrics-strip').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
  check('planner recomputes on overrun + reset restores', over !== base && reset === base, `base ${base.slice(0, 40)} | over ${over.slice(0, 40)}`);

  check('zero page errors across the whole pass', errors.length === 0, errors[0] || '');
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} smoke checks passed`);
process.exit(failed.length ? 1 : 0);
