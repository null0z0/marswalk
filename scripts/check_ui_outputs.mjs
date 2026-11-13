import { chromium } from 'playwright';
import legs from '/downloads/marswalk-work/public/data/legs.json' with { type: 'json' };
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-sandbox'] });
const d = await b.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
await d.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await d.waitForTimeout(2000);
await d.click('text=+60 min overrun at current stop');
await d.waitForTimeout(800);
const hdr = (await d.textContent('.flex.flex-wrap.items-center')).replace(/\s+/g, ' ');
const tbl = (await d.textContent('table')).replace(/\s+/g, ' ');
const L = legs.legs;
const expected = {
  routeKm: ((L['Depot|Wildcat'].at(-1)[0] + L['Wildcat|Skinner'].at(-1)[0] + L['Depot|Skinner'].at(-1)[0]) / 1000).toFixed(2),
  dw: Math.round(L['Depot|Wildcat'].at(-1)[0]), ws: Math.round(L['Wildcat|Skinner'].at(-1)[0]), sd: Math.round(L['Depot|Skinner'].at(-1)[0]),
};
console.log('RENDERED HEADER:', hdr);
console.log('RENDERED TABLE:', tbl);
console.log('EXPECTED from legs.json: route', expected.routeKm, 'km; legs', expected.dw, expected.ws, expected.sd);
const ok = hdr.includes(`Route ${expected.routeKm} km`) && tbl.includes(`${expected.dw}m`) && tbl.includes(`${expected.ws}m`) && tbl.includes(`${expected.sd}m`);
console.log(ok ? 'UI OUTPUTS MATCH DATA' : 'UI OUTPUT MISMATCH');
await b.close();
process.exit(ok ? 0 : 1);
