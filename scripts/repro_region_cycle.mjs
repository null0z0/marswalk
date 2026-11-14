// Region-change cycle with 3D mounts (second half of the crash repro).
import path from 'node:path'; import http from 'node:http'; import fs from 'node:fs';
import { chromium } from 'playwright';
const dist = '/downloads/marswalk/dist';
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.bin':'application/octet-stream','.geojson':'application/json' };
const server = http.createServer((req,res)=>{ const rel = req.url==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/,'');
  fs.readFile(path.join(dist,rel),(e,buf)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'content-type':MIME[path.extname(rel).toLowerCase()]||'application/octet-stream'}); res.end(buf); }); });
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox','--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport:{ width:1356, height:820 } })).newPage();
const errors = [];
p.on('pageerror', e => errors.push(String(e)));
await p.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil:'networkidle' });
await p.waitForTimeout(2500);

async function setRegion(id) {
  await p.evaluate((id) => {
    const s = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => o.value === 'delta'));
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(s, id);
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }, id);
}
async function mount3D(label, waitMs) {
  await p.click('button:has-text("3D Terrain")');
  // Gale's 2 m grid blocks the renderer while the mesh builds; do not run
  // evaluate during that window - wait, then check errors without touching it.
  await p.waitForTimeout(waitMs);
  console.log(`${label}: pageerrors=${errors.length}`);
  if (errors.length) console.log('  ERRORS:', errors.slice(0, 3).join(' | ').slice(0, 400));
  await p.click('button:has-text("2D Map")', { timeout: 60000 }).catch(e => console.log('  back-to-2D click:', String(e).slice(0, 80)));
  await p.waitForTimeout(1000);
}

// Jezero default -> 3D -> Gale -> 3D -> Jezero -> 3D
await mount3D('jezero default -> 3D', 6000);
await setRegion('gale');
await p.waitForTimeout(4000);
await mount3D('gale after region change -> 3D', 30000);
await p.screenshot({ path: '/downloads/repro_cycle_gale3d.png', timeout: 60000 }).catch(e => console.log('  shot:', String(e).slice(0, 80)));
await setRegion('delta');
await p.waitForTimeout(4000);
await mount3D('jezero again -> 3D', 8000);
console.log(errors.length === 0 ? 'PASS: region cycle, no page errors' : 'FAIL: page errors present');
await b.close(); server.close();
process.exit(errors.length === 0 ? 0 : 1);
