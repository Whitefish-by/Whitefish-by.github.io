import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const locales = ['en', 'zh-hans', 'zh-hant', 'ja', 'ko', 'ru', 'fr', 'de'];
const load = async (group, locale) =>
  JSON.parse(
    await readFile(new URL(`../src/data/${group}/${locale}.json`, import.meta.url), 'utf8'),
  );
function compare(reference, value, path = '') {
  if (typeof reference === 'string') {
    assert.equal(typeof value, 'string', path);
    assert.ok(value.trim(), path);
    assert.ok(!/\uFFFD|\?{2,}/.test(value), `Damaged encoding: ${path}`);
    assert.deepEqual(
      [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(),
      [...reference.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(),
      `Pricing placeholders: ${path}`,
    );
    return;
  }
  assert.deepEqual(Object.keys(value).sort(), Object.keys(reference).sort(), path);
  for (const key of Object.keys(reference)) compare(reference[key], value[key], `${path}.${key}`);
}
for (const group of ['locales', 'pricing']) {
  test(`${group}: all eight translations are complete and preserve commercial placeholders`, async () => {
    const reference = await load(group, 'en');
    for (const locale of locales) {
      const actual = await load(group, locale);
      compare(reference, actual, `${group}/${locale}`);
      if (locale !== 'en') assert.notEqual(actual.title, reference.title, locale);
      if (group === 'locales') {
        assert.deepEqual(
          actual.story.map((x) => [x.number, x.icon]),
          reference.story.map((x) => [x.number, x.icon]),
        );
        assert.deepEqual(
          actual.scenes.map((x) => x.id),
          reference.scenes.map((x) => x.id),
        );
      }
    }
  });
}
