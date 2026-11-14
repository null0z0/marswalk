import { chromium } from 'playwright';
const OUT = '/downloads/shots';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:4519', { waitUntil: 'networkidle' });
await page.waitForSelector('text=Route between two points', { timeout: 30000 });

// planner mode + least-cost model
await page.getByRole('button', { name: 'Mission planner' }).click();
await page.waitForTimeout(1500);
await page.locator('summary:has-text("Layers")').first().click();
await page.waitForTimeout(400);
await page.selectOption('select[aria-label="Route model"]', { label: 'Least-cost over terrain (slope-aware)' });
await page.locator('summary:has-text("Layers")').first().click(); // close popover
await page.waitForTimeout(4000); // A* legs compute
await page.screenshot({ path: `${OUT}/qa_lc_2d.png` });
console.log('saved qa_lc_2d.png');

// 3D same plan
await page.getByRole('button', { name: '3D Terrain' }).click();
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/qa_lc_3d.png` });
console.log('saved qa_lc_3d.png');

// back to 2D, elevation profile strip
await page.getByRole('button', { name: '2D Map' }).click();
await page.waitForTimeout(1000);
const ep = page.locator('text=Elevation profile (active route)').first();
await ep.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/qa_lc_profile.png` });
console.log('saved qa_lc_profile.png');

// inspect mode: click on geology polygon -> no popup should open
await page.getByRole('button', { name: 'Inspect a point on the map' }).click();
await page.waitForSelector('text=Click anywhere to read the data at that point');
const mapBox = await page.locator('.map-pane.is-active .leaflet-container').boundingBox();
await page.mouse.click(mapBox.x + mapBox.width * 0.45, mapBox.y + mapBox.height * 0.6);
await page.waitForSelector('text=Point inspector', { timeout: 10000 });
await page.waitForTimeout(500);
const popups = await page.locator('.leaflet-popup').count();
console.log('popups open after inspect click:', popups);
await page.screenshot({ path: `${OUT}/qa_inspect_nopopup.png` });
await browser.close();
