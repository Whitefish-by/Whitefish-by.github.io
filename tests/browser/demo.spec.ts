import { test, expect } from '@playwright/test';
import { fixture } from '../release-fixture.mjs';

test.beforeEach(async ({ page }) => {
  await page.route('https://api.github.com/**', (route) =>
    route.fulfill({ json: fixture('2.0.0') }),
  );
});

for (const url of ['/', '/en/'])
  for (const width of [390, 768, 1440]) {
    test('interactive hero ' + url + ' at ' + width, async ({ page }, info) => {
      const errors: string[] = [],
        external: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => {
        if (
          request.frame() !== page.mainFrame() &&
          !request.url().startsWith('http://127.0.0.1:4322/demo/')
        )
          external.push(request.url());
      });
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
      await page.goto(url);
      const host = page.locator('[data-product-demo]');
      await host.scrollIntoViewIfNeeded();
      await expect(host).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
      const app = page.frameLocator('[data-demo-frame]');
      await expect(app.locator('html')).toHaveAttribute('data-theme', 'light');
      await expect(app.locator('.paper-list-item')).toHaveCount(1);
      await expect(app.locator('.user-message-text')).toHaveText('请解释Self-Attention是什么？');
      await expect(app.getByRole('button', { name: '发送消息', exact: true })).toBeDisabled();
      await expect(app.locator('.agent-footnote')).toContainText('Enter 发送 · Shift + Enter 换行');
      await expect(app.locator('.reader-footer').filter({ has: app.locator('kbd') })).toContainText(
        '选中文字，按 Space 翻译',
      );
      await expect(host.locator('.demo-controls, .demo-dialog')).toHaveCount(0);
      await expect(host.locator('.demo-window-actions')).toHaveText('');
      const reset = (await host.locator('[data-demo-reset]').boundingBox())!;
      const open = (await host.locator('[data-demo-open]').boundingBox())!;
      expect(reset.x + reset.width).toBeLessThanOrEqual(open.x);
      expect(reset.y).toBe(open.y);
      await app.getByRole('button', { name: '发现论文', exact: true }).click();
      await expect(app.getByRole('textbox', { name: '论文关键词', exact: true })).toHaveValue(
        'transformer',
      );
      await expect(app.locator('.discovery-card')).toHaveCount(4);
      await expect(app.locator('.discovery-footer')).toContainText(
        '收藏想法 · 拖入左侧目录，即可下载归档',
      );
      await app.getByRole('button', { name: '阅读', exact: true }).click();
      await expect(app.locator('.pdf-page[data-page="1"] [data-pdf-render="ready"]')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBeTruthy();
      await page.screenshot({ path: info.outputPath('hero.png'), fullPage: false });
      expect(errors).toEqual([]);
      expect(external).toEqual([]);
    });
  }

test('reading, search, static assets, local menus and disabled sending', async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1680, height: 1011 });
  const failures: string[] = [];
  page.on('response', (response) => {
    if (response.url().includes('/demo/') && response.status() >= 400)
      failures.push(response.url());
  });
  await page.goto('/demo/app/index.html');
  await expect(page.locator('html')).toHaveAttribute('data-demo-ready', 'true', { timeout: 30000 });
  const input = page.getByRole('textbox', { name: '向 OpenAI 提问', exact: true });
  await input.fill('测试输入');
  await input.press('Enter');
  await expect(input).toHaveValue('测试输入');
  await expect(page.getByRole('button', { name: '发送消息' })).toBeDisabled();
  await expect(page.locator('.message')).toHaveCount(2);
  const denied = await page.evaluate(async () => {
    const api = (window as any).paperEnjoyer;
    const snapshot = await api.call('app.snapshot', {});
    try {
      await api.call('agent.send', { sessionId: snapshot.sessions[0].id, text: 'test' });
      return false;
    } catch {
      return true;
    }
  });
  expect(denied).toBe(true);
  await page.getByRole('combobox', { name: 'Agent 模型', exact: true }).click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('spinbutton', { name: '页码', exact: true }).fill('3');
  await page.getByRole('spinbutton', { name: '页码', exact: true }).press('Enter');
  await expect(page.locator('.pdf-page[data-page="3"] [data-pdf-render="ready"]')).toBeVisible();
  await page.getByRole('button', { name: '完整 Markdown', exact: true }).click();
  await expect(page.locator('.notes-scroll > .markdown')).toBeVisible();
  await expect(page.locator('.notes-scroll > .markdown img')).toHaveCount(5);
  for (const image of await page.locator('.notes-scroll img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveJSProperty('complete', true);
    expect(await image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  }
  await page.getByRole('button', { name: '段落匹配', exact: true }).click();
  await expect(page.getByTitle('编辑译文与笔记').first()).toBeDisabled();
  await page.getByRole('button', { name: '发现论文', exact: true }).click();
  await expect(page.locator('.discovery-card')).toHaveCount(4);
  await page.getByRole('textbox', { name: '论文关键词', exact: true }).fill('BERT');
  await page.getByRole('button', { name: '搜索论文', exact: true }).click();
  await expect(page.locator('.discovery-card')).toHaveCount(1);
  await page.locator('.discovery-card-title').click();
  await expect(page.getByRole('complementary', { name: '论文详情' })).toBeVisible();
  await expect(
    page.locator('.discovery-detail').getByRole('button', { name: '查找 PDF', exact: true }),
  ).toBeDisabled();
  await page.reload();
  // Reloads initialize the PDF demo again, so use the same readiness budget as the first load.
  await expect(page.locator('html')).toHaveAttribute('data-demo-ready', 'true', { timeout: 30000 });
  await expect(input).toHaveValue('');
  await expect(page.getByRole('spinbutton', { name: '页码', exact: true })).toHaveValue('1');
  expect(failures).toEqual([]);
});

