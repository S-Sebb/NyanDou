import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { watch } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { withBrowser } from './browser-driver.mjs';

const directory = await mkdtemp(join(process.env.TEST_TMPDIR ?? tmpdir(), 'nyandou-download-'));
const url = process.argv[2] ?? 'http://127.0.0.1:4174/';
let watcher;
let timer;
try {
  const downloaded = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Native downloads timed out')), 20000);
    watcher = watch(directory, async () => {
      const names = (await readdir(directory)).filter(name => name.endsWith('.png'));
      if (names.length === 2) { clearTimeout(timer); resolve(names); }
    });
  });
  downloaded.catch(() => {}); // The original promise is awaited after browser clicks.
  const ui = await withBrowser(url, async ({ call, evaluate }) => {
    await call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: directory });
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await evaluate(`new Promise(resolve => {
      const done = () => document.getElementById('status')?.textContent === '图纸已就绪';
      if (done()) resolve();
      else { const observer = new MutationObserver(() => {if(done()){observer.disconnect();resolve();}});
        observer.observe(document.body,{subtree:true,childList:true}); }
    })`);
    const initial = await evaluate(`({
      size:document.getElementById('size-stat').textContent,
      overflow:document.documentElement.scrollWidth > document.documentElement.clientWidth,
      width:innerWidth,
      targetHeight:document.getElementById('grid-tab').getBoundingClientRect().height,
      canonical:document.querySelector('link[rel="canonical"]').href
    })`);
    assert.equal(initial.size, '32 × 24');
    assert.equal(initial.width, 390);
    assert.equal(initial.overflow, false);
    assert(initial.targetHeight >= 44);
    assert.equal(initial.canonical, 'https://dou.love765.me/');
    for (const id of ['export-chart', 'export-pixel']) {
      const bounds = await evaluate(`(() => {
        const button = document.getElementById('${id}'); button.scrollIntoView();
        const b = button.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2};
      })()`);
      await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...bounds });
      await call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...bounds });
      await evaluate(`(async () => {
        const start = performance.now();
        while (document.getElementById('${id}').disabled) {
          if (performance.now()-start>10000) throw Error('UI locked after download');
          await new Promise(resolve=>setTimeout(resolve,20));
        }
      })()`);
    }
    await downloaded;
    const dragging = [];
    for (const [id, values] of [
      ['width-input', Array.from({ length: 12 }, (_, i) => 40 + i)],
      ['colors-input', Array.from({ length: 12 }, (_, i) => 2 + i)],
    ]) {
      const range = await evaluate(`(() => {
        const input = document.getElementById('${id}'); input.scrollIntoView({block:'center'});
        const b = input.getBoundingClientRect();
        globalThis.dragCanvasBefore = document.getElementById('preview-canvas').toDataURL();
        return {x:b.x,y:b.y+b.height/2,width:b.width,min:Number(input.min),max:Number(input.max)};
      })()`);
      const point = value => ({ x: range.x + 8 + (range.width - 16) * (value - range.min) / (range.max - range.min), y: range.y });
      await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, ...point(values[0]) });
      let refreshed = false;
      for (const value of values) {
        await call('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1, ...point(value) });
        const changed = await evaluate(`new Promise(resolve => setTimeout(() => resolve(
          document.getElementById('preview-canvas').toDataURL() !== globalThis.dragCanvasBefore),100))`);
        refreshed ||= changed;
      }
      await call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, ...point(values.at(-1)) });
      assert(refreshed, `${id}: canvas did not refresh during native dragging`);
      await evaluate(`(async () => {
        const start=performance.now();
        while(document.getElementById('status').textContent!=='图纸已就绪'){
          if(performance.now()-start>10000)throw Error('Final slider result timed out');
          await new Promise(resolve=>setTimeout(resolve,20));
        }
      })()`);
      dragging.push({ slider: id, refreshedBeforeRelease: refreshed });
    }
    await evaluate('delete globalThis.dragCanvasBefore');
    const state = await evaluate(`(async () => {
      const $=id=>document.getElementById(id);
      $('beads-tab').click();
      const switched = $('preview-canvas').dataset.mode === 'beads';
      $('width-input').value=40; $('width-input').dispatchEvent(new Event('input'));
      const start = performance.now();
      while($('status').textContent!=='图纸已就绪'){
        if(performance.now()-start>10000)throw Error('Regeneration locked after download');
        await new Promise(resolve=>setTimeout(resolve,20));
      }
      return {switched,size:$('size-stat').textContent,disabled:$('export-chart').disabled,errorVisible:!$('error').hidden};
    })()`);
    assert(state.switched && !state.disabled && !state.errorVisible);
    assert.equal(state.size, '40 × 30');
    return { initial, dragging, state };
  });
  const files = [];
  for (const name of await downloaded) {
    const bytes = await readFile(join(directory, name));
    assert.equal(bytes.subarray(0,8).toString('hex'), '89504e470d0a1a0a');
    if (name.endsWith('-8bit.png')) {
      assert.equal(bytes[24], 8); assert.equal(bytes[25], 3);
      assert.equal(bytes.readUInt32BE(16), 32); assert.equal(bytes.readUInt32BE(20), 24);
    }
    files.push({ name, bytes: bytes.length });
  }
  console.log(JSON.stringify({ url, files, ui }, null, 2));
} finally { clearTimeout(timer); watcher?.close(); }
