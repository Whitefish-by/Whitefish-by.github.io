import sharp from 'sharp';
import { mkdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';
const originals = path.resolve('.cache/product-originals');
await mkdir(originals, { recursive: true });
for (const name of ['reading', 'discovery', 'agent', 'immersive']) {
  const raw = path.resolve(`public/images/${name}.png`);
  const source = await stat(raw)
    .then(() => raw)
    .catch(() => path.join(originals, `${name}.png`));
  const result = await sharp(source)
    .webp({ quality: 91, effort: 6 })
    .toFile(`public/images/${name}.webp`);
  console.log(`${name}: ${(result.size / 1024).toFixed(0)} KB`);
  if (source === raw) await rename(raw, path.join(originals, `${name}.png`));
}
