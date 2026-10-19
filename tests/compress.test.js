import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

test('build compression preserves exact asset bytes and is deterministic', () => {
  const root = mkdtempSync(join(tmpdir(), 'nyandou-compress-'));
  try {
    mkdirSync(join(root, 'dist/assets'), { recursive: true });
    const asset = join(root, 'dist/assets/worker-example.js');
    const original = Buffer.from('console.log("ニャンドゥ");\n');
    writeFileSync(asset, original);
    const script = fileURLToPath(new URL('../scripts/compress.mjs', import.meta.url));
    execFileSync(process.execPath, [script], { cwd: root, stdio: 'pipe' });
    const first = readFileSync(asset + '.gz');
    assert.deepEqual(gunzipSync(first), original);
    execFileSync(process.execPath, [script], { cwd: root, stdio: 'pipe' });
    assert.deepEqual(readFileSync(asset + '.gz'), first);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
