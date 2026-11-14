// Rendered-UI provenance check: confirms the built app displays exactly the
// values in the data files it serves, and that the plotted elevation-profile
// endpoint (read from the DOM, interpreted via the rendered axis ticks) equals
// the table's distance sum. No expected value is hardcoded; all expectations
// are derived from dist/data/<legs file> (the file the UI actually loaded) and
// the shipped scenario/station configs. Every scenario is exercised through the
// real scenario switcher, including a switch-back cycle.
//
// Run:
//   npm ci && npm run build
//   npm i -D playwright && npx playwright install chromium   # or set CHROME_PATH
//   node scripts/check_ui_outputs.mjs
//
// The script starts its own local static server for dist/; nothing external
// is required beyond the browser binary.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const scenariosData = JSON.parse(fs.readFileSync(path.join(root, 'src/data/scenarios.json'), 'utf8'));
const stationsData = JSON.parse(fs.readFileSync(path.join(root, 'src/data/stations.json'), 'utf8'));
const appSrc = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const num = re => +appSrc.match(re)[1];
const windowMin = num(/windowMin[^0-9]*?(\d+)/), dwellMin = num(/dwellMin[^0-9]*?(\d+)/), paceKmh = num(/paceKmh[^0-9]*?([\d.]+)/);
const defScenario = appSrc.match(/scenarioId[^;]*useState\('(\w+)'\)/)[1];

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.geojson': 'application/json' };
const server = http.createServer((req, res) => {
  const rel = req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  const p = path.join(dist, rel);
  fs.readFile(p, (e, buf) => {
    if (e) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const fails = [];
const check = (name, ok, detail = '') => {
  console.log((ok ? 'PASS' : 'FAIL') + ' - ' + name + (detail ? ` (${detail})` : ''));
  if (!ok) fails.push(name);
};

const { buildPlan } = await import(path.join(root, 'src/lib/planner.js'));

const b = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-sandbox'],
});
const d = await b.newPage({ viewport: { width: 1400, height: 900 } });
d.on('pageerror', e => { console.log('PAGEERROR:', String(e).slice(0, 200)); fails.push('pageerror: ' + String(e).slice(0, 80)); });
await d.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
await d.waitForTimeout(2500);

async function checkScenario(scenarioId, { select = false } = {}) {
  const sc = scenariosData[scenarioId];
  const region = (stationsData.find(s => s.id === sc.base) || {}).region || 'jezero';
  const legsFile = path.join(dist, 'data', region === 'gale' ? 'legs_gale.json' : 'legs.json');
  const legs = JSON.parse(fs.readFileSync(legsFile, 'utf8'));
  const L = legs.legs;
  if (select) {
    await d.selectOption('select', scenarioId);
    await d.waitForTimeout(1500); // region refetch + refit
  }
  const hdr = (await d.textContent('.flex.flex-wrap.items-center')).replace(/\s+/g, ' ');
  const tbl = (await d.textContent('table')).replace(/\s+/g, ' ');
  const stops = stationsData.filter(s => sc.stops.includes(s.id));
  const plan = buildPlan({ stops, priorities: sc.priorities, mustHaves: [], windowMin, dwellMin, paceKmh, legsData: legs, visited: [], baseId: sc.base });
  const routeLegs = plan.visitedLegs.concat(plan.sim.legs);
  const sum = routeLegs.reduce((a, l) => a + l.metrics.dist, 0);
  const routeKm = (sum / 1000).toFixed(2);
  const legDists = routeLegs.map(l => Math.round(l.metrics.dist));
  const tag = `[${scenarioId}]`;
  console.log(`RENDERED HEADER ${tag}:`, hdr);
  console.log(`RENDERED TABLE ${tag}:`, tbl);
  check(`${tag} header route km == served legs sum`, hdr.includes(`Route ${routeKm} km`), `${routeKm} km from ${sum.toFixed(2)} m`);
  check(`${tag} table leg distances == served legs`, legDists.every(dd => tbl.includes(`${dd}m`)), legDists.map(dd => `${dd}`).join('/') + ' m');
  const ascs = routeLegs.map(l => Math.round(l.metrics.asc));
  check(`${tag} table leg ascents == served legs (traversal direction)`, ascs.every(a => tbl.includes(`+${a}m`)), ascs.map(a => `+${a}`).join('/') + ' m');
  check(`${tag} header shows scenario label`, hdr.includes(sc.label.split(' - ')[1] ? sc.label : sc.label), sc.label);

  // ---- plotted profile against the data, via the axis geometry -----------
  const xAxisLine = await d.$eval('.recharts-xAxis .recharts-cartesian-axis-line', e => ({ x1: parseFloat(e.getAttribute('x1')), x2: parseFloat(e.getAttribute('x2')) }));
  const yAxisLine = await d.$eval('.recharts-yAxis .recharts-cartesian-axis-line', e => ({ y1: parseFloat(e.getAttribute('y1')), y2: parseFloat(e.getAttribute('y2')) }));
  const dAttr = await d.getAttribute('.recharts-line-curve', 'd');
  const nums = dAttr.match(/-?[\d.]+/g).map(Number);
  const endX = nums[nums.length - 2], endY = nums[nums.length - 1];
  check(`${tag} plotted profile ends at the full data span (x axis end)`, Math.abs(endX - xAxisLine.x2) < 1.5,
    `curve end x=${endX.toFixed(1)} vs axis end x=${xAxisLine.x2} (axis ${xAxisLine.x1}..${xAxisLine.x2} px == 0..${sum.toFixed(2)} m)`);
  const cum = [0];
  routeLegs.forEach(l => cum.push(cum[cum.length - 1] + l.metrics.dist));
  const dots = await d.$$eval('.recharts-reference-dot circle', els => els.map(e => parseFloat(e.getAttribute('cx'))));
  const dotsOk = dots.length === cum.length && dots.every((cx, i) => Math.abs(cx - (xAxisLine.x1 + cum[i] / sum * (xAxisLine.x2 - xAxisLine.x1))) < 1.5);
  check(`${tag} station dots plotted at cumulative leg distances`, dotsOk,
    `dots cx=${dots.map(v => v.toFixed(1)).join(',')} expected ${cum.map(c => (xAxisLine.x1 + c / sum * (xAxisLine.x2 - xAxisLine.x1)).toFixed(1)).join(',')}`);
  const allElevs = Object.values(L).flat().map(p => p[1]);
  const domMin = Math.min(...allElevs) - 4, domMax = Math.max(...allElevs) + 4;
  const yTop = Math.min(yAxisLine.y1, yAxisLine.y2), yBot = Math.max(yAxisLine.y1, yAxisLine.y2);
  const endElev = domMax - (endY - yTop) / (yBot - yTop) * (domMax - domMin);
  // round trip: profile must END at the same Base elevation it STARTED from
  const baseElev = routeLegs[0].metrics.profile[0][1];
  check(`${tag} plotted profile y endpoint == Base start elevation (round trip)`, Math.abs(endElev - baseElev) < 2,
    `plotted end ${endElev.toFixed(1)} m vs Base ${baseElev.toFixed(2)} m (domain ${domMin.toFixed(1)}..${domMax.toFixed(1)})`);

  // ---- region-specific layers sanity --------------------------------------
  if (region === 'gale') {
    const img = await d.$eval('.leaflet-image-layer', e => e.getAttribute('src'));
    check(`${tag} basemap is the Gale ortho crop`, img.includes('gale/ortho_crop.jpg'), img);
    const bodyTxt = (await d.textContent('body')).replace(/\s+/g, ' ');
    check(`${tag} no SIM 3464 geology strip for Gale`, !bodyTxt.includes('Geology strip along route'), 'geology strip hidden');
    check(`${tag} no BASE HABITAT badge for Gale base`, !bodyTxt.includes('BASE HABITAT'), 'declared-start badge used');
    check(`${tag} traverse layer labeled recorded geometry`, bodyTxt.includes('NASA recorded traverse geometry'), 'layer label');
  } else {
    const img = await d.$eval('.leaflet-image-layer', e => e.getAttribute('src'));
    check(`${tag} basemap is the Jezero ortho crop`, img.includes('/layers/ortho_crop.jpg'), img);
  }
  return { sum };
}

// default scenario, then every other scenario, then back to default: full
// region-switch cycle through the real UI.
await checkScenario(defScenario);
for (const id of Object.keys(scenariosData)) {
  if (id === defScenario) continue;
  await checkScenario(id, { select: true });
}
await checkScenario(defScenario, { select: true });

check('UI contains no Kodiak references', !((await d.textContent('body')) || '').includes('Kodiak'));

// --- Rover record timeline: slider must change the RENDERED archive layers ---
const setSol = async (v) => d.locator('input[type=range]').first().evaluate((el, val) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, val);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, String(v));
const trackJ = JSON.parse(fs.readFileSync(path.join(dist, 'data', 'rover_track.json'), 'utf8'));
const trackG = JSON.parse(fs.readFileSync(path.join(dist, 'data', 'rover_track_gale.json'), 'utf8'));
const orangePathPts = () => d.evaluate(() => {
  const p = [...document.querySelectorAll('.leaflet-overlay-pane path')].find(e => (e.getAttribute('stroke') || '').toLowerCase() === '#f97316');
  return p ? (p.getAttribute('d').match(/[ML]/g) || []).length : 0;
});
const orangeStops = () => d.evaluate(() =>
  [...document.querySelectorAll('.leaflet-overlay-pane path')].filter(e => (e.getAttribute('fill') || '').toLowerCase() === '#f97316').length);
const dimmedMarkers = () => d.evaluate(() =>
  [...document.querySelectorAll('.leaflet-marker-icon')].filter(e => (e.style.opacity || '1') !== '1').length);

// Jezero (default scenario active): enable the recorded-route layer
await d.click('text=Layers');
await d.locator('label', { hasText: 'Recorded rover positions' }).locator('input[type=checkbox]').first().check();
await d.waitForTimeout(600);
// Leaflet simplifies/clips polylines to the viewport, so rendered vertex
// counts are a subset of the data records: assert the rendered route changes
// with the slider (strict prefix shrink + full restore), and assert the exact
// record counts via the on-screen counter.
const fullPts = await orangePathPts();
check('[timeline] Jezero archive route layer renders', fullPts > 0, `${fullPts} rendered polyline vertices (viewport-simplified subset of ${trackJ.route.length})`);
await setSol(477);
await d.waitForTimeout(500);
const exp477 = trackJ.route.filter(p => p[2] <= 477).length;
const at477 = await orangePathPts();
check('[timeline] sol 477 shrinks the rendered route polyline', at477 > 0 && at477 < fullPts, `${fullPts} -> ${at477} rendered vertices`);
check('[timeline] record-count text matches archive filter exactly', ((await d.textContent('body')) || '').includes(`${exp477} of ${trackJ.route.length} records`), 'on-screen count 110 of 149');
const dimmed = await dimmedMarkers();
check('[timeline] stops recorded after sol 477 dim on the map', dimmed >= 1, `${dimmed} dimmed markers`);
await setSol(trackJ.route[trackJ.route.length - 1][2]);
await d.waitForTimeout(400);
check('[timeline] reset restores the full rendered route', (await orangePathPts()) === fullPts, 'full archive restored');

// Gale: stops layer filters by solFirst, drive segments unchanged
await d.selectOption('select', 'gale');
await d.waitForTimeout(1800);
await d.click('text=Layers');
await d.locator('label', { hasText: 'Recorded rover stops' }).locator('input[type=checkbox]').first().check();
await d.locator('label', { hasText: 'NASA recorded traverse geometry' }).locator('input[type=checkbox]').first().check();
await d.waitForTimeout(600);
const gFull = await orangeStops();
check('[timeline] Gale full archive renders all site stops', gFull === trackG.stops.length, `${gFull}/${trackG.stops.length} stops`);
const segCount = () => d.evaluate(() =>
  [...document.querySelectorAll('.leaflet-overlay-pane path')].filter(e => (e.getAttribute('stroke') || '').toLowerCase() === '#f97316' && !(e.getAttribute('fill') || '').toLowerCase().includes('f97316')).length);
const segBefore = await segCount();
await setSol(120);
await d.waitForTimeout(500);
const expStops120 = trackG.stops.filter(st => st.solFirst <= 120).length;
check('[timeline] sol 120 filters rendered Gale stops by solFirst', (await orangeStops()) === expStops120, `${await orangeStops()}/${expStops120} stops`);
check('[timeline] Gale drive segments carry no sol record and stay drawn', (await segCount()) === segBefore, `${segBefore} segments before/after`);
const gTxt = (await d.textContent('body')) || '';
check('[timeline] Gale timeline states segments are not sol-filtered', gTxt.includes('no per-segment sol record'), 'honest semantics text');

await b.close(); server.close();
if (fails.length) { console.log('FAILED:', fails.join(' | ')); process.exit(1); }
console.log('ALL UI CHECKS PASS');
