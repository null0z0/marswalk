import path from 'node:path'; import http from 'node:http'; import fs from 'node:fs';
import { chromium } from 'playwright';
const dist = '/downloads/marswalk/dist';
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.bin':'application/octet-stream' };
const server = http.createServer((req,res)=>{ const rel = req.url==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/,'');
  fs.readFile(path.join(dist,rel),(e,buf)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'content-type':MIME[path.extname(rel).toLowerCase()]||'application/octet-stream'}); res.end(buf); }); });
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox','--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport:{ width:1356, height:820 } })).newPage();
await p.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil:'networkidle' });
await p.click('button:has-text("Global")');
await p.waitForSelector('.global-view canvas', { timeout: 20000 });
await p.waitForTimeout(4000);
await p.evaluate(() => { const btn = document.querySelector('.global-view button[aria-label^="recorded natural events"]'); btn?.click(); });
await p.waitForTimeout(400);
console.log(await p.evaluate(() => {
  const btns = [...document.querySelectorAll('.global-view button[aria-label^="recorded natural events"]')].map(x=>x.getAttribute('aria-label'));
  const cards = [...document.querySelectorAll('.global-view div')].filter(d => d.textContent.includes('Historical record - not current conditions')).map(d => d.textContent.slice(0, 300));
  return JSON.stringify({ btns, cardCount: cards.length, first: cards[0] }, null, 1);
}));
await p.click('button:has-text("Open Jezero workspace")');
await p.waitForTimeout(3000);
console.log(await p.evaluate(() => {
  const lbl = [...document.querySelectorAll('label')].map(l => l.textContent).find(t => t.includes('Historical event records'));
  return 'layers label present: ' + (lbl ? 'YES: ' + lbl.slice(0,90) : 'NO');
}));
await b.close(); server.close();
