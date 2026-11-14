// Regression shots for parent feedback: Gale strict traverse refusal with
// compare available but separated, and zoom-control click must not place a
// waypoint/inspect point.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
const OUT = '/downloads/shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:4519', { waitUntil: 'networkidle' });
await page.waitForSelector('text=Route between two points', { timeout: 30000 });

// Gale region
await page.selectOption('section.panel select', 'gale');
await page.waitForSelector('text=Route between two points', { timeout: 30000 });
await page.waitForTimeout(1200);
// pair that the recorded traverse refuses in strict mode (gap in the record):
// Drill sites -> Departure crosses a known archive gap per traverse tests
await page.selectOption('select[aria-label="Route from"]', 'JohnKleinCumberland');
await page.selectOption('select[aria-label="Route to"]', 'Departure');
await page.getByText("Follow Curiosity's recorded drive path").click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/reg_gale_refusal.png` });
const state = await page.evaluate(() => ({
  compareCheckboxVisible: !!document.querySelector('input[type=checkbox]:checked ~ span') && document.body.innerText.includes('Compare both route models'),
  refusal: document.body.innerText.includes('gap') || document.body.innerText.includes('do not connect'),
  comparisonPanel: document.body.innerText.includes('ROUTE COMPARISON'),
  separationNote: document.body.innerText.includes('Grid-model comparison is off while following the recorded drive path'),
}));
console.log('gale traverse refusal state:', JSON.stringify(state, null, 1));

// zoom-control click must NOT place an inspect point
await page.getByRole('button', { name: 'Inspect a point on the map' }).click();
await page.waitForSelector('text=Click anywhere to read the data at that point');
await page.locator('.leaflet-control-zoom-in').click();
await page.waitForTimeout(800);
const afterZoom = await page.evaluate(() => ({
  inspector: document.body.innerText.includes('Point inspector'),
  waypoint: document.body.innerText.includes('Waypoint P1'),
}));
console.log('after zoom-control click:', JSON.stringify(afterZoom));
await page.screenshot({ path: `${OUT}/reg_zoom_click.png` });
await browser.close();
console.log('DONE');
