import fallback from '../data/release.json';
import { fetchRelease, type ReleaseInfo } from './release.mjs';

let current: Promise<ReleaseInfo> | undefined;
export function buildRelease(): Promise<ReleaseInfo> {
  return (current ??=
    process.env.RELEASE_API_MODE === 'offline'
      ? Promise.resolve(fallback)
      : fetchRelease().catch((error) => {
          console.warn(
            'Release lookup unavailable; using the confirmed release snapshot.',
            error.message,
          );
          return fallback;
        }));
}
