import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('console', (m) => console.log('[console]', m.type(), m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:4520', { waitUntil: 'networkidle' });
await page.waitForSelector('text=Route between two points', { timeout: 30000 });
await page.getByRole('button', { name: 'Inspect a point on the map' }).click();
await page.waitForSelector('text=Click anywhere to read the data at that point');
const mapBox = await page.locator('.map-pane.is-active .leaflet-container').boundingBox();
console.log('mapbox', mapBox);
// what element is at the click point?
const cx = mapBox.x + mapBox.width * 0.35, cy = mapBox.y + mapBox.height * 0.7;
const el = await page.evaluate(([x, y]) => {
  const e = document.elementFromPoint(x, y);
  return e ? { tag: e.tagName, cls: e.className && e.className.baseVal !== undefined ? e.className.baseVal : String(e.className), id: e.id } : null;
}, [cx, cy]);
console.log('element at click:', el);
await page.mouse.click(cx, cy);
await page.waitForTimeout(800);
const has = await page.evaluate(() => document.body.innerText.includes('Point inspector'));
console.log('Point inspector in DOM:', has);
const markerCount = await page.evaluate(() => document.querySelectorAll('.leaflet-marker-icon').length);
console.log('markers:', markerCount);
await browser.close();
