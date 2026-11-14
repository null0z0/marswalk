import path from 'node:path'; import http from 'node:http'; import fs from 'node:fs';
import { chromium } from 'playwright';
const dist = '/downloads/marswalk/dist';
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.bin':'application/octet-stream','.geojson':'application/json' };
const server = http.createServer((req,res)=>{ const rel = req.url==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/,'');
  fs.readFile(path.join(dist,rel),(e,buf)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'content-type':MIME[path.extname(rel).toLowerCase()]||'application/octet-stream'}); res.end(buf); }); });
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox','--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport:{ width:1356, height:820 } })).newPage();
await p.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil:'networkidle' });
await p.waitForTimeout(2500);
await p.evaluate(() => {
  const s = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => o.value === 'gale'));
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(s, 'gale'); s.dispatchEvent(new Event('change', { bubbles: true }));
});
await p.waitForTimeout(4000);
await p.click('button:has-text("3D Terrain")');
await p.waitForTimeout(25000);
const info = await p.evaluate(() => {
  const cv = document.querySelector('.map-pane canvas');
  if (!cv) return { err: 'no canvas' };
  const keys = Object.keys(cv).concat(cv.parentElement ? Object.keys(cv.parentElement) : []);
  const r3fKey = keys.find(k => k.startsWith('__r3f'));
  const root = cv.__r3f || (cv.parentElement && cv.parentElement.__r3f);
  if (!root) return { keys: keys.slice(0, 10) };
  const store = root.store || root;
  let state = null;
  try { state = store.getState ? store.getState() : null; } catch (e) {}
  if (!state) return { rootKeys: Object.keys(root).slice(0, 15) };
  return {
    interaction: state.internal.interaction.map(o => ({ type: o.type, name: o.name, handlers: o.__r3f ? Object.keys(o.__r3f.handlers || {}) : null, verts: o.geometry && o.geometry.attributes.position ? o.geometry.attributes.position.count : null })),
    hovered: state.internal.hovered.size,
    frameloop: state.frameloop,
  };
});
console.log(JSON.stringify(info, null, 1));
// measure a real pointermove over the canvas
const cv = await p.$('.map-pane canvas');
const bb = await cv.boundingBox();
await p.mouse.move(bb.x + 300, bb.y + 300);
for (let i = 0; i < 4; i++) {
  const t0 = Date.now();
  await p.mouse.move(bb.x + 310 + i * 12, bb.y + 305 + i * 7, { steps: 1 });
  console.log('pointermove', i, Date.now() - t0, 'ms');
}
await b.close(); server.close();
