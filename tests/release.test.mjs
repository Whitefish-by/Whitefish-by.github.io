import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchRelease,
  parseRelease,
  formatSize,
  selectDownload,
  SITE_ORIGIN,
  RELEASE_API,
} from '../src/lib/release.mjs';
import { fixture } from './release-fixture.mjs';

test('accepts only matched platform packages and preserves both sources', () => {
  const input = fixture('2.5.1');
  const release = parseRelease(input);
  assert.equal(release.version, '2.5.1');
  for (const platform of ['windows', 'mac', 'linux']) {
    assert.equal(release.assets[platform].url, input.assets[platform].githubUrl);
    assert.equal(release.assets[platform].mirrorUrl, input.assets[platform].url);
  }
  assert.equal(formatSize(release.assets.windows.size), '100.0 MB');
});
test('rejects invalid version, date, schema and release repository', () => {
  for (const patch of [
    { schemaVersion: 2 },
    { version: '01.2.3' },
    { version: '1.2.3-beta' },
    { publishedAt: 'bad' },
    { pageUrl: 'https://example.com' },
  ])
    assert.throws(() => parseRelease({ ...fixture(), ...patch }));
});
test('missing or unsafe assets are never used as download destinations', () => {
  for (const patch of [
    null,
    { url: 'https://example.com/file' },
    { githubUrl: 'https://evil.invalid/file' },
    { name: 'wrong.exe' },
    { size: 0 },
    { sha256: 'bad' },
  ]) {
    const input = fixture();
    input.assets.windows = patch === null ? null : { ...input.assets.windows, ...patch };
    assert.equal(parseRelease(input).assets.windows, null);
    assert.ok(parseRelease(input).assets.mac);
  }
});
test('fetches same-origin fresh metadata without credentials', async () => {
  const result = await fetchRelease({
    fetcher: async (url, options) => {
      const parsed = new URL(url, SITE_ORIGIN);
      assert.equal(parsed.pathname, RELEASE_API);
      assert.match(parsed.searchParams.get('t'), /^\d+$/);
      assert.equal(options.cache, 'no-store');
      assert.equal(options.credentials, 'omit');
      return Response.json(fixture());
    },
  });
  assert.equal(result.version, '1.2.3');
  await assert.rejects(fetchRelease({ fetcher: async () => new Response(null, { status: 503 }) }));
});
test('opaque HEAD reachability selects GitHub without transferring an installer', async () => {
  const asset = parseRelease(fixture()).assets.windows;
  const selected = await selectDownload(asset, {
    fetcher: async (url, options) => {
      assert.equal(url, asset.url);
      assert.equal(options.method, 'HEAD');
      assert.equal(options.mode, 'no-cors');
      assert.equal(options.redirect, 'follow');
      return Object.defineProperty(new Response(null), 'type', { value: 'opaque' });
    },
  });
  assert.equal(selected, asset.url);
});
test('network errors, visible HTTP errors and timeouts switch to the same server version', async () => {
  const asset = parseRelease(fixture()).assets.linux;
  for (const fetcher of [
    async () => {
      throw new TypeError('Network failure');
    },
    async () => new Response(null, { status: 500 }),
  ])
    assert.equal(await selectDownload(asset, { fetcher }), asset.mirrorUrl);
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    assert.equal(
      await selectDownload(asset, {
        timeout: 5,
        fetcher: (_url, options) =>
          new Promise((_, reject) =>
            options.signal.addEventListener('abort', () => reject(options.signal.reason)),
          ),
      }),
      asset.mirrorUrl,
    );
  } finally {
    clearTimeout(keepAlive);
  }
});
