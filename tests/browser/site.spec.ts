import { test, expect, type Page } from '@playwright/test';
import { fixture } from '../release-fixture.mjs';
import { RELEASES_URL } from '../../src/lib/release.mjs';

async function mockInstallerNavigation(page: Page) {
  // Check the requested installer URL without transferring binaries. A 204 keeps
  // the page available for assertions in both Chromium and WebKit.
  await page.route('https://github.com/**/releases/download/**', (route) =>
    route.fulfill({ status: 204 }),
  );
}

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
  test(`API ${status} links to latest releases instead of a stale installer`, async ({ page }) => {
    await page.route('https://api.github.com/**', (route) => route.fulfill({ status, body: '{}' }));
    await page.goto('/');
    await expect(page.locator('[data-release-status]')).toContainText('暂时无法检查更新');
    await expect(page.locator('[data-download="windows"]').first()).toHaveAttribute(
      'href',
      RELEASES_URL,
    );
    await expect(page.locator('[data-version]').first()).toHaveText('最新正式版');
    await expect(page.locator('[data-size="windows"]')).toHaveText('—');
    await expect(page.locator('[data-published]')).toBeHidden();
  });

test('network failure preserves release links', async ({ page }) => {
  await page.route('https://api.github.com/**', (route) => route.abort());
  await page.goto('/en/');
  await expect(page.locator('[data-release-status]')).toContainText('Unable to check');
  await expect(page.locator('[data-download="mac"]').first()).toHaveAttribute('href', RELEASES_URL);
});

for (const url of ['/', '/en/'])
  test(`${url} rechecks at download time when a newer release appears`, async ({ page }) => {
    let current = fixture('0.1.1');
    let requests = 0;
    await page.route('https://api.github.com/**', (route) => {
      requests++;
      return route.fulfill({ json: current });
    });
    await mockInstallerNavigation(page);
    await page.goto(url);
    await expect(page.locator('[data-release-status]')).toContainText('0.1.1');
    current = fixture('0.1.2');
    const downloadPromise = page.waitForRequest('https://github.com/**/releases/download/**');
    await page.locator('[data-download="windows"]').first().click();
    const download = await downloadPromise;
    expect(download.url()).toBe(current.assets[0].browser_download_url);
    expect(download.isNavigationRequest()).toBe(true);
    await expect(page.locator('[data-release-status]')).toContainText('0.1.2');
    for (const version of await page.locator('[data-version]').all())
      await expect(version).toHaveText('v0.1.2');
    for (const link of await page.locator('[data-download="mac"]').all())
      await expect(link).toHaveAttribute('href', current.assets[1].browser_download_url);
    expect(requests).toBe(2);
  });

test('early and repeated clicks wait for one lookup and download only once', async ({ page }) => {
  let finishLookup!: () => void;
  const gate = new Promise<void>((resolve) => (finishLookup = resolve));
  let requests = 0;
  let downloads = 0;
  await page.route('https://api.github.com/**', async (route) => {
    requests++;
    await gate;
    await route.fulfill({ json: fixture('4.0.0') });
  });
  await mockInstallerNavigation(page);
  page.on('request', (request) => {
    if (request.url().includes('/releases/download/')) downloads++;
  });
  await page.goto('/');
  const link = page.locator('[data-download="windows"]').first();
  await expect(link).toHaveAttribute('aria-busy', 'true');
  await expect(link).toHaveAttribute('href', RELEASES_URL);
  await expect(page.locator('[data-version]').first()).toHaveText('最新正式版');
  const downloadPromise = page.waitForRequest('https://github.com/**/releases/download/**');
  await link.click();
  await link.click();
  finishLookup();
  expect((await downloadPromise).url()).toBe(fixture('4.0.0').assets[0].browser_download_url);
  expect(requests).toBe(1);
  expect(downloads).toBe(1);
});

test('a failed check at download time opens latest releases, never the previous installer', async ({
  page,
}) => {
  await page.route(RELEASES_URL, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Latest release</h1>' }),
  );
  await page.goto('/');
  await expect(page.locator('[data-release-status]')).toContainText('2.0.0');
  await page.route('https://api.github.com/**', (route) => route.fulfill({ status: 429 }));
  await page.locator('[data-download="windows"]').last().click();
  await expect(page).toHaveURL(RELEASES_URL);
});

test('a missing installer opens the current release page', async ({ page }) => {
  const current = fixture('3.1.0');
  current.assets = current.assets.filter((asset) => !asset.name.endsWith('.dmg'));
  await page.route('https://api.github.com/**', (route) => route.fulfill({ json: current }));
  await page.route(current.html_url, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Current release</h1>' }),
  );
  await page.goto('/');
  await expect(page.locator('[data-release-status]')).toContainText('3.1.0');
  await page.locator('[data-download="mac"]').last().click();
  await expect(page).toHaveURL(current.html_url);
});

test('restoring a saved page refreshes its release and clears stale metadata on failure', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('[data-release-status]')).toContainText('2.0.0');
  await page.route('https://api.github.com/**', (route) =>
    route.fulfill({ json: fixture('4.0.0') }),
  );
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
  );
  await expect(page.locator('[data-release-status]')).toContainText('4.0.0');
  await page.route('https://api.github.com/**', (route) => route.abort());
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
  );
  await expect(page.locator('[data-release-status]')).toContainText('暂时无法检查更新');
  for (const link of await page.locator('[data-download]').all())
    await expect(link).toHaveAttribute('href', RELEASES_URL);
  for (const version of await page.locator('[data-version]').all())
    await expect(version).toHaveText('最新正式版');
  await expect(page.locator('[data-published]')).toBeHidden();
});

test('a stalled API request times out to the latest release page', async ({ page }) => {
  await page.route('https://api.github.com/**', () => {});
  await page.goto('/');
  await expect(page.locator('[data-release-status]')).toContainText('暂时无法检查更新', {
    timeout: 10000,
  });
  await expect(page.locator('[data-download="windows"]').first()).toHaveAttribute(
    'href',
    RELEASES_URL,
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
    RELEASES_URL,
  );
  await expect(page.locator('[data-release-status]')).toContainText('最新正式版');
  await expect(page.locator('.menu-toggle')).not.toBeVisible();
  await context.close();
});
