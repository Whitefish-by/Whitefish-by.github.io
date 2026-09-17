// Reproducible screenshots of the real app. Only the isolated demo profile is changed.
// Usage: npm run capture:product -- --app-path E:/PaperEnjoyer
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';

const siteRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const flag = process.argv.indexOf('--app-path');
if (flag < 0 || !process.argv[flag + 1])
  throw new Error('Pass --app-path with a built PaperEnjoyer checkout.');
const appRoot = path.resolve(process.argv[flag + 1]);
const appRequire = createRequire(path.join(appRoot, 'package.json'));
const { build } = appRequire('esbuild');
const { _electron: electron } = appRequire('@playwright/test');
const root = path.join(siteRoot, '.cache', 'product-demo', String(Date.now()));
const library = path.join(root, 'library'),
  profile = path.join(root, 'profile');
const output = path.join(siteRoot, 'public', 'images');
for (const directory of [library, profile, output, path.join(library, 'papers')])
  await mkdir(directory, { recursive: true });
await build({
  entryPoints: [path.join(appRoot, 'src/main/store.ts')],
  outfile: path.join(root, 'store.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
});
const { Store } = appRequire(path.join(root, 'store.cjs'));
const pdf = await readFile(path.join(appRoot, '.cache/fixtures/nerf.pdf'));
const parsed = JSON.parse(
  await readFile(path.join(appRoot, '.cache/fixtures/nerf-parsed.json'), 'utf8'),
);
const hash = createHash('sha256').update(pdf).digest('hex');
await writeFile(path.join(library, 'papers', `${hash}.pdf`), pdf);
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const folderId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const paper = {
  id,
  workId: id,
  hash,
  title: 'NeRF: Representing Scenes as Neural Radiance Fields for View Synthesis',
  authors: 'Ben Mildenhall et al.',
  year: 2020,
  doi: null,
  arxivId: '2003.08934',
  abstract: '',
  folderId,
  tags: ['Neural rendering'],
  fileName: 'nerf.pdf',
  pageCount: parsed.pages.length,
  status: 'ready',
  error: null,
  createdAt: 1,
  deletedAt: null,
  readPage: 1,
  readBlockId: null,
  activeNoteId: 'demo-notes',
};
const texts = [
  [
    'NeRF: Representing Scenes as Neural Radiance Fields for View Synthesis',
    'NeRF：用神经辐射场表示场景，实现新视角合成',
    '把场景编码在神经网络里，再从任意视角“拍摄”它。论文的核心是连续场景表示与可微体渲染的结合。',
  ],
  [
    'We present a method that achieves state-of-the-art results for synthesizing novel views of complex scenes by optimizing an underlying continuous volumetric scene function using a sparse set of input views.',
    '本文提出一种方法：仅使用一组稀疏的输入视图，优化连续的体积场景函数，就能合成复杂场景的新视角。',
    '关键问题：如何从有限的二维照片中，学习一个能在未见过的视角下生成图像的三维表示？',
  ],
  [
    'Our algorithm represents a scene using a fully-connected deep network.',
    '该方法使用全连接深度网络表示场景。',
    '输入是空间位置与观察方向，输出是颜色和体密度。连续函数让场景表达摆脱固定体素分辨率的限制。',
  ],
];
const blocks = texts.map(([text], index) => ({
  id: (index + 1).toString(16).padStart(24, '0'),
  paperId: id,
  parserVersion: 2,
  order: index,
  kind: index ? 'paragraph' : 'heading',
  text,
  anchors: [
    { page: 1, x: 60, y: index ? 230 + index * 75 : 28, width: 300, height: index ? 70 : 40 },
  ],
}));
const document = {
  paper,
  snapshotId: 'demo-snapshot',
  blocks,
  pages: parsed.pages,
  outline: [],
  warnings: [],
};
const selection = {
  category: 'openai',
  harness: 'codex',
  providerId: 'openai',
  modelId: null,
  reasoningEffort: null,
};
const session = {
  id: 'demo-conversation',
  threadId: null,
  title: '一起理解 NeRF',
  paperId: id,
  paperIds: [id],
  workspace: null,
  mode: 'reading',
  modelSelection: selection,
  createdAt: 2,
  active: false,
};
const store = new Store(library, path.join(appRoot, 'dist'));
try {
  await store.put('folders', { id: folderId, name: '三维视觉', parentId: 'root', deletedAt: null });
  await store.put('folders', {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    name: '神经渲染',
    parentId: folderId,
    deletedAt: null,
  });
  await store.put('folders', {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    name: '值得再读',
    parentId: 'root',
    deletedAt: null,
  });
  await store.put('papers', paper);
  await store.put('documents', { ...document, id });
  await store.put('document_snapshots', {
    ...document,
    id: 'demo-snapshot',
    paperId: id,
    pdfHash: hash,
    createdAt: 1,
  });
  await store.put('notes', {
    id: 'demo-notes',
    paperId: id,
    title: '论文精读 · 演示',
    createdAt: 1,
    status: 'complete',
    overview: '',
    parserVersion: 2,
    parentId: null,
    documentSnapshotId: 'demo-snapshot',
    blocks: blocks.map((block, index) => ({
      blockId: block.id,
      translation: texts[index][1],
      originalNote: '',
      translatedNote: texts[index][2],
      edited: false,
    })),
  });
  await store.put('sessions', session);
} finally {
  await store.close();
}
await writeFile(
  path.join(profile, 'settings.json'),
  JSON.stringify({
    root: library,
    settings: {
      theme: 'light',
      expandTranslatedNotesByDefault: true,
      uiFontSize: 15,
      readingFontSize: 16,
    },
    secrets: {},
  }),
);
const env = { ...process.env, PAPERENJOYER_USER_DATA: profile };
for (const key of ['ELECTRON_RUN_AS_NODE', 'PAPERENJOYER_DEV_SERVICES', 'VITE_DEV_SERVER_URL'])
  delete env[key];
const app = await electron.launch({
  executablePath: appRequire('electron'),
  args: [appRoot],
  cwd: appRoot,
  env,
});
app.process().stderr.on('data', (chunk) => process.stderr.write(chunk));
app.process().stdout.on('data', (chunk) => process.stdout.write(chunk));
try {
  const page = await app.firstWindow();
  await app.evaluate(
    ({ BrowserWindow, ipcMain, session: electronSession }, data) => {
      // No network requests or model usage in the demo session.
      electronSession.defaultSession.webRequest.onBeforeRequest(
        { urls: ['https://*/*', 'http://*/*'] },
        (_details, callback) => callback({ cancel: true }),
      );
      BrowserWindow.getAllWindows()[0].setContentSize(1680, 1011);
      const original = ipcMain._invokeHandlers.get('paper:call');
      ipcMain.removeHandler('paper:call');
      ipcMain.handle('paper:call', async (event, method, input) => {
        if (method === 'agent.account') return { ok: true, data: { account: null } };
        if (method === 'agent.branches' || method === 'agent.requests')
          return { ok: true, data: [] };
        if (method === 'agent.items')
          return {
            ok: true,
            data: [
              {
                id: 'question',
                sessionId: 'demo-conversation',
                role: 'user',
                text: 'NeRF 为什么可以从照片中学会生成新的视角？',
                createdAt: 1,
                context: {
                  papers: [{ paperId: data.id, title: data.title, snapshotId: 'demo-snapshot' }],
                },
              },
              {
                id: 'answer',
                sessionId: 'demo-conversation',
                role: 'assistant',
                text: '可以把 NeRF 理解为一个**可以从任意角度观察的连续场景**。\n\n### 从照片到场景\n\n网络接收空间位置与观察方向，预测每一点的**颜色和体密度**。\n\n### 从场景到新视角\n\n沿相机射线采样，再用体渲染把这些采样点合成为像素。训练时用已有照片纠正预测，新的观察方向也就能生成对应图像。\n\n**阅读提示**：可以接着看论文第 3 节，理解场景表示与体渲染如何配合。',
                createdAt: 2,
              },
            ],
          };
        if (method === 'discovery.feed')
          return { ok: true, data: { hits: data.hits, reasons: {}, warnings: [], hasMore: false } };
        if (method === 'discovery.enrich') return { ok: true, data: [] };
        return original(event, method, input);
      });
    },
    {
      id,
      title: paper.title,
      hits: [
        {
          id: 'demo-nerf',
          title: 'NeRF: Representing Scenes as Neural Radiance Fields for View Synthesis',
          authors: 'Ben Mildenhall et al.',
          year: 2020,
          venue: 'ECCV',
          source: 'arxiv',
          url: 'https://arxiv.org/abs/2003.08934',
          pdfUrl: null,
          abstract:
            'Learning a continuous scene representation for novel view synthesis from a sparse collection of input images.',
          doi: null,
          arxivId: '2003.08934',
        },
        {
          id: 'demo-mip',
          title: 'Mip-NeRF: A Multiscale Representation for Anti-Aliasing Neural Radiance Fields',
          authors: 'Jonathan T. Barron et al.',
          year: 2021,
          venue: 'ICCV',
          source: 'arxiv',
          url: 'https://arxiv.org/abs/2103.13415',
          pdfUrl: null,
          abstract:
            'A multiscale representation that reduces aliasing artifacts and improves the quality of neural radiance fields.',
          doi: null,
          arxivId: '2103.13415',
        },
        {
          id: 'demo-gaussian',
          title: '3D Gaussian Splatting for Real-Time Radiance Field Rendering',
          authors: 'Bernhard Kerbl et al.',
          year: 2023,
          venue: 'SIGGRAPH',
          source: 'arxiv',
          url: 'https://arxiv.org/abs/2308.04079',
          pdfUrl: null,
          abstract:
            'Representing scenes with 3D Gaussians for high-quality, real-time novel-view synthesis.',
          doi: null,
          arxivId: '2308.04079',
        },
      ],
    },
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForLoadState('domcontentloaded');
  await page.locator('.recent-card').filter({ hasText: 'NeRF:' }).click();
  await page.locator('.pdf-page canvas').first().waitFor();
  const chooser = page.getByRole('combobox', { name: 'Agent 会话', exact: true });
  if (await chooser.count()) {
    if (await chooser.evaluate((el) => el.tagName === 'SELECT'))
      await chooser.selectOption('demo-conversation');
    else {
      await chooser.click();
      await page.getByRole('option').filter({ hasText: '一起理解 NeRF' }).click();
    }
  }
  await page.locator('.block-card').first().waitFor();
  await page.waitForTimeout(1600);
  await page.locator('.agent-messages').evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({ path: path.join(output, 'reading.png'), scale: 'css' });
  const divider = page.locator('.agent-resizer');
  if (await divider.count()) {
    const rect = await divider.boundingBox();
    await page.mouse.move(rect.x + 2, rect.y + 100);
    await page.mouse.down();
    await page.mouse.move(rect.x - 170, rect.y + 100, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(700);
  }
  await page.screenshot({ path: path.join(output, 'agent.png'), scale: 'css' });
  await page.getByRole('button', { name: '进入沉浸模式', exact: true }).click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(output, 'immersive.png'), scale: 'css' });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '发现论文', exact: true }).click();
  await page.locator('.discovery-page').waitFor();
  await page.waitForTimeout(1300);
  await page.screenshot({ path: path.join(output, 'discovery.png'), scale: 'css' });
  console.log(`Product screenshots saved in ${output}`);
} finally {
  // Stop only the isolated demo process and its children, including local Agent helpers.
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill.exe', ['/PID', String(app.process().pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } catch {
      /* Already closed. */
    }
  } else {
    try {
      await app.evaluate(({ app }) => app.exit(0));
    } catch {
      /* Transport closes on exit. */
    }
  }
  await app.close().catch(() => {});
}
await copyFile(path.join(appRoot, 'resources/icon.svg'), path.join(siteRoot, 'public/favicon.svg'));
await copyFile(
  path.join(appRoot, 'resources/icon.png'),
  path.join(siteRoot, 'public/apple-touch-icon.png'),
);
