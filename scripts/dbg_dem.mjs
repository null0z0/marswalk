import path from 'node:path'; import http from 'node:http'; import fs from 'node:fs';
import { chromium } from 'playwright';
const dist = '/home/sandbox/marswalk/dist';
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.png':'image/png' };
const server = http.createServer((req,res)=>{ const rel = req.url==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/,'');
  fs.readFile(path.join(dist,rel),(e,buf)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'content-type':MIME[path.extname(rel).toLowerCase()]||'application/octet-stream'}); res.end(buf); }); });
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox','--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport:{ width:1356, height:820 } })).newPage();
p.on('pageerror', e => console.log('PAGEERR', String(e).slice(0,300)));
p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0,300)); });
await p.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil:'networkidle' });
await p.click('button:has-text("Global")');
await p.waitForSelector('.global-view canvas', { timeout: 20000 });
await p.selectOption('select[aria-label="Profile from"]', 'perseverance-m20');
await p.selectOption('select[aria-label="Profile to"]', 'curiosity-msl');
await p.click('button:has-text("Sample")');
for (let i = 0; i < 10; i++) {
  await p.waitForTimeout(6000);
  const t = await p.evaluate(() => {
    const el = [...document.querySelectorAll('.global-view > div')].find(d => d.innerText && d.innerText.includes('Coarse global elevation'));
    return el ? el.innerText.slice(-500) : 'panel not found';
  });
  console.log(`--- t+${(i+1)*6}s ---`);
  console.log(t.split('\n').slice(-6).join(' | '));
  if (/km great-circle|fetch.decode failed|no data along/.test(t)) break;
}
await b.close(); server.close();
