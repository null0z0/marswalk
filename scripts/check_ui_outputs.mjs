// Rendered-UI provenance check: confirms the built app displays exactly the
// values in the data files it serves, and that the plotted elevation-profile
// endpoint (read from the DOM, interpreted via the rendered axis ticks) equals
// the table's distance sum. No expected value is hardcoded; all expectations
// are derived from dist/data/legs.json (the file the UI actually loaded).
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
const legsPath = path.join(dist, 'data', 'legs.json');
if (!fs.existsSync(legsPath)) {
  console.error('dist/data/legs.json missing - run `npm run build` first');
  process.exit(2);
}
const legs = JSON.parse(fs.readFileSync(legsPath, 'utf8'));

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

const b = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-sandbox'],
});
const d = await b.newPage({ viewport: { width: 1400, height: 900 } });
await d.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
await d.waitForTimeout(2500);

// ---- header + table against served data ----------------------------------
const hdr = (await d.textContent('.flex.flex-wrap.items-center')).replace(/\s+/g, ' ');
const tbl = (await d.textContent('table')).replace(/\s+/g, ' ');
const L = legs.legs;
const sum = L['Depot|Wildcat'].at(-1)[0] + L['Wildcat|Skinner'].at(-1)[0] + L['Depot|Skinner'].at(-1)[0];
const routeKm = (sum / 1000).toFixed(2);
const dw = Math.round(L['Depot|Wildcat'].at(-1)[0]);
const ws = Math.round(L['Wildcat|Skinner'].at(-1)[0]);
const sd = Math.round(L['Depot|Skinner'].at(-1)[0]);
console.log('RENDERED HEADER:', hdr);
console.log('RENDERED TABLE:', tbl);
check('header route km == legs.json leg sum', hdr.includes(`Route ${routeKm} km`), `${routeKm} km from ${sum.toFixed(2)} m`);
check('table leg distances == legs.json', tbl.includes(`${dw}m`) && tbl.includes(`${ws}m`) && tbl.includes(`${sd}m`), `${dw}/${ws}/${sd} m`);
const ascFwd = k => Math.round(L[k].reduce((a, p, i) => i ? a + Math.max(0, p[1] - L[k][i - 1][1]) : a, 0));
const ascRev = k => { const p = [...L[k]].reverse(); return Math.round(p.reduce((a, q, i) => i ? a + Math.max(0, q[1] - p[i - 1][1]) : a, 0)); };
// table rows are in traversal direction: Base->Wildcat (fwd), Wildcat->Skinner (fwd), Skinner->Base (reversed)
const ascs = [ascFwd('Depot|Wildcat'), ascFwd('Wildcat|Skinner'), ascRev('Depot|Skinner')];
check('table leg ascents == legs.json (traversal direction)', ascs.every(a => tbl.includes(`+${a}m`)), ascs.map(a => `+${a}`).join('/') + ' m');

// ---- plotted profile against the data, via the axis geometry -------------
// The X axis domain is [0, dataMax] and Y is [dataMin-4, dataMax+4], both fully
// determined by the data, so the rendered axis lines give an independent scale:
// the plotted curve endpoint and station dots are read from the DOM and mapped
// back through that scale, then compared with legs.json.
const xAxisLine = await d.$eval('.recharts-xAxis .recharts-cartesian-axis-line', e => ({ x1: parseFloat(e.getAttribute('x1')), x2: parseFloat(e.getAttribute('x2')) }));
const yAxisLine = await d.$eval('.recharts-yAxis .recharts-cartesian-axis-line', e => ({ y1: parseFloat(e.getAttribute('y1')), y2: parseFloat(e.getAttribute('y2')) }));
const dAttr = await d.getAttribute('.recharts-line-curve', 'd');
const nums = dAttr.match(/-?[\d.]+/g).map(Number);
const endX = nums[nums.length - 2], endY = nums[nums.length - 1];
check('plotted profile ends at the full data span (x axis end)', Math.abs(endX - xAxisLine.x2) < 1.5,
  `curve end x=${endX.toFixed(1)} vs axis end x=${xAxisLine.x2} (axis ${xAxisLine.x1}..${xAxisLine.x2} px == 0..${sum.toFixed(2)} m)`);
// station dots (Base, Wildcat, Skinner, Base-return) at cumulative leg distances
const cum = [0, L['Depot|Wildcat'].at(-1)[0], L['Depot|Wildcat'].at(-1)[0] + L['Wildcat|Skinner'].at(-1)[0], sum];
const dots = await d.$$eval('.recharts-reference-dot circle', els => els.map(e => parseFloat(e.getAttribute('cx'))));
const dotsOk = dots.length === 4 && dots.every((cx, i) => Math.abs(cx - (xAxisLine.x1 + cum[i] / sum * (xAxisLine.x2 - xAxisLine.x1))) < 1.5);
check('station dots plotted at cumulative leg distances', dotsOk,
  `dots cx=${dots.map(v => v.toFixed(1)).join(',')} expected ${cum.map(c => (xAxisLine.x1 + c / sum * (xAxisLine.x2 - xAxisLine.x1)).toFixed(1)).join(',')}`);
// y endpoint via the data-derived y domain
const allElevs = Object.values(L).flat().map(p => p[1]);
const domMin = Math.min(...allElevs) - 4, domMax = Math.max(...allElevs) + 4;
const yTop = Math.min(yAxisLine.y1, yAxisLine.y2), yBot = Math.max(yAxisLine.y1, yAxisLine.y2);
const endElev = domMax - (endY - yTop) / (yBot - yTop) * (domMax - domMin);
// the route is a round trip: it must END at the same Base elevation it STARTED from
// (first sample of the first leg). Tight check: one specific value, no alternatives.
const baseElev = L['Depot|Wildcat'][0][1];
check('plotted profile y endpoint == Base start elevation (round trip)', Math.abs(endElev - baseElev) < 2,
  `plotted end ${endElev.toFixed(1)} m vs Base ${baseElev.toFixed(2)} m (domain ${domMin.toFixed(1)}..${domMax.toFixed(1)})`);

// ---- Kodiak fully removed from the UI ------------------------------------
const body = (await d.textContent('body')).replace(/\s+/g, ' ');
check('UI contains no Kodiak references', !/kodiak/i.test(body));

await b.close();
server.close();
console.log(fails.length ? `${fails.length} UI CHECK FAILURES: ${fails.join(', ')}` : 'ALL UI CHECKS PASS');
process.exit(fails.length ? 1 : 0);
