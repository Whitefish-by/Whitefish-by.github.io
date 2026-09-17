import { test, expect } from '@playwright/test';
import { fixture } from '../release-fixture.mjs';

test.beforeEach(async ({ page }) => {
  await page.route('https://api.github.com/**', (route) =>
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

test('all download buttons track the newest release and missing assets stay honest', async ({
  page,
}) => {
  const input = fixture('3.1.0');
  input.assets = input.assets.filter((a) => !a.name.endsWith('.dmg'));
  await page.route('https://api.github.com/**', (route) => route.fulfill({ json: input }));
  await page.goto('/');
  await expect(page.locator('[data-release-status]')).toContainText('3.1.0');
  for (const link of await page.locator('[data-download="windows"]').all())
    await expect(link).toHaveAttribute('href', /v3\.1\.0\/PaperEnjoyer-3\.1\.0-Setup\.exe$/);
  await expect(page.locator('[data-download="mac"]').first()).toHaveAttribute(
    'data-available',
    'false',
  );
  await expect(page.locator('[data-download="mac"]').first()).toHaveAttribute(
    'href',
    input.html_url,
  );
  await expect(page.locator('[data-asset-message="mac"]')).toBeVisible();
});

for (const status of [403, 404, 429, 500])
  test(`API ${status} retains a working verified download`, async ({ page }) => {
    await page.route('https://api.github.com/**', (route) => route.fulfill({ status, body: '{}' }));
    await page.goto('/');
    await expect(page.locator('[data-release-status]')).toContainText('暂时无法检查更新');
    await expect(page.locator('[data-download="windows"]').first()).toHaveAttribute(
      'href',
      /github\.com\/watericetangcw\/PaperEnjoyer-Releases\/releases\/download\/v[\d.]+\/PaperEnjoyer-[\d.]+-Setup\.exe$/,
    );
  });

test('network failure preserves release links', async ({ page }) => {
  await page.route('https://api.github.com/**', (route) => route.abort());
  await page.goto('/en/');
  await expect(page.locator('[data-release-status]')).toContainText('Unable to check');
  await expect(page.locator('[data-download="mac"]').first()).toHaveAttribute(
    'href',
    /macOS-arm64\.dmg$/,
  );
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
    /Setup\.exe$/,
  );
  await expect(page.locator('.menu-toggle')).not.toBeVisible();
  await context.close();
});