test('toolbar icons open the standalone view, reset and retain the poster on failure', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto('/');
  await page.locator('[data-product-demo]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-product-demo]')).toHaveAttribute('data-ready', 'true', {
    timeout: 30000,
  });
  const opened = page.waitForEvent('popup');
  await page.getByRole('link', { name: '独立打开', exact: true }).click();
  const standalone = await opened;
  await expect(standalone).toHaveURL(/\/demo\/index\.html$/);
  await expect(standalone).toHaveTitle('PaperEnjoyer');
  await expect(standalone.locator('header')).not.toContainText(/交互演示|发送已停用/);
  await standalone.close();
  const input = page.frameLocator('[data-demo-frame]').getByRole('textbox', {
    name: '向 OpenAI 提问',
    exact: true,
  });
  await input.fill('重置前的输入');
  await page.locator('[data-demo-reset]').click();
  // Reset also reloads the demo; WebKit on CI can take longer than the default 5 seconds.
  await expect(page.locator('[data-product-demo]')).toHaveAttribute('data-ready', 'true', {
    timeout: 30000,
  });
  await expect(input).toHaveValue('');
  await page.route('**/demo/app/data/snapshot.json', (route) =>
    route.fulfill({ status: 503, body: '' }),
  );
  await page.locator('[data-demo-reset]').click();
  await expect(page.locator('[data-product-demo]')).toHaveAttribute('data-error', 'true');
  await expect(page.locator('.demo-poster')).toBeVisible();
});

test('standalone viewer preserves paragraph location, page previews and pane resizing', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1720, height: 1100 });
  await page.goto('/demo/index.html');
  const app = page.frameLocator('iframe');
  await expect(app.locator('html')).toHaveAttribute('data-demo-ready', 'true', { timeout: 30000 });
  const paragraph = app
    .locator('.block-card')
    .filter({
      has: app.locator('.block-heading > span', { hasText: /p\.3\b/ }),
    })
    .first();
  await paragraph.getByTitle('定位 PDF 原文', { exact: true }).click();
  await expect(app.getByRole('spinbutton', { name: '页码', exact: true })).toHaveValue('3');
  const preview = app
    .locator('details')
    .filter({
      has: app.locator('summary', { hasText: '查看公式或图表的原始页面' }),
    })
    .first();
  await preview.locator('summary').click();
  await expect(preview.locator('img')).toBeVisible();
  await expect(preview.locator('img')).toHaveJSProperty('complete', true);
  expect(
    await preview.locator('img').evaluate((el: HTMLImageElement) => el.naturalWidth),
  ).toBeGreaterThan(0);
  const notes = app.locator('.notes-pane');
  const before = (await notes.boundingBox())!.width;
  const handle = (await app.locator('.notes-resizer').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x - 75, handle.y + handle.height / 2, { steps: 8 });
  await page.mouse.up();
  expect(Math.abs((await notes.boundingBox())!.width - before)).toBeGreaterThan(40);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '原尺寸', exact: true }).click();
  await expect(page.getByRole('button', { name: '适合窗口', exact: true })).toBeVisible();
  expect(
    await page.locator('#viewer').evaluate((el) => el.scrollWidth > el.clientWidth),
  ).toBeTruthy();
});

test('the hero keeps its poster and standalone link when JavaScript is disabled', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('.demo-poster')).toBeVisible();
  await expect(page.locator('.demo-poster')).toHaveJSProperty('complete', true);
  await expect(page.locator('[data-demo-frame]')).not.toBeVisible();
  await expect(page.getByRole('link', { name: '独立打开', exact: true })).toHaveAttribute(
    'href',
    '/demo/index.html',
  );
  await page.goto('/demo/index.html');
  await expect(page.locator('#viewer')).not.toBeVisible();
  await expect(page.locator('noscript img')).toBeVisible();
  await context.close();
});
