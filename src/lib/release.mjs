export const REPOSITORY = 'watericetangcw/PaperEnjoyer-Releases';
export const RELEASES_URL = `https://github.com/${REPOSITORY}/releases/latest`;
export const RELEASE_API = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;

/** @typedef {{name: string, url: string, size: number}} DownloadAsset */
/** @typedef {{version: string, publishedAt: string, pageUrl: string, assets: {windows: DownloadAsset | null, mac: DownloadAsset | null, linux: DownloadAsset | null}}} ReleaseInfo */

/** Only accept stable releases and actual installer assets from the official repository.
 * @param {unknown} input
 * @returns {ReleaseInfo}
 */
export function parseRelease(input) {
  const data = /** @type {any} */ (input);
  if (
    !data ||
    data.draft ||
    data.prerelease ||
    !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(data.tag_name ?? '') ||
    !Array.isArray(data.assets) ||
    typeof data.published_at !== 'string' ||
    !Number.isFinite(Date.parse(data.published_at))
  ) {
    throw new Error('The release is not a valid stable release.');
  }
  const version = data.tag_name.slice(1);
  const expectedPage = `https://github.com/${REPOSITORY}/releases/tag/${data.tag_name}`;
  if (data.html_url !== expectedPage) throw new Error('Unexpected release repository.');
  /** @param {string} name @returns {DownloadAsset | null} */
  const asset = (name) => {
    const found = data.assets.filter((/** @type {any} */ a) => a?.name === name);
    if (found.length !== 1) return null;
    const value = found[0];
    const expectedUrl = `https://github.com/${REPOSITORY}/releases/download/${data.tag_name}/${name}`;
    if (
      value.browser_download_url !== expectedUrl ||
      value.state !== 'uploaded' ||
      !Number.isSafeInteger(value.size) ||
      value.size <= 0
    )
      return null;
    return { name, url: value.browser_download_url, size: value.size };
  };
  return {
    version,
    publishedAt: data.published_at,
    pageUrl: expectedPage,
    assets: {
      windows: asset(`PaperEnjoyer-${version}-Setup.exe`),
      mac: asset(`PaperEnjoyer-${version}-macOS-arm64.dmg`),
      linux: asset(`PaperEnjoyer-${version}-Linux-amd64.deb`),
    },
  };
}

/** @param {{fetcher?: typeof fetch, timeout?: number}} options @returns {Promise<ReleaseInfo>} */
export async function fetchRelease({ fetcher = fetch, timeout = 6000 } = {}) {
  // Bypass both browser and intermediary caches when a new release is published.
  const url = new URL(RELEASE_API);
  url.searchParams.set('t', String(Date.now()));
  const response = await fetcher(url.href, {
    headers: { Accept: 'application/vnd.github+json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeout),
    credentials: 'omit',
  });
  if (!response.ok) throw new Error(`Release request failed (${response.status}).`);
  return parseRelease(await response.json());
}

/** @param {number} size */
export function formatSize(size) {
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
