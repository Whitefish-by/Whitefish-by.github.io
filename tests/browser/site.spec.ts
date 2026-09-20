import { test, expect, type Page } from '@playwright/test';
import { fixture } from '../release-fixture.mjs';

async function mockInstallerNavigation(page: Page) {
  // Check the requested installer URL without transferring binaries. A 204 keeps
  // the page available for assertions in both Chromium and WebKit.
  await page.route('https://github.com/**/releases/download/**', (route) =>
    route.fulfill({ status: 204 }),
  );
}

test.beforeEach(async ({ page }) => {
  await page.route('**/downloads/latest.json*', (route) =>
    route.fulfill({ json: fixture('2.0.0') }),
  );
});

for (const [locale, url] of [
  ['zh', '/'],
  ['en', '/en/'],
]) {
  for (const width of [390, 768, 1440]) {
    test(`${locale} at ${width}px renders without overflow, broken images or runtime errors`, async ({
      page,
    }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(url);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('[data-release-status]')).toContainText('2.0.0');
      await expect(page.locator('[data-download="linux"]')).toHaveCount(2);
      for (const link of await page.locator('[data-download="linux"]').all()) {
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute(
          'href',
          /v2\.0\.0\/PaperEnjoyer-2\.0\.0-Linux-amd64\.deb$/,
        );
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBeTruthy();
      // The interactive hero hides its poster after loading; its fallback is tested separately.
      for (const image of await page.locator('img:visible:not(.demo-poster)').all()) {
        await image.scrollIntoViewIfNeeded();
        await expect(image).toHaveJSProperty('complete', true);
        expect(await image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
      }
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({
        path: info.outputPath(`${locale}-${width}.png`),
        fullPage: true,
        animations: 'disabled',
      });
      expect(errors).toEqual([]);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `https://paperenjoyer.com${url}`,
      );
    });
  }
}

test('gallery supports keyboard navigation, deep links and an accessible lightbox', async ({
  page,
}) => {
  await page.goto('/#scene-discovery');
  await expect(page.locator('#scene-discovery')).toBeVisible();
  await page.locator('#tab-discovery').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#tab-agent')).toBeFocused();
  await expect(page.locator('#scene-agent')).toBeVisible();
  await page.locator('#scene-agent [data-expand]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('#scene-agent [data-expand]')).toBeFocused();
});

test('GitHub success uses no server installer bytes', async ({ page }) => {
  await mockInstallerNavigation(page);
  const installerRequests: string[] = [];
  page.on('request', (request) => {
    if (/\.(exe|dmg|deb)$/.test(request.url())) installerRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.locator('[data-version]').first()).toHaveText('v2.0.0');
  const navigation = page.waitForRequest(
    (r) => r.isNavigationRequest() && r.url() === fixture('2.0.0').assets.windows.githubUrl,
  );
  await page.locator('[data-download="windows"]').first().click();
  await navigation;
  expect(installerRequests.length).toBeGreaterThanOrEqual(2);
  expect(installerRequests.every((url) => url.startsWith('https://github.com/'))).toBeTruthy();
});

for (const fault of ['connection', 'timeout'])
  test(`automatically switches to matching server package on GitHub ${fault}`, async ({ page }) => {
    await page.route('https://github.com/**/releases/download/**', (route) =>
      fault === 'connection' ? route.abort() : undefined,
    );
    await page.route('https://paperenjoyer.com/downloads/**', (route) =>
      route.fulfill({ status: 204 }),
    );
    await page.goto('/en/');
    const url = fixture('2.0.0').assets.linux.url;
    const navigation = page.waitForRequest((r) => r.isNavigationRequest() && r.url() === url);
    await page.locator('[data-download="linux"]').last().click();
    await navigation;
  });

test('click refreshes the version and only starts one download', async ({ page }) => {
  await mockInstallerNavigation(page);
  await page.goto('/');
  await expect(page.locator('[data-version]').first()).toHaveText('v2.0.0');
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => (finish = resolve));
  let lookups = 0;
  let downloads = 0;
  await page.route('**/downloads/latest.json*', async (route) => {
    lookups++;
    await gate;
    await route.fulfill({ json: fixture('2.0.1') });
  });
  page.on('request', (r) => {
    if (r.isNavigationRequest() && r.url().includes('/releases/download/')) downloads++;
  });
  await page.locator('[data-download="windows"]').first().click();
  await page.locator('[data-download="windows"]').first().click();
  const navigation = page.waitForRequest(
    (r) => r.isNavigationRequest() && r.url() === fixture('2.0.1').assets.windows.githubUrl,
  );
  finish();
  await navigation;
  expect(lookups).toBe(1);
  expect(downloads).toBe(1);
  await expect(page.locator('[data-version]').first()).toHaveText('v2.0.1');
});

for (const status of [404, 429, 500])
  test(`manifest HTTP ${status} keeps server download available`, async ({ page }) => {
    await page.route('**/downloads/latest.json*', (route) => route.fulfill({ status, body: '{}' }));
    await page.route('**/download/windows', (route) => route.fulfill({ status: 204 }));
    await page.goto('/');
    await expect(page.locator('[data-release-status]')).toContainText('暂时无法检查更新');
    await expect(page.locator('[data-download="windows"]').first()).toHaveAttribute(
      'href',
      '/download/windows',
    );
    const navigation = page.waitForRequest(
      (r) => r.isNavigationRequest() && r.url().endsWith('/download/windows'),
    );
    await page.locator('[data-download="windows"]').first().click();
    await navigation;
  });

test('restoring a page refreshes all version links', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-version]').first()).toHaveText('v2.0.0');
  await page.route('**/downloads/latest.json*', (route) =>
    route.fulfill({ json: fixture('4.0.0') }),
  );
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
  );
  await expect(page.locator('[data-version]').first()).toHaveText('v4.0.0');
});

test('mobile navigation, language switch, FAQ and reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: '打开导航' }).click();
  await expect(page.locator('#nav-links')).toBeVisible();
  await page.locator('#nav-links a[href="#faq"]').click();
  await expect(page.locator('#nav-links')).not.toBeVisible();
  await page.locator('.faq-list summary').first().click();
  await expect(page.locator('.faq-list details').first()).toHaveAttribute('open', '');
  await page.locator('[data-language]').click();
  await expect(page).toHaveURL(/\/en\/#faq$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe(
    'auto',
  );
});

test('without JavaScript the content, gallery and downloads remain available', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
  for (const panel of await page.locator('.showcase-panel').all())
    await expect(panel).toBeVisible();
  await expect(page.locator('[data-download="windows"]').first()).toHaveAttribute(
    'href',
    '/download/windows',
  );
  await expect(page.locator('[data-release-status]')).toContainText('最新正式版');
  await expect(page.locator('[data-download="linux"]')).toHaveCount(2);
  for (const link of await page.locator('[data-download="linux"]').all()) {
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/download/linux');
  }
  await expect(page.locator('.menu-toggle')).not.toBeVisible();
  await context.close();
});
