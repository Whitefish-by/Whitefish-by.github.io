import { REPOSITORY } from '../src/lib/release.mjs';
export function fixture(version = '1.2.3') {
  const names = [
    `PaperEnjoyer-${version}-Setup.exe`,
    `PaperEnjoyer-${version}-macOS-arm64.dmg`,
    `PaperEnjoyer-${version}-Linux-amd64.deb`,
    `PaperEnjoyer-${version}-Linux-arm64.deb`,
    `PaperEnjoyer-${version}-Setup.exe.blockmap`,
    'latest.yml',
  ];
  return {
    tag_name: `v${version}`,
    html_url: `https://github.com/${REPOSITORY}/releases/tag/v${version}`,
    published_at: '2026-09-17T01:00:00Z',
    draft: false,
    prerelease: false,
    assets: names.map((name) => ({
      name,
      state: 'uploaded',
      size: 104857600,
      browser_download_url: `https://github.com/${REPOSITORY}/releases/download/v${version}/${name}`,
    })),
  };
}
