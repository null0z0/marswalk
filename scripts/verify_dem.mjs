import path from 'node:path'; import http from 'node:http'; import fs from 'node:fs';
import { chromium } from 'playwright';
const dist = '/home/sandbox/marswalk/dist';
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.png':'image/png' };
const server = http.createServer((req,res)=>{ const rel = req.url==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/,'');
  fs.readFile(path.join(dist,rel),(e,buf)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'content-type':MIME[path.extname(rel).toLowerCase()]||'application/octet-stream'}); res.end(buf); }); });
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox','--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport:{ width:1356, height:820 } })).newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil:'networkidle' });
await p.click('button:has-text("Global")');
await p.waitForSelector('.global-view canvas', { timeout: 20000 });
await p.selectOption('select[aria-label="Profile from"]', 'perseverance-m20');
await p.selectOption('select[aria-label="Profile to"]', 'curiosity-msl');
const t0 = Date.now();
await p.click('button:has-text("Sample")');
await p.waitForFunction(() => document.querySelector('.global-view').innerText.includes(' km great-circle'), undefined, { timeout: 120000 });
const ms = Date.now() - t0;
const txt = await p.evaluate(() => document.querySelector('.global-view').innerText);
const mMin = txt.match(/min (-?\d+) m \/ max (-?\d+) m/);
const mAsc = txt.match(/asc \+(\d+) m \/ desc -(\d+) m/);
const mSp = txt.match(/actual sample spacing ~(\d+) m/);
const mDist = txt.match(/([\d.]+) km great-circle/);
console.log('time-to-profile ms:', ms);
console.log('dist km:', mDist && mDist[1], '| min/max:', mMin && mMin.slice(1).join('/'), '| asc/desc:', mAsc && mAsc.slice(1).join('/'));
console.log('actual spacing disclosed:', mSp ? mSp[1] + ' m' : 'MISSING');
console.log('method label:', /NOT terrain-aware pathfinding/.test(txt) ? 'OK' : 'MISSING');
console.log('license label:', /CC BY-SA/.test(txt) ? 'OK' : 'MISSING');
// Value equality is owned by scripts/dem_exact_compare.py (pixel-exact vs source, no tolerance).
// Here: dateline regression - Mars 3 (-158) to Spirit (175.48) must take the short 26.5 deg way,
// not the raw 333 deg linear path (which gave ~19700 km). Correct haversine: ~2242 km (dlat 30.4 deg dominates).
await p.selectOption('select[aria-label="Profile from"]', 'mars-3');
await p.selectOption('select[aria-label="Profile to"]', 'spirit-mer-a');
await p.click('button:has-text("Sample")');
await p.waitForFunction(() => /[\d.]+ km great-circle/.test(document.querySelector('.global-view').innerText), undefined, { timeout: 30000 });
const txt2 = await p.evaluate(() => document.querySelector('.global-view').innerText);
const d2 = +txt2.match(/([\d.]+) km great-circle/)[1];
console.log('dateline regression: Mars3->Spirit dist', d2, 'km:', d2 > 2100 && d2 < 2400 ? 'OK' : 'FAIL');
// no-nodata guarantee on these paths: all sampled points have values
console.log('nodata display check:', /no data along path/.test(txt2) ? 'FAIL' : 'OK');
console.log('page errors:', errs.length ? errs.slice(0,3) : 'none');
await p.screenshot({ path: '/downloads/m10_dem_browser.png' });
await b.close(); server.close();
