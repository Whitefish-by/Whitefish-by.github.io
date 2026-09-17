// Local generation only. This command never commits, pushes or deploys.
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  mkdir,
  readFile,
  writeFile,
  copyFile,
  cp,
  rename,
  readdir,
  stat,
  realpath,
  lstat,
  unlink,
} from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:http';

const site = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--app-path', '--library-root'].includes(args[i]) || !args[i + 1])
    throw new Error(
      'Usage: npm run snapshot:product -- --app-path ../PaperEnjoyer [--library-root PATH]',
    );
  options[args[i]] = args[i + 1];
}
const app = await realpath(
  path.resolve(options['--app-path'] ?? path.join(site, '../PaperEnjoyer')),
);
const appRequire = createRequire(path.join(app, 'package.json'));
const { build } = appRequire('esbuild');
let library = options['--library-root'];
if (!library) {
  const appData =
    process.platform === 'win32'
      ? process.env.APPDATA
      : process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library/Application Support')
        : (process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'));
  const config = JSON.parse(
    await readFile(path.join(appData, 'paper-enjoyer/settings.json'), 'utf8'),
  );
  library = config.root;
}
if (!library) throw new Error('无法定位资料库，请提供 --library-root。');
library = await realpath(library);
const run = randomUUID();
const stage = path.join(site, '.cache', 'interactive-snapshot', run);
const output = path.join(stage, 'demo');
const appOutput = path.join(output, 'app');
const runtime = path.join(app, '.cache', 'demo-tool', run);
await mkdir(runtime, { recursive: true });
await mkdir(appOutput, { recursive: true });
console.log('Reading the local library and preparing the current renderer…');
await build({
  entryPoints: [path.join(app, 'src/demo/export.ts'), path.join(app, 'src/main/pdf-worker.ts')],
  outdir: runtime,
  entryNames: '[name]',
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  target: 'node22',
});
const { exportDemo } = appRequire(path.join(runtime, 'export.cjs'));
execFileSync(
  process.execPath,
  [
    path.join(app, 'node_modules/vite/bin/vite.js'),
    'build',
    '--mode',
    'demo',
    '--config',
    'vite.demo.config.ts',
    '--outDir',
    appOutput,
    '--logLevel',
    'error',
  ],
  { cwd: app, stdio: 'inherit', windowsHide: true },
);
await rename(path.join(appOutput, 'demo.html'), path.join(appOutput, 'index.html'));
const exported = await exportDemo({
  libraryRoot: library,
  appRoot: app,
  output: path.join(appOutput, 'data'),
  worker: path.join(runtime, 'pdf-worker.cjs'),
});

for (const name of ['cmaps', 'standard_fonts'])
  await cp(path.join(app, 'node_modules/pdfjs-dist', name), path.join(appOutput, name), {
    recursive: true,
  });
for (const name of ['index.html', 'viewer.js', 'viewer.css'])
  await copyFile(path.join(site, 'scripts/demo-viewer', name), path.join(output, name));
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  try {
    await stat(path.join(site, '.cache/playwright'));
    process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(site, '.cache/playwright');
  } catch {}
}
const { chromium } = appRequire('@playwright/test');
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const filename = path.resolve(
      output,
      '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''),
    );
    const relative = path.relative(output, filename);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid path');
    const bytes = await readFile(filename);
    response.writeHead(200, {
      'Content-Type': types[path.extname(filename)] ?? 'application/octet-stream',
    });
    response.end(bytes);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const page = await browser.newPage({
    viewport: { width: 1680, height: 1011 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  const errors = [],
    blocked = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(origin + '/')) return route.continue();
    blocked.push(url);
    return route.abort();
  });
  await page.goto(origin + '/app/index.html');
  await page.locator('html[data-demo-ready="true"]').waitFor({ timeout: 45000 });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(stage, 'poster.png'), animations: 'disabled' });
  if (errors.length || blocked.length)
    throw new Error('演示验收失败：' + JSON.stringify({ errors, blocked }));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
const sharp = createRequire(path.join(site, 'package.json'))('sharp');
await sharp(path.join(stage, 'poster.png'))
  .webp({ quality: 88 })
  .toFile(path.join(output, 'poster.webp'));
async function files(directory, prefix = '') {
  const result = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const relative = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error('Snapshot files cannot be symbolic links');
    if (entry.isDirectory())
      result.push(...(await files(path.join(directory, entry.name), relative + '/')));
    else
      result.push({
        path: relative,
        sha256: createHash('sha256')
          .update(await readFile(path.join(directory, entry.name)))
          .digest('hex'),
        bytes: (await stat(path.join(directory, entry.name))).size,
      });
  }
  return result;
}
const manifest = {
  schemaVersion: 1,
  appVersion: JSON.parse(await readFile(path.join(app, 'package.json'), 'utf8')).version,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: app,
    encoding: 'utf8',
    windowsHide: true,
  }).trim(),
  sourceDirty: !!execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], {
    cwd: app,
    encoding: 'utf8',
    windowsHide: true,
  }).trim(),
  contentHash: exported.contentHash,
  generatedAt: new Date().toISOString(),
  files: await files(output),
};
await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await mkdir(path.join(site, 'public'), { recursive: true });
const target = path.join(site, 'public/demo'),
  previous = path.join(stage, 'previous');
for (const destination of [target, previous, output]) {
  const relative = path.relative(site, path.resolve(destination));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error('Output must remain inside the website checkout');
  try {
    if ((await lstat(destination)).isSymbolicLink())
      throw new Error('Snapshot destination cannot be a symbolic link');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
let oldFiles = [];
const hasPrevious = await stat(target).then(
  () => true,
  (error) => {
    if (error.code !== 'ENOENT') throw error;
    return false;
  },
);
if (hasPrevious) {
  oldFiles = await files(target);
  await cp(target, previous, { recursive: true, errorOnExist: true, force: false });
}
// Keep the directory itself stable: Windows development-server watchers hold it open.
// Install assets before HTML, and the manifest last. Every replaced file is atomic.
const ordered = [...manifest.files].sort(
  (a, b) => Number(a.path.endsWith('.html')) - Number(b.path.endsWith('.html')),
);
ordered.push({ path: 'manifest.json' });
const touched = [];
async function replaceFile(source, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = destination + '.snapshot-' + run;
  try {
    await copyFile(source, temporary);
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(temporary, destination);
        break;
      } catch (error) {
        if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt === 7) throw error;
        await delay(100 * (attempt + 1));
      }
    }
  } finally {
    await unlink(temporary).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}
try {
  for (const file of ordered) {
    if (file.sha256 && oldFiles.some((old) => old.path === file.path && old.sha256 === file.sha256))
      continue;
    touched.push(file.path);
    await replaceFile(path.join(output, file.path), path.join(target, file.path));
  }
  const current = new Set(ordered.map((file) => file.path));
  for (const file of oldFiles) {
    if (!current.has(file.path)) {
      touched.push(file.path);
      await unlink(path.join(target, file.path));
    }
  }
} catch (error) {
  const old = new Set(oldFiles.map((file) => file.path));
  const rollback = await Promise.allSettled(
    touched.map((file) =>
      old.has(file)
        ? replaceFile(path.join(previous, file), path.join(target, file))
        : unlink(path.join(target, file)).catch((failure) => {
            if (failure.code !== 'ENOENT') throw failure;
          }),
    ),
  );
  if (rollback.some((result) => result.status === 'rejected'))
    throw new Error('Snapshot update failed; restore the backup at ' + previous, { cause: error });
  throw error;
}
console.log('Local snapshot updated: ' + target + '\nNo commit, push or deployment was performed.');
