import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchRelease, parseRelease, formatSize, RELEASE_API } from '../src/lib/release.mjs';
import { fixture } from './release-fixture.mjs';

test('selects actual platform installers, never updater metadata', () => {
  const release = parseRelease(fixture());
  assert.equal(release.version, '1.2.3');
  assert.equal(release.assets.windows.name, 'PaperEnjoyer-1.2.3-Setup.exe');
  assert.equal(release.assets.mac.name, 'PaperEnjoyer-1.2.3-macOS-arm64.dmg');
  assert.equal(release.assets.linux.name, 'PaperEnjoyer-1.2.3-Linux-amd64.deb');
  assert.equal(formatSize(release.assets.windows.size), '100.0 MB');
});
test('uses the current release tag instead of a hard-coded version', () => {
  assert.match(
    parseRelease(fixture('2.5.1')).assets.mac.url,
    /v2\.5\.1\/PaperEnjoyer-2\.5\.1-macOS-arm64\.dmg$/,
  );
  assert.match(
    parseRelease(fixture('2.5.1')).assets.linux.url,
    /v2\.5\.1\/PaperEnjoyer-2\.5\.1-Linux-amd64\.deb$/,
  );
});
test('represents missing platforms explicitly without inventing links', () => {
  const input = fixture();
  input.assets = input.assets.filter((a) => !a.name.endsWith('.dmg'));
  input.assets = input.assets.filter((a) => !a.name.endsWith('Linux-amd64.deb'));
  const value = parseRelease(input);
  assert.equal(value.assets.mac, null);
  assert.equal(value.assets.linux, null);
  assert.ok(value.assets.windows);
});

test('does not offer unfinished or empty installer uploads', () => {
  for (const patch of [{ state: 'starter' }, { size: 0 }, { size: -1 }]) {
    const input = fixture();
    Object.assign(input.assets[0], patch);
    Object.assign(input.assets[2], patch);
    assert.equal(parseRelease(input).assets.windows, null);
    assert.equal(parseRelease(input).assets.linux, null);
    assert.ok(parseRelease(input).assets.mac);
  }
});
test('rejects drafts, prereleases, invalid versions and invalid dates', () => {
  for (const patch of [
    { draft: true },
    { prerelease: true },
    { tag_name: 'v1.0.0-beta' },
    { tag_name: 'v01.2.3' },
    { published_at: 'invalid' },
    { published_at: 2026 },
  ])
    assert.throws(() => parseRelease({ ...fixture(), ...patch }));
  assert.throws(() => parseRelease(null));
});
test('rejects unexpected repositories, URLs and ambiguous installers', () => {
  assert.throws(() => parseRelease({ ...fixture(), html_url: 'https://example.com' }));
  const input = fixture();
  input.assets[0].browser_download_url = 'https://example.com/install.exe';
  input.assets[2].browser_download_url = 'https://example.com/install.deb';
  assert.equal(parseRelease(input).assets.windows, null);
  assert.equal(parseRelease(input).assets.linux, null);
  const duplicate = fixture();
  duplicate.assets.push(duplicate.assets[0]);
  duplicate.assets.push(duplicate.assets[2]);
  assert.equal(parseRelease(duplicate).assets.windows, null);
  assert.equal(parseRelease(duplicate).assets.linux, null);
});
test('fetches anonymously and parses the response', async () => {
  const result = await fetchRelease({
    fetcher: async (url, options) => {
      const requestUrl = new URL(url);
      assert.match(requestUrl.searchParams.get('t'), /^\d+$/);
      requestUrl.search = '';
      assert.equal(requestUrl.href, RELEASE_API);
      assert.equal(options.cache, 'no-store');
      assert.equal(options.credentials, 'omit');
      assert.ok(options.signal);
      return Response.json(fixture());
    },
  });
  assert.equal(result.version, '1.2.3');
});

test('a later lookup returns the newly published release and its own installer', async () => {
  let version = '0.1.1';
  const fetcher = async () => Response.json(fixture(version));
  const previous = await fetchRelease({ fetcher });
  version = '0.1.2';
  const latest = await fetchRelease({ fetcher });
  assert.equal(previous.version, '0.1.1');
  assert.equal(latest.version, '0.1.2');
  assert.equal(latest.assets.windows.url, fixture(version).assets[0].browser_download_url);
});
test('surfaces API failures and network timeouts for the UI fallback', async () => {
  for (const status of [403, 404, 429, 500])
    await assert.rejects(fetchRelease({ fetcher: async () => new Response('', { status }) }));
  await assert.rejects(
    fetchRelease({
      fetcher: async () => {
        throw new DOMException('Timed out', 'TimeoutError');
      },
    }),
  );
});
