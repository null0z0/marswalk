import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
await page.goto('http://localhost:4520', { waitUntil: 'networkidle' });
await page.waitForSelector('text=Route between two points', { timeout: 30000 });
const mapBox = await page.locator('.map-pane.is-active .leaflet-container').boundingBox();
const cx = mapBox.x + mapBox.width * 0.5, cy = mapBox.y + mapBox.height * 0.5;
await page.evaluate(() => {
  window.__events = [];
  for (const t of ['mousedown', 'mouseup', 'click', 'preclick']) {
    document.addEventListener(t, (e) => {
      window.__events.push(`${t} @ ${e.target.tagName}.${String(e.target.className && e.target.className.baseVal !== undefined ? e.target.className.baseVal : e.target.className).slice(0, 40)}`);
    }, true);
  }
  // also hook the leaflet map object directly
  const container = document.querySelector('.leaflet-container');
  container.addEventListener('click', () => window.__events.push('CONTAINER click'), true);
});
await page.mouse.click(cx, cy);
await page.waitForTimeout(600);
console.log(await page.evaluate(() => window.__events));
// does the leaflet map fire its own click? probe via internal registry
const leafletFired = await page.evaluate(() => {
  return new Promise((resolve) => {
    const container = document.querySelector('.leaflet-container');
    // react-leaflet stores the map instance on the container's react props; instead, listen for the leaflet 'click' by patching:
    resolve('n/a');
  });
});
await browser.close();
