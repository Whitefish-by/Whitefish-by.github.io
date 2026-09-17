import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../public/demo/', import.meta.url));
test('the checked-in demo is complete and its manifest matches every asset', async () => {
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 1);
  assert.match(manifest.sourceCommit, /^[a-f0-9]{40}$/);
  assert.equal(new Set(manifest.files.map((f) => f.path)).size, manifest.files.length);
  for (const file of manifest.files) {
    assert.ok(!path.isAbsolute(file.path) && !file.path.split('/').includes('..'));
    assert.ok(!file.path.endsWith('.map'));
    const bytes = await readFile(path.join(root, file.path));
    assert.equal(bytes.length, file.bytes, file.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
  }
  const bytes = await readFile(path.join(root, 'app/data/snapshot.json'));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.contentHash);
});
test('demo data has exactly the intended paper, existing notes and question with no account data', async () => {
  const data = JSON.parse(await readFile(path.join(root, 'app/data/snapshot.json'), 'utf8'));
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.snapshot.papers.length, 1);
  const paper = data.snapshot.papers[0];
  assert.equal(paper.title, 'Attention Is All You Need');
  assert.equal(paper.arxivId, '1706.03762');
  assert.equal(data.document.pages.length, paper.pageCount);
  assert.ok(
    data.notes[0].blocks.some((b) => b.translation && (b.translatedNote || b.originalNote)),
  );
  assert.ok(['partial', 'complete'].includes(data.notes[0].status));
  assert.equal(data.items.length, 2);
  assert.equal(data.items[0].text, '请解释Self-Attention是什么？');
  assert.equal(data.items[1].role, 'assistant');
  assert.equal(data.snapshot.settings.theme, 'light');
  assert.equal(data.snapshot.settings.pdfColorMode, 'original');
  assert.deepEqual(data.snapshot.settings.providers, []);
  assert.deepEqual(data.snapshot.jobs, []);
  assert.equal(data.initial.discoveryQuery, 'transformer');
  assert.equal(data.discovery.hits.length, 4);
  for (const session of data.snapshot.sessions) {
    assert.equal(session.threadId, null);
    assert.equal(session.workspace, null);
    assert.equal(session.active, false);
  }
  function inspect(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      assert.ok(
        !['apiKey', 'secrets', 'referenceFiles', 'runtimeHead', 'device'].includes(key),
        key,
      );
      inspect(child);
    }
  }
  inspect(data);
});
