// Screenshots of the Recorded natural events panel (Jezero + Gale).
import { chromium } from 'playwright';

const OUT = '/downloads/shots';
const BASE = 'http://localhost:4519';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('text=Route between two points', { timeout: 30000 });

// Jezero: scroll left rail to the panel and expand it
await page.locator('summary:has-text("Recorded natural events")').scrollIntoViewIfNeeded();
await page.locator('summary:has-text("Recorded natural events")').click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/hist_jezero_panel.png` });
console.log('saved hist_jezero_panel.png');

// expand the first local event card (Jan 2022 regional storm) and the MEDA card
await page.locator('summary:has-text("Regional dust storm")').first().click();
await page.locator('summary:has-text("Recorded weather (MEDA)")').first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/hist_jezero_event.png` });
console.log('saved hist_jezero_event.png');

// scroll further to show the "elsewhere on Mars" context section
const details = page.locator('details:has(summary:has-text("Recorded natural events"))');
await details.evaluate((el) => { el.scrollTop = el.scrollHeight; });
await page.locator('summary:has-text("Marsquake")').first().scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/hist_jezero_context.png` });
console.log('saved hist_jezero_context.png');

// Gale region: switch via the scenario select (same as shot_core.mjs)
await page.selectOption('section.panel select', 'gale');
{
  await page.waitForSelector('text=Route between two points', { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.locator('summary:has-text("Recorded natural events")').scrollIntoViewIfNeeded();
  await page.locator('summary:has-text("Recorded natural events")').click();
  await page.locator('summary:has-text("Planet-encircling")').first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/hist_gale_panel.png` });
  console.log('saved hist_gale_panel.png');
}

await browser.close();
