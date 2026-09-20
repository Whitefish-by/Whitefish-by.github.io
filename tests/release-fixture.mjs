import { REPOSITORY, SITE_ORIGIN } from '../src/lib/release.mjs';
export function fixture(version = '1.2.3') {
  const names = {
    windows: `PaperEnjoyer-${version}-Setup.exe`,
    mac: `PaperEnjoyer-${version}-macOS-arm64.dmg`,
    linux: `PaperEnjoyer-${version}-Linux-amd64.deb`,
  };
  const files = Object.fromEntries(
    [
      ...Object.values(names),
      names.windows + '.blockmap',
      'latest.yml',
      ...Object.keys(names).map((p) => `SHA256SUMS-${p}.txt`),
    ].map((name) => [
      name,
      {
        name,
        size: 104857600,
        sha256: 'a'.repeat(64),
        githubUrl: `https://github.com/${REPOSITORY}/releases/download/v${version}/${name}`,
        url: `${SITE_ORIGIN}/downloads/v${version}/${name}`,
      },
    ]),
  );
  return {
    schemaVersion: 1,
    version,
    publishedAt: '2026-09-17T01:00:00Z',
    pageUrl: `https://github.com/${REPOSITORY}/releases/tag/v${version}`,
    files,
    assets: Object.fromEntries(Object.entries(names).map(([p, n]) => [p, files[n]])),
  };
}
