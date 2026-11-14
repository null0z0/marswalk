import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox','--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport:{ width:1356, height:820 } })).newPage();
p.on('pageerror', e => console.log('PAGEERROR:', String(e.stack || e).slice(0, 900)));
p.on('console', m => { const t = m.text(); if (/error|Error|removeChild|component stack|at \w+ \(http/i.test(t)) console.log('CONSOLE:', t.slice(0, 900)); });
await p.goto('http://localhost:4519', { waitUntil:'networkidle' });
await p.waitForTimeout(2500);
await p.click('button:has-text("Mission planner")');
await p.click('summary:has-text("Layers")');
await p.selectOption('select[aria-label="Route model"]', 'leastcost');
await p.waitForTimeout(5000);
await p.click('button:has-text("3D Terrain")');
await p.waitForTimeout(5000);
console.log('jezero 3D mounted');
async function setRegion(id) {
  await p.evaluate((id) => {
    const s = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => o.value === 'delta'));
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(s, id);
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }, id);
}
await setRegion('gale'); await p.waitForTimeout(25000); console.log('gale1 settled');
await setRegion('delta'); await p.waitForTimeout(8000); console.log('jezero settled');
await setRegion('gale'); await p.waitForTimeout(25000); console.log('gale2 settled');
await b.close();
