// End-to-end check with real Chrome downloads against a running site:
//   node tests/smoke.mjs [url]   (defaults to the local `npm run preview` server)
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { watch } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { withBrowser } from './browser-driver.mjs';

const url = process.argv[2] ?? 'http://127.0.0.1:4174/';
const directory = await mkdtemp(join(process.env.TEST_TMPDIR ?? tmpdir(), 'nyandou-download-'));
const PNG_SIGNATURE = '89504e470d0a1a0a';
const READY = '图纸已就绪';

/** Resolves with the file names once both PNG downloads have arrived. */
function waitForPngDownloads(count, timeoutMs) {
  let watcher;
  let timer;
  const promise = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Native downloads timed out')), timeoutMs);
    watcher = watch(directory, async () => {
      const names = (await readdir(directory)).filter(name => name.endsWith('.png'));
      if (names.length === count) {
        clearTimeout(timer);
        resolve(names);
      }
    });
  });
  promise.catch(() => {}); // Awaited later, after the download buttons are clicked.
  return { promise, close: () => { clearTimeout(timer); watcher?.close(); } };
}

/** Polls a JavaScript condition inside the page. */
function waitInPage(evaluate, condition, message, timeoutMs = 10000) {
  return evaluate(`(async () => {
    const start = performance.now();
    while (!(${condition})) {
      if (performance.now() - start > ${timeoutMs}) throw Error(${JSON.stringify(message)});
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  })()`);
}

const statusIsReady = `document.getElementById('status')?.textContent === '${READY}'`;

async function click(call, point) {
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
}

async function checkInitialLayout(evaluate) {
  const initial = await evaluate(`({
    size: document.getElementById('size-stat').textContent,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    width: innerWidth,
    targetHeight: document.getElementById('grid-tab').getBoundingClientRect().height,
    canonical: document.querySelector('link[rel="canonical"]').href,
  })`);
  assert.equal(initial.size, '32 × 24');
  assert.equal(initial.width, 390);
  assert.equal(initial.overflow, false);
  assert(initial.targetHeight >= 44);
  assert.equal(initial.canonical, 'https://dou.love765.me/');
  return initial;
}

/** Clicks both PNG download buttons like a user and waits until each is usable again. */
async function downloadBothPngs(call, evaluate) {
  for (const id of ['export-chart', 'export-pixel']) {
    const center = await evaluate(`(() => {
      const button = document.getElementById('${id}');
      button.scrollIntoView();
      const bounds = button.getBoundingClientRect();
      return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    })()`);
    await click(call, center);
    await waitInPage(evaluate, `!document.getElementById('${id}').disabled`, 'UI locked after download');
  }
}

/** Drags a slider with real mouse events and reports whether the preview changed mid-drag. */
async function dragSlider(call, evaluate, id, values) {
  const range = await evaluate(`(() => {
    const input = document.getElementById('${id}');
    input.scrollIntoView({ block: 'center' });
    const bounds = input.getBoundingClientRect();
    globalThis.dragCanvasBefore = document.getElementById('preview-canvas').toDataURL();
    return { x: bounds.x, y: bounds.y + bounds.height / 2, width: bounds.width, min: Number(input.min), max: Number(input.max) };
  })()`);
  // The thumb travels between 8px from either end of the track.
  const pointFor = value => ({
    x: range.x + 8 + (range.width - 16) * (value - range.min) / (range.max - range.min),
    y: range.y,
  });

  await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, ...pointFor(values[0]) });
  let refreshed = false;
  for (const value of values) {
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1, ...pointFor(value) });
    const changed = await evaluate(`new Promise(resolve => setTimeout(() => resolve(
      document.getElementById('preview-canvas').toDataURL() !== globalThis.dragCanvasBefore), 100))`);
    refreshed ||= changed;
  }
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, ...pointFor(values.at(-1)) });
  assert(refreshed, `${id}: canvas did not refresh during native dragging`);
  await waitInPage(evaluate, statusIsReady, 'Final slider result timed out');
  return { slider: id, refreshedBeforeRelease: refreshed };
}

async function checkStillUsable(evaluate) {
  const switched = await evaluate(`(() => {
    document.getElementById('beads-tab').click();
    return document.getElementById('preview-canvas').dataset.mode === 'beads';
  })()`);
  await evaluate(`(() => {
    const width = document.getElementById('width-input');
    width.value = 40;
    width.dispatchEvent(new Event('input'));
  })()`);
  await waitInPage(evaluate, statusIsReady, 'Regeneration locked after download');
  const state = await evaluate(`({
    switched: ${switched},
    size: document.getElementById('size-stat').textContent,
    disabled: document.getElementById('export-chart').disabled,
    errorVisible: !document.getElementById('error').hidden,
  })`);
  assert(state.switched && !state.disabled && !state.errorVisible);
  assert.equal(state.size, '40 × 30');
  return state;
}

async function checkDownloadedFiles(names) {
  const files = [];
  for (const name of names) {
    const bytes = await readFile(join(directory, name));
    assert.equal(bytes.subarray(0, 8).toString('hex'), PNG_SIGNATURE);
    if (name.endsWith('-8bit.png')) {
      assert.equal(bytes[24], 8, 'bit depth');
      assert.equal(bytes[25], 3, 'indexed color type');
      assert.equal(bytes.readUInt32BE(16), 32, 'width');
      assert.equal(bytes.readUInt32BE(20), 24, 'height');
    }
    files.push({ name, bytes: bytes.length });
  }
  return files;
}

const downloads = waitForPngDownloads(2, 20000);
try {
  const ui = await withBrowser(url, async ({ call, evaluate }) => {
    await call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: directory });
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await waitInPage(evaluate, statusIsReady, 'Initial chart timed out', 30000);

    const initial = await checkInitialLayout(evaluate);
    await downloadBothPngs(call, evaluate);
    await downloads.promise;
    const dragging = [
      await dragSlider(call, evaluate, 'width-input', Array.from({ length: 12 }, (_, i) => 40 + i)),
      await dragSlider(call, evaluate, 'colors-input', Array.from({ length: 12 }, (_, i) => 2 + i)),
    ];
    await evaluate('delete globalThis.dragCanvasBefore');
    const state = await checkStillUsable(evaluate);
    return { initial, dragging, state };
  });
  const files = await checkDownloadedFiles(await downloads.promise);
  console.log(JSON.stringify({ url, files, ui }, null, 2));
} finally {
  downloads.close();
}
