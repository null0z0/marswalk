import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('console', (m) => { if (m.text().includes('[MapClick]')) console.log(m.text()); });
await page.goto('http://localhost:4520', { waitUntil: 'networkidle' });
await page.waitForSelector('text=Route between two points', { timeout: 30000 });
await page.getByRole('button', { name: 'Inspect a point on the map' }).click();
await page.waitForSelector('text=Click anywhere to read the data at that point');
const mapBox = await page.locator('.map-pane.is-active .leaflet-container').boundingBox();
for (const [fx, fy, tag] of [[0.5, 0.5, 'center'], [0.1, 0.9, 'bottom-left'], [0.9, 0.5, 'right'], [0.5, 0.1, 'top']]) {
  const cx = mapBox.x + mapBox.width * fx, cy = mapBox.y + mapBox.height * fy;
  const el = await page.evaluate(([x, y]) => {
    const e = document.elementFromPoint(x, y);
    return e ? `${e.tagName}.${String(e.className.baseVal !== undefined ? e.className.baseVal : e.className)}` : 'none';
  }, [cx, cy]);
  console.log(`click ${tag} on ${el}`);
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(500);
}
const has = await page.evaluate(() => document.body.innerText.includes('Point inspector'));
console.log('Point inspector in DOM:', has);
await browser.close();
