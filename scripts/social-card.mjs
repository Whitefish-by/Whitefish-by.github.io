import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const logo = (await readFile('public/favicon.svg')).toString('base64');
const screenshot = (await readFile('public/images/reading.webp')).toString('base64');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;width:1200px;height:630px;overflow:hidden;background:radial-gradient(ellipse at 90% 80%,#dce8d3,transparent 65%),#f7faf4;color:#253a2e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif}.brand{display:flex;align-items:center;gap:13px;position:absolute;left:70px;top:56px;font-size:27px;font-weight:650;letter-spacing:-1px}.brand img{width:49px;height:49px}.label{position:absolute;top:174px;left:74px;font-size:13px;letter-spacing:3px;color:#71876d}h1{position:absolute;top:196px;left:70px;font-size:68px;line-height:1.32;letter-spacing:-4px;max-width:500px;margin:0;font-weight:650}h1 span{color:#397564}.subtitle{position:absolute;top:407px;left:75px;color:#788671;font-size:18px}.platforms{position:absolute;top:496px;left:74px;display:flex;gap:10px}.platforms span{font-size:13px;padding:10px 16px;border-radius:9px;border:1px solid #d6e1ce;background:#ffffff66;color:#4d6751}.screen{position:absolute;left:618px;top:166px;width:1000px;transform:rotate(-6deg);transform-origin:top left;border:1px solid #cad8c6;padding:10px;background:#fff;border-radius:19px;box-shadow:0 30px 90px #2c512432}.screen img{width:100%;border-radius:10px}.url{position:absolute;left:76px;bottom:33px;font-size:13px;color:#74856e;letter-spacing:1px}
    </style></head><body><div class="brand"><img src="data:image/svg+xml;base64,${logo}">PaperEnjoyer</div><div class="label">A QUIETER SPACE FOR CURIOUS MINDS</div><h1>读懂<br><span>每一个想法。</span></h1><p class="subtitle">Your papers. Your notes. Your next idea.</p><div class="platforms"><span>Windows x64</span><span>macOS Apple Silicon</span></div><div class="screen"><img src="data:image/webp;base64,${screenshot}"></div><div class="url">paperenjoyer.com</div></body></html>`);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode()));
  });
  await page.screenshot({ path: 'public/social-card.png' });
} finally {
  await browser.close();
}
