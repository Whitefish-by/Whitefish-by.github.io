import { test, expect } from '@playwright/test';
import { locales, localeKeys, localizedPath } from '../../src/data/locales';
import { copy } from '../../src/data/copy';
import { pricingCopy } from '../../src/data/pricing';
import { fixture } from '../release-fixture.mjs';

test.beforeEach(async ({ page }) => {
  await page.route('**/downloads/latest.json*', (route) =>
    route.fulfill({ json: fixture('2.0.0') }),
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

for (const locale of localeKeys) {
  for (const kind of ['home', 'pricing'] as const) {
    const path = localizedPath(locale, kind);
    test(`${locale} ${kind}: localized content, routes, metadata and responsive controls`, async ({
      page,
    }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page).toHaveTitle(
        kind === 'home' ? copy[locale].title : `${pricingCopy[locale].title} · PaperEnjoyer`,
      );
      await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
        'href',
        `https://paperenjoyer.com${path}`,
      );
      await expect(page.locator('link[hreflang]')).toHaveCount(9);
      for (const target of localeKeys) {
        await expect(page.locator(`link[hreflang="${target}"]`)).toHaveAttribute(
          'href',
          `https://paperenjoyer.com${localizedPath(target, kind)}`,
        );
      }
      await expect(page.locator('link[hreflang="x-default"]')).toHaveAttribute(
        'href',
        `https://paperenjoyer.com${localizedPath('en', kind)}`,
      );
      if (kind === 'home') {
        await expect(page.locator('.hero h1')).toContainText(copy[locale].heroAccent);
        await expect(page.locator('[data-release-status]')).toContainText(copy[locale].latest);
      } else {
        await expect(page.locator('#plan-status')).toContainText(pricingCopy[locale].statusText);
        for (const [name, price, credits, storage] of [
          ['Free', '0', '100', '1'],
          ['Lite', '4.99', '1200', '10'],
          ['Pro', '19.99', '6000', '50'],
        ]) {
          const card = page.locator(`[data-plan="${name}"]`);
          await expect(card).toHaveAttribute('data-price', price);
          await expect(card).toHaveAttribute('data-credits', credits);
          await expect(card).toHaveAttribute('data-storage', storage);
          await expect(card.locator('.plan-price')).toContainText(`$${price}`);
        }
        await expect(page.locator('.pricing-bottom .button')).toHaveAttribute(
          'href',
          `${localizedPath(locale)}#download`,
        );
        await expect(page.locator('button')).toHaveCount(0);
      }
      await expect(
        page.locator(`footer a[href="${localizedPath(locale, 'pricing')}"]`),
      ).toHaveCount(1);
      for (const policy of ['terms', 'privacy', 'refund'] as const) {
        const link = page.locator(`footer a[href="/${policy}"]`);
        await expect(link).toHaveAttribute('hreflang', 'en');
        if (locale !== 'en') await expect(link).toContainText(copy[locale].policyEnglish);
      }
      const picker = page.locator('[data-language-switcher]');
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(() => scrollTo(0, 0));
        await picker.locator('summary').click();
        await expect(picker).toHaveAttribute('open', '');
        await expect(picker.locator('a')).toHaveCount(8);
        const box = (await picker.locator('nav').boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        for (const link of await picker.locator('a').all())
          expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.keyboard.press('Escape');
        await expect(picker).not.toHaveAttribute('open', '');
        await expect(picker.locator('summary')).toBeFocused();
        if (width === 390 || width === 1440)
          await page.screenshot({
            path: info.outputPath(`${kind}-${width}.png`),
            animations: 'disabled',
          });
      }
      expect(errors).toEqual([]);
    });
  }
}

for (const kind of ['home', 'pricing'] as const) {
  test(`language changes retain ${kind}, query and fragment with keyboard navigation`, async ({
    page,
  }) => {
    const hash = kind === 'home' ? '#faq' : '#rules-heading';
    await page.goto(localizedPath('en', kind) + '?from=language-test' + hash);
    const picker = page.locator('[data-language-switcher]');
    await picker.locator('summary').focus();
    await page.keyboard.press('Enter');
    await picker.locator('a[lang="fr"]').focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(
      `http://127.0.0.1:4322${localizedPath('fr', kind)}?from=language-test${hash}`,
    );
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  });
}

test('English is the default even with a Chinese browser; old English links retain their destination', async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: 'zh-CN' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.goto('/en/?source=legacy#download');
  await expect(page).toHaveURL('http://127.0.0.1:4322/?source=legacy#download');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await context.close();
});

test('all languages work without JavaScript and sitemap lists only canonical pages', async ({
  browser,
  request,
}) => {
  test.setTimeout(60000);
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  for (const locale of localeKeys) {
    for (const kind of ['home', 'pricing'] as const) {
      await page.goto(localizedPath(locale, kind));
      await expect(page.locator('h1')).toBeVisible();
      const picker = page.locator('[data-language-switcher]');
      await picker.locator('summary').click();
      await expect(picker.locator('a')).toHaveCount(8);
      await picker.locator('a[lang="en"]').click();
      await expect(page).toHaveURL(`http://127.0.0.1:4322${localizedPath('en', kind)}`);
    }
  }
  await context.close();
  const response = await request.get('/sitemap.xml');
  expect(response.status()).toBe(200);
  const sitemap = await response.text();
  expect((sitemap.match(/<loc>/g) ?? []).length).toBe(19);
  for (const locale of localeKeys)
    for (const kind of ['home', 'pricing'] as const)
      expect(sitemap).toContain(
        `<loc>https://paperenjoyer.com${localizedPath(locale, kind)}</loc>`,
      );
  expect(sitemap).not.toContain('https://paperenjoyer.com/en/');
});
