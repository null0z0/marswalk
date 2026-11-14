import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox','--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport:{ width:1356, height:820 } })).newPage();
await p.addInitScript(() => {
  const orig = Node.prototype.removeChild;
  window.__bad = [];
  Node.prototype.removeChild = function(child) {
    if (child && child.parentNode !== this) {
      window.__bad.push({
        parentTag: this.tagName, parentCls: String(this.className).slice(0,80),
        childTag: child.tagName, childCls: String(child.className).slice(0,80),
        childHtml: (child.outerHTML || '').slice(0, 200),
        realParent: child.parentNode ? String(child.parentNode.className).slice(0,80) : 'null',
      });
    }
    return orig.call(this, child);
  };
});
p.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 120)));
await p.goto('http://localhost:4519', { waitUntil:'networkidle' });
await p.waitForTimeout(2500);
await p.click('button:has-text("Mission planner")');
await p.click('summary:has-text("Layers")');
await p.selectOption('select[aria-label="Route model"]', 'leastcost');
await p.waitForTimeout(5000);
await p.click('button:has-text("3D Terrain")');
await p.waitForTimeout(5000);
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
await setRegion('gale'); await p.waitForTimeout(15000); console.log('gale2 settled');
console.log(JSON.stringify(await p.evaluate(() => window.__bad), null, 1));
await b.close();
