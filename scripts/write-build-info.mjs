import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

// Record the actual checkout; a manual pre-commit deployment must not claim to be clean.
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = Boolean(
  execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], {
    encoding: 'utf8',
  }).trim(),
);
await writeFile(
  new URL('../dist/site-build.json', import.meta.url),
  JSON.stringify({ sourceSha, dirty, builtAt: new Date().toISOString() }, null, 2) + '\n',
);
