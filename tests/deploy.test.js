import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('failed backend restart restores previous HTML and nginx config without removing old assets', () => {
  const root = mkdtempSync(join(tmpdir(), 'nyandou-deploy-'));
  try {
    for (const directory of ['deploy', 'public/assets', 'bin']) mkdirSync(join(root, directory), { recursive: true });
    writeFileSync(join(root, 'deploy/nginx.conf'), 'previous config');
    writeFileSync(join(root, 'deploy/nginx-next.conf'), 'next config');
    writeFileSync(join(root, 'public/index.html'), 'previous HTML');
    writeFileSync(join(root, 'public/assets/old.js'), 'previous asset');
    writeFileSync(join(root, 'public/assets/new.js'), 'next asset');
    writeFileSync(join(root, 'deploy/index.html'), 'next HTML');
    for (const file of ['robots.txt', 'robots.txt.gz', 'sitemap.xml', 'sitemap.xml.gz', 'third-party-notices.txt', 'third-party-notices.txt.gz']) {
      writeFileSync(join(root, 'deploy', file), file);
    }
    const nginx = join(root, 'bin/nginx');
    writeFileSync(nginx, '#!/bin/bash\nexit 0\n', { mode: 0o755 });
    writeFileSync(join(root, 'bin/sudo'), `#!/bin/bash
if [[ "$*" == *"systemctl restart"* && ! -e '${root}/failed' ]]; then
  touch '${root}/failed'
  exit 1
fi
exit 0
`, { mode: 0o755 });
    const source = readFileSync(new URL('../deploy/deploy.sh', import.meta.url), 'utf8');
    const script = source.split("<<'REMOTE'\n")[1].split('\nREMOTE')[0]
      .replaceAll('/home/ubuntu/Repos/NekoBeads', root).replaceAll('/usr/sbin/nginx', nginx);
    assert.throws(() => execFileSync('bash', ['-c', script], {
      env: { ...process.env, PATH: join(root, 'bin') + ':' + process.env.PATH }, stdio: 'pipe',
    }));
    assert.equal(readFileSync(join(root, 'public/index.html'), 'utf8'), 'previous HTML');
    assert.equal(readFileSync(join(root, 'deploy/nginx.conf'), 'utf8'), 'previous config');
    assert.equal(readFileSync(join(root, 'public/assets/old.js'), 'utf8'), 'previous asset');
    assert.equal(readFileSync(join(root, 'public/assets/new.js'), 'utf8'), 'next asset');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
