import { chromium } from 'playwright';
const OUT = '/downloads/shots';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:4519', { waitUntil: 'networkidle' });
await page.waitForSelector('text=Route between two points', { timeout: 30000 });
// comparison Depot -> Wildcat (crosses rough terrain where 4 m matters)
await page.selectOption('select[aria-label="Route from"]', 'Depot');
await page.selectOption('select[aria-label="Route to"]', 'Wildcat');
await page.waitForSelector('text=Route comparison', { timeout: 30000 });
await page.waitForTimeout(1500);
const rail = page.locator('.rail--control');
await rail.evaluate((el) => { el.scrollTop = 0; });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/hires_compare_note.png` });
console.log('saved hires_compare_note.png');
// inspector near Wildcat
await page.getByRole('button', { name: 'Inspect a point on the map' }).click();
await page.waitForSelector('text=Click anywhere to read the data at that point');
const mapBox = await page.locator('.map-pane.is-active .leaflet-container').boundingBox();
await page.mouse.click(mapBox.x + mapBox.width * 0.5, mapBox.y + mapBox.height * 0.55);
await page.waitForSelector('text=Point inspector', { timeout: 10000 });
await page.waitForTimeout(600);
await rail.evaluate((el) => { el.scrollTop = el.scrollHeight; });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/hires_inspector.png` });
console.log('saved hires_inspector.png');
await browser.close();
