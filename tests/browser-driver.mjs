import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// No browser library is shipped to visitors. Chrome's local debugging API is
// used only by tests; CHROME_BIN supports other Chromium installations.
export async function withBrowser(url, operation) {
  const profile = await mkdtemp(join(process.env.TEST_TMPDIR ?? tmpdir(), 'nyandou-chrome-'));
  const chrome = spawn(process.env.CHROME_BIN ?? '/usr/bin/google-chrome', [
    '--headless', '--disable-gpu', '--no-proxy-server', '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let socket;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Chrome startup timed out')), 15000);
      let output = '';
      chrome.stderr.on('data', chunk => {
        output = (output + chunk).slice(-4096);
        const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      chrome.once('error', error => { clearTimeout(timer); reject(error); });
      chrome.once('exit', () => { clearTimeout(timer); reject(new Error('Chrome exited before startup')); });
    });
    const origin = endpoint.replace(/^ws:/, 'http:').split('/').slice(0, 3).join('/');
    const targets = await (await fetch(`${origin}/json/list`)).json();
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    let nextId = 0;
    const call = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId;
      const handler = event => {
        const message = JSON.parse(event.data);
        if (message.id !== id) return;
        clearTimeout(timer);
        socket.removeEventListener('message', handler);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      };
      const timer = setTimeout(() => {
        socket.removeEventListener('message', handler);
        reject(new Error(`${method} timed out`));
      }, 90000);
      socket.addEventListener('message', handler);
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
      const response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
      return response.result.value;
    };
    await call('Page.enable');
    await call('Page.navigate', { url });
    await evaluate(`new Promise(resolve => {
      if (document.readyState === 'complete') resolve();
      else window.addEventListener('load', resolve, {once:true});
    })`);
    return await operation({ call, evaluate });
  } finally {
    socket?.close();
    chrome.kill('SIGTERM');
    await new Promise(resolve => !chrome.pid || chrome.exitCode !== null || chrome.signalCode !== null
      ? resolve() : chrome.once('exit', resolve));
    await rm(profile, { recursive: true, force: true });
  }
}
