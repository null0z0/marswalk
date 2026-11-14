import path from 'node:path'; import http from 'node:http'; import fs from 'node:fs';
import { chromium } from 'playwright';
const dist = '/home/sandbox/marswalk/dist';
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.png':'image/png' };
const server = http.createServer((req,res)=>{ const rel = req.url==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/,'');
  fs.readFile(path.join(dist,rel),(e,buf)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'content-type':MIME[path.extname(rel).toLowerCase()]||'application/octet-stream'}); res.end(buf); }); });
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox','--enable-unsafe-swiftshader'] });
const m = await (await b.newContext({ viewport:{ width:390, height:844 } })).newPage();
await m.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil:'networkidle' });
await m.click('button:has-text("Global")');
await m.waitForSelector('.global-view canvas', { timeout: 20000 });
await m.waitForTimeout(4500);
await m.screenshot({ path: '/downloads/m9_globe_mobile.png' });
// strict traverse refusal UI
const d = await (await b.newContext({ viewport:{ width:1356, height:820 } })).newPage();
await d.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil:'networkidle' });
await d.evaluate(() => {
  const sel = document.querySelector('select');
  const opt = [...sel.options].find(o => o.textContent.includes('Gale'));
  sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await d.waitForTimeout(1500);
await d.selectOption('select[aria-label="Route from"]', 'Rocknest');
await d.selectOption('select[aria-label="Route to"]', { label: 'Drill sites' });
await d.evaluate(() => {
  const boxes = [...document.querySelectorAll('input[type="checkbox"]')];
  const follow = boxes.find(c => c.parentElement.innerText.includes('recorded drive path'));
  if (follow && !follow.checked) follow.click();
});
await d.waitForTimeout(1500);
const txt = await d.evaluate(() => document.body.innerText);
console.log('strict refusal shown:', /gap of about/.test(txt) ? 'OK' : 'MISSING');
console.log('experiment opt-in offered:', /synthetic-connector experiment/.test(txt) ? 'OK' : 'MISSING');
await d.screenshot({ path: '/downloads/m9_traverse_strict.png' });
await b.close(); server.close();
