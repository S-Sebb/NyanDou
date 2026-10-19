import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

// Precompress production text assets. nginx serves these without runtime work.
async function compress(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await compress(path);
    else if (/\.(?:html|js|css|svg|xml|txt)$/.test(entry.name)) {
      await writeFile(`${path}.gz`, gzipSync(await readFile(path), { level: 9, mtime: 0 }));
    }
  }
}
await compress('dist');
