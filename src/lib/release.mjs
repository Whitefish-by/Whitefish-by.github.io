export const REPOSITORY = 'watericetangcw/PaperEnjoyer-Releases';
export const RELEASES_URL = `https://github.com/${REPOSITORY}/releases/latest`;
export const SITE_ORIGIN = 'https://paperenjoyer.com';
export const RELEASE_API = '/downloads/latest.json';
export const downloadFallback = (platform) => `/download/${platform}`;

/** @typedef {{name: string, url: string, mirrorUrl: string, size: number, sha256: string}} DownloadAsset */
/** @typedef {{version: string, publishedAt: string, pageUrl: string, assets: {windows: DownloadAsset | null, mac: DownloadAsset | null, linux: DownloadAsset | null}}} ReleaseInfo */

/** Only accept verified mirror manifests and exact official download URLs.
 * @param {unknown} input
 * @returns {ReleaseInfo}
 */
export function parseRelease(input) {
  const data = /** @type {any} */ (input);
  if (
    !data ||
    data.schemaVersion !== 1 ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(data.version ?? '') ||
    !data.assets ||
    typeof data.publishedAt !== 'string' ||
    !Number.isFinite(Date.parse(data.publishedAt))
  ) {
    throw new Error('The release is not a valid stable release.');
  }
  const version = data.version;
  const expectedPage = `https://github.com/${REPOSITORY}/releases/tag/v${version}`;
  if (data.pageUrl !== expectedPage) throw new Error('Unexpected release repository.');
  /** @param {string} platform @param {string} name @returns {DownloadAsset | null} */
  const asset = (platform, name) => {
    const value = data.assets[platform];
    if (!value) return null;
    const expectedUrl = `https://github.com/${REPOSITORY}/releases/download/v${version}/${name}`;
    const mirrorUrl = `${SITE_ORIGIN}/downloads/v${version}/${name}`;
    if (
      value.name !== name ||
      value.githubUrl !== expectedUrl ||
      value.url !== mirrorUrl ||
      !/^[a-f0-9]{64}$/.test(value.sha256 ?? '') ||
      !Number.isSafeInteger(value.size) ||
      value.size <= 0
    )
      return null;
    return { name, url: expectedUrl, mirrorUrl, size: value.size, sha256: value.sha256 };
  };
  return {
    version,
    publishedAt: data.publishedAt,
    pageUrl: expectedPage,
    assets: {
      windows: asset('windows', `PaperEnjoyer-${version}-Setup.exe`),
      mac: asset('mac', `PaperEnjoyer-${version}-macOS-arm64.dmg`),
      linux: asset('linux', `PaperEnjoyer-${version}-Linux-amd64.deb`),
    },
  };
}

/** @param {{fetcher?: typeof fetch, timeout?: number}} options @returns {Promise<ReleaseInfo>} */
export async function fetchRelease({ fetcher = fetch, timeout = 6000 } = {}) {
  // Bypass both browser and intermediary caches when a new release is published.
  const response = await fetcher(`${RELEASE_API}?t=${Date.now()}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeout),
    credentials: 'omit',
  });
  if (!response.ok) throw new Error(`Release request failed (${response.status}).`);
  return parseRelease(await response.json());
}

/** Probe transport reachability only; opaque responses do not prove download success.
 * @param {DownloadAsset} asset
 * @param {{fetcher?: typeof fetch, timeout?: number}} options
 */
export async function selectDownload(asset, { fetcher = fetch, timeout = 5000 } = {}) {
  try {
    const response = await fetcher(asset.url, {
      method: 'HEAD',
      mode: 'no-cors',
      redirect: 'follow',
      credentials: 'omit',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeout),
    });
    return response.type === 'opaque' || response.ok ? asset.url : asset.mirrorUrl;
  } catch {
    return asset.mirrorUrl;
  }
}

/** @param {number} size */
export function formatSize(size) {
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
