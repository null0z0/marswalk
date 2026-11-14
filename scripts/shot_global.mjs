import path from 'node:path'; import http from 'node:http'; import fs from 'node:fs';
import { chromium } from 'playwright';
const dist = '/home/sandbox/marswalk/dist';
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.png':'image/png' };
const server = http.createServer((req,res)=>{ const rel = req.url==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/,'');
  fs.readFile(path.join(dist,rel),(e,buf)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'content-type':MIME[path.extname(rel).toLowerCase()]||'application/octet-stream'}); res.end(buf); }); });
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox','--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport:{ width:1356, height:820 } })).newPage();
await p.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil:'networkidle' });
await p.click('button:has-text("Global")');
await p.waitForSelector('.global-view canvas', { timeout: 20000 });
await p.waitForTimeout(4000); // texture load + markers
const t = await p.evaluate(() => document.querySelector('.global-view').innerText);
console.log('honest banner:', /orientation only/.test(t) && /No planet-wide routing is claimed/.test(t) ? 'OK' : 'MISSING');
console.log('no universal-detail claim:', /does not mean\s*detailed terrain/.test(t) ? 'OK' : 'MISSING');
const shapes = await p.evaluate(() => [...document.querySelectorAll('.global-view svg')].map(e => e.firstElementChild?.tagName).join(','));
console.log('marker shape variety:', new Set(shapes.split(',')).size > 1 ? 'OK (' + shapes + ')' : 'FAIL ' + shapes);
// click a marker -> info card
console.log('marker buttons:', await p.evaluate(() => document.querySelectorAll('.global-view button[aria-label]').length));
await p.evaluate(() => { const btn = [...document.querySelectorAll('.global-view button[aria-label]')].find(b => b.getAttribute('aria-label') !== 'Close site info'); btn?.click(); });
await p.waitForTimeout(400);
const card = await p.evaluate(() => { const el = document.querySelector('.global-view'); return /not a routing target/.test(el.innerText) && /Context position/.test(el.innerText); });
console.log('marker info card:', card ? 'OK' : 'MISSING');
await p.screenshot({ path: '/downloads/m8_globe.png' });
// entry control jumps to detailed region
await p.click('button:has-text("Open Jezero workspace")');
await p.waitForTimeout(2500);
const region = await p.evaluate(() => document.querySelector('select')?.selectedOptions?.[0]?.textContent || '');
console.log('after entry click, region:', /Jezero/.test(region) ? 'JEZERO OK' : region);
await b.close(); server.close();
