// Preview screenshots for the route-comparison + point-inspector core work.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = '/downloads/shots';
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:4519';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('text=Route between two points', { timeout: 30000 });

// 1. Jezero two-point comparison: Depot -> Mageik (crosses several units)
await page.selectOption('select[aria-label="Route from"]', 'Depot');
await page.selectOption('select[aria-label="Route to"]', 'Kukaklek');
await page.waitForSelector('text=Route comparison', { timeout: 30000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/core_compare_2d.png`, fullPage: false });
console.log('saved core_compare_2d.png');

// scroll right rail so the comparison panel is fully visible
const rail = page.locator('.rail--control');
await rail.evaluate((el) => { el.scrollTop = el.scrollHeight; });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/core_compare_panel.png` });
console.log('saved core_compare_panel.png');

// 2. Point inspector: enable, click a spot near the middle of the map
await page.getByRole('button', { name: 'Inspect a point on the map' }).click();
await page.waitForSelector('text=Click anywhere to read the data at that point');
const mapBox = await page.locator('.map-pane.is-active .leaflet-container').boundingBox();
await page.mouse.click(mapBox.x + mapBox.width * 0.35, mapBox.y + mapBox.height * 0.7);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `/downloads/shots/dbg_click.png` });
await page.waitForSelector('text=Point inspector', { timeout: 10000 });
await page.waitForTimeout(600);
await rail.evaluate((el) => { el.scrollTop = el.scrollHeight; });
await page.screenshot({ path: `${OUT}/core_inspector.png` });
console.log('saved core_inspector.png');
// add-mode auto-closes after placement

// 3. 3D view with both compared routes
await page.getByRole('button', { name: /3D Terrain/ }).click();
await page.waitForSelector('canvas', { timeout: 30000 });
await page.waitForTimeout(3500);
await page.screenshot({ path: `${OUT}/core_compare_3d.png` });
console.log('saved core_compare_3d.png');

// 4. Back to 2D; planner mode must be unaffected
await page.getByRole('button', { name: /2D Map/ }).click();
await page.getByRole('button', { name: 'Mission planner' }).click();
await page.waitForSelector('text=Elevation profile (active route)', { timeout: 10000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/core_planner.png` });
console.log('saved core_planner.png');

// 5. Gale region: comparison over the 2 m grid (A* on ~870k cells - allow time)
await page.selectOption('section.panel select', 'gale');
await page.waitForSelector('text=Route between two points', { timeout: 30000 });
await page.waitForTimeout(1000);
await page.getByRole('button', { name: 'Two-point route' }).click();
await page.selectOption('select[aria-label="Route from"]', 'Rocknest');
await page.selectOption('select[aria-label="Route to"]', 'Shaler');
await page.waitForSelector('text=Route comparison', { timeout: 60000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/core_gale_compare.png` });
console.log('saved core_gale_compare.png');

await browser.close();
console.log('DONE');
