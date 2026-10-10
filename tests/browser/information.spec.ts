import { test, expect } from '@playwright/test';
import { fixture } from '../release-fixture.mjs';

const pages = [
  ['/pricing', 'Pricing'],
  ['/terms', 'Terms of Service'],
  ['/privacy', 'Privacy Policy'],
  ['/refund', 'Refund Policy'],
] as const;

for (const [path, title] of pages) {
  test(`${path} is a readable standalone English page with its own canonical`, async ({
    page,
    browserName,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(`${title} · PaperEnjoyer`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `https://paperenjoyer.com${path}`,
    );
    await expect(page.locator('link[hreflang]')).toHaveCount(0);
    await expect(page.locator('meta[name="robots"][content="noindex"]')).toHaveCount(0);
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(page.locator('h1')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      for (const link of await page.locator('.policy-links a').all()) {
        await expect(link).toBeVisible();
        const box = await link.boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }
      await page.screenshot({
        path: info.outputPath(`${path.slice(1)}-${width}.png`),
        animations: 'disabled',
      });
    }
    for (const link of await page
      .getByRole('navigation', { name: 'On this page', exact: true })
      .locator('a')
      .all()) {
      const target = await link.getAttribute('href');
      await expect(page.locator(target!)).toHaveCount(1);
    }
    const skip = page.getByRole('link', { name: 'Skip to content' });
    // WebKit's platform setting may exclude links from Tab navigation. Still verify
    // keyboard activation and the focus destination in both engines.
    if (browserName === 'webkit') await skip.focus();
    else await page.keyboard.press('Tab');
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`${path}#main$`));
    await expect(page.locator('#main')).toBeFocused();
    expect(errors).toEqual([]);
  });
}

for (const home of ['/', '/en/']) {
  test(`${home} links to all four pages`, async ({ page }) => {
    await page.route('**/downloads/latest.json*', (route) =>
      route.fulfill({ json: fixture('2.0.0') }),
    );
    await page.goto(home);
    for (const [path, title] of pages) {
      const link = page.locator(`footer a[href="${path}"]`);
      await expect(link).toHaveCount(1);
      await link.click();
      await expect(page).toHaveTitle(`${title} · PaperEnjoyer`);
      await page.goBack();
    }
  });
}

test('planned entitlements cannot be mistaken for an active checkout', async ({ page }) => {
  const paymentRequests: string[] = [];
  page.on('request', (request) => {
    if (/paddle\.(com|net)/.test(request.url())) paymentRequests.push(request.url());
  });
  await page.goto('/pricing');
  await expect(page.locator('#plan-status')).toBeVisible();
  await expect(page.locator('#plan-status')).toContainText(
    'not the entitlements of the current free app',
  );
  await expect(
    page.locator('.plan-card .plan-availability', { hasText: 'Coming soon' }),
  ).toHaveCount(2);
  await expect(page.getByRole('button', { name: /buy|subscribe|checkout/i })).toHaveCount(0);
  await page.getByRole('link', { name: 'Download the current free app' }).click();
  await expect(page).toHaveURL(/\/en\/#download$/);
  expect(paymentRequests).toEqual([]);
});

test('pricing and policies remain usable without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  for (const [path] of pages) {
    await page.goto(`http://127.0.0.1:4322${path}`);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.policy-links a')).toHaveCount(4);
  }
  await context.close();
});
