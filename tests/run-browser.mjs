import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { withBrowser } from './browser-driver.mjs';

const root = resolve('.test-dist');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  const path = resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
  try {
    if (!path.startsWith(root + sep)) throw new Error('Invalid path');
    const content = await readFile(path.endsWith(sep) ? path + 'index.html' : path);
    response.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream' });
    response.end(content);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const result = await withBrowser(`http://127.0.0.1:${server.address().port}/tests/browser.html`, ({ evaluate }) => evaluate(`new Promise(resolve => {
    const finish = () => {
      if (document.getElementById('summary')?.textContent.startsWith('完成：')) {
        resolve({summary:document.getElementById('summary').textContent,
          failures:[...document.querySelectorAll('li.fail')].map(el=>el.textContent)});
        return true;
      }
    };
    if (!finish()) {
      const observer = new MutationObserver(()=>{if(finish())observer.disconnect();});
      observer.observe(document.documentElement,{childList:true,subtree:true});
    }
  })`));
  console.log(JSON.stringify(result, null, 2));
  if (result.failures.length) process.exitCode = 1;
} finally { await new Promise(resolve => server.close(resolve)); }
