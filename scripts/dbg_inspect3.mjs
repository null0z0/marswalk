import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('console', (m) => { if (!m.text().includes('vite') && !m.text().includes('DevTools')) console.log('[c]', m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:4520', { waitUntil: 'networkidle' });
await page.waitForSelector('text=Route between two points', { timeout: 30000 });
const mapBox = await page.locator('.map-pane.is-active .leaflet-container').boundingBox();
const cx = mapBox.x + mapBox.width * 0.5, cy = mapBox.y + mapBox.height * 0.5;

// 1. add-waypoint mode click (existing, previously working flow)
await page.getByRole('button', { name: '+ Add waypoint on map' }).click();
await page.waitForSelector('text=Click inside the dashed coverage frame');
await page.mouse.click(cx, cy);
await page.waitForTimeout(600);
const wpAdded = await page.evaluate(() => document.body.innerText.includes('Waypoint P1'));
console.log('addMode click -> waypoint added:', wpAdded);
await page.getByRole('button', { name: /cancel/ }).click();

// 2. inspect mode click
await page.getByRole('button', { name: 'Inspect a point on the map' }).click();
await page.waitForSelector('text=Click anywhere to read the data at that point');
await page.mouse.click(cx, cy);
await page.waitForTimeout(600);
console.log('inspect click -> inspector:', await page.evaluate(() => document.body.innerText.includes('Point inspector')));
await browser.close();
