// Runs entirely in a same-origin iframe. Uploads synthetic images, captures download
// blobs without saving files, and validates actual browser decoding and UI behavior.
import { drawBeads } from '../src/beads.ts';
import { drawGrid } from '../src/chart.ts';
const frame = document.getElementById('app');
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function until(condition, description) {
  const start = performance.now();
  while (!condition()) {
    if (performance.now() - start > 10000) throw new Error(`等待超时：${description}`);
    await new Promise(resolve => setTimeout(resolve, 30));
  }
}

async function check(name, operation) {
  const item = document.createElement('li');
  try { await operation(); item.className = 'pass'; item.textContent = `通过：${name}`; passed++; }
  catch (error) { item.className = 'fail'; item.textContent = `失败：${name} — ${error.message}`; failed++; }
  document.getElementById('results').append(item);
}

await until(() => frame.contentDocument?.getElementById('status')?.textContent === '图纸已就绪', '示例生成');
const win = frame.contentWindow;
const doc = frame.contentDocument;
const $ = id => doc.getElementById(id);
const downloads = [];
const urls = new Map();
const createUrl = win.URL.createObjectURL.bind(win.URL);
const anchorClick = win.HTMLAnchorElement.prototype.click;
win.URL.createObjectURL = blob => {
  const url = createUrl(blob);
  urls.set(url, blob);
  return url;
};
win.HTMLAnchorElement.prototype.click = function () {
  if (this.download) downloads.push({ name: this.download, blob: urls.get(this.href) });
  else anchorClick.call(this);
};

function input(id, value) {
  $(id).value = String(value);
  $(id).dispatchEvent(new win.Event('input', { bubbles: true }));
}

async function upload(name, blob) {
  const transfer = new win.DataTransfer();
  transfer.items.add(new win.File([blob], name, { type: blob.type }));
  $('file-input').files = transfer.files;
  $('file-input').dispatchEvent(new win.Event('change', { bubbles: true }));
  await until(() => $('file-name').textContent === name && $('status').textContent === '图纸已就绪', name);
}

const sample = doc.createElement('canvas');
sample.width = 320;sample.height = 160;
const ctx = sample.getContext('2d');
ctx.fillStyle = '#ff0000';ctx.fillRect(0, 0, 160, 160);
ctx.fillStyle = '#0000ff';ctx.fillRect(160, 0, 160, 80);
const blob = await new Promise(resolve => sample.toBlob(resolve));

await check('默认轮廓优先，示例图生成 32 × 24，最多 24 色，共 768 颗', async () => {
  assert(doc.title.startsWith('ニャンドゥ'), '显示名称不正确');
  assert(doc.querySelector('.brand-text strong').textContent === 'ニャンドゥ', '页头显示名称不正确');
  assert(doc.querySelector('.brand-text > span').textContent.includes('NyanDou'), '英文项目名称不正确');
  assert(doc.querySelector('.page-footer [lang="ja"]').textContent === 'ニャンドゥ', '页脚显示名称不正确');
  assert($('width-input').value === '32' && $('design-style').value === 'pixel', '默认设置错误');
  assert($('size-stat').textContent === '32 × 24', '示例尺寸错误');
  assert(Number.parseInt($('colors-stat').textContent) <= 24, '示例超过颜色上限');
  assert($('beads-stat').textContent === '768', '示例计数错误');
});

await check('连续切换预览、最大缩放和适应窗口不会撑宽页面', async () => {
  for (const width of [320, 390, 760, 768, 1440]) {
    frame.style.width = `${width}px`;
    await new Promise(resolve => setTimeout(resolve, 50));
    for (const mode of ['grid', 'beads', 'original', 'pixel', 'grid']) {
      $(mode + '-tab').click();
      input('zoom-input', 32);
      const viewport = $('canvas-viewport');
      const viewportWidth = viewport.getBoundingClientRect().width;
      assert(doc.documentElement.scrollWidth <= doc.documentElement.clientWidth,
        `${width}px / ${mode} / 32px: 页面宽 ${doc.documentElement.scrollWidth}，窗口宽 ${doc.documentElement.clientWidth}，预览宽 ${viewportWidth}`);
      for (let i = 0; i < 3; i++) {
        $('fit-button').click();
        assert(viewport.getBoundingClientRect().width === viewportWidth, '适应窗口改变了预览容器宽度');
        assert($('preview-canvas').getBoundingClientRect().width <= viewport.clientWidth, '适应窗口后图纸仍横向溢出');
      }
    }
  }
  frame.style.width = '100%';
});

await check('默认 MARD 色号与 CSV 一致，切换自动提取保留自由配色', async () => {
  assert($('color-card').value === 'mard221', '默认不是 MARD 色卡');
  assert($('colors-input').max === '221', 'MARD 颜色上限错误');
  const codes = [...doc.querySelectorAll('.palette-meta strong')].map(el => el.textContent);
  assert(codes.every(code => /^[A-HM]\d+$/.test(code)), '清单仍使用临时编号');
  $('export-csv').click();
  const text = await downloads.at(-1).blob.text();
  assert(text.startsWith('MARD色号,') && codes.every(code => text.includes(`\r\n${code},`)), 'MARD CSV 色号不一致');
  $('color-card').value = 'auto';
  $('color-card').dispatchEvent(new win.Event('change', { bubbles: true }));
  await until(() => $('status').textContent === '图纸已就绪', '自动提取模式');
  assert($('colors-input').max === '256', '自动提取颜色上限错误');
  $('design-style').value = 'faithful';
  $('design-style').dispatchEvent(new win.Event('change', { bubbles: true }));
  await until(() => $('status').textContent === '图纸已就绪', '原图优先模式');
});

await check('5 格浅线、10 格深线都绘制，浅线在小缩放下仍可见', async () => {
  const surface = doc.createElement('canvas'); surface.width = surface.height = 300;
  const ctx = surface.getContext('2d', { willReadFrequently: true });
  const chart = {width:16,height:16,palette:[[255,255,255]],indices:new Uint16Array(256)};
  drawGrid(ctx,chart,12);
  const dark = i => 255 - ctx.getImageData(28+i*12,34,1,1).data[0];
  assert(dark(10)>dark(5) && dark(5)>dark(1), '三种分割线深浅不正确');
  ctx.clearRect(0,0,300,300); drawGrid(ctx,chart,2);
  assert(ctx.getImageData(38,29,1,1).data[0]<255, '小缩放下缺少 5 格线');
});

await check('适应窗口随屏幕变窄和预览模式切换更新，手动缩放不被覆盖', async () => {
  frame.style.width = '1440px';
  await new Promise(resolve => setTimeout(resolve, 100));
  $('pixel-tab').click();
  $('fit-button').click();
  frame.style.width = '320px';
  await until(() => $('preview-canvas').getBoundingClientRect().width <= $('canvas-viewport').clientWidth,
    '窗口缩窄后重新适应图纸');
  $('grid-tab').click();
  assert($('preview-canvas').getBoundingClientRect().width <= $('canvas-viewport').clientWidth, '切到图纸后坐标边距导致溢出');
  assert(parseFloat(win.getComputedStyle($('color-card')).fontSize) >= 16, '手机下拉框小于 16px，存在 iOS 自动放大风险');
  input('zoom-input', 20);
  $('beads-tab').click();
  assert($('zoom-input').value === '20', '切换模式覆盖手动缩放');
  frame.style.width = '390px';
  await new Promise(resolve => setTimeout(resolve, 100));
  assert($('zoom-input').value === '20', '窗口变化覆盖手动缩放');
  frame.style.width = '100%';
  $('grid-tab').click();
  $('fit-button').click();
});

await check('樱花装饰正常解码，不拦截点击；橙色像素猫保持不变', async () => {
  const blossoms = [...doc.querySelectorAll('.sakura-bouquet img, .page-footer img:last-child')];
  assert(blossoms.length >= 3, '缺少樱花装饰');
  for (const image of blossoms) await image.decode();
  assert(blossoms.every(image => image.naturalWidth === 64), '樱花 SVG 解码失败');
  assert(win.getComputedStyle(doc.querySelector('.sakura-bouquet')).pointerEvents === 'none', '装饰拦截点击');
  const cat = await (await win.fetch(doc.querySelector('.brand-mark img').src)).text();
  assert(cat.includes('#d3844f'), '橙色像素猫被改变');
});

await check('真实上传路径：保留透明区域，16 × 8，96 颗，2 色', async () => {
  input('width-input', 16);input('colors-input', 2);
  await upload('测试红蓝透明.png', blob);
  assert($('size-stat').textContent === '16 × 8', '上传尺寸错误');
  assert($('colors-stat').textContent === '2 色', '上传颜色错误');
  assert($('beads-stat').textContent === '96', '透明区域不应计数');
  await until(() => $('source-thumbnail').complete, '上传缩略图');
  assert($('source-thumbnail').naturalWidth > 0, '上传缩略图不可见');
  const counts = [...doc.querySelectorAll('.palette-number')].map(el => el.textContent);
  assert(counts.join(',') === '64 颗,32 颗', '用豆清单错误');
});

await check('原图 / 像素 / 网格切换，缩放和颜色编号', async () => {
  $('original-tab').click();
  assert($('original-tab').getAttribute('aria-pressed') === 'true', '原图未选中');
  assert($('symbols-input').disabled, '原图模式应禁用编号');
  $('pixel-tab').click();
  assert($('pixel-tab').getAttribute('aria-pressed') === 'true', '像素未选中');
  $('grid-tab').click();input('zoom-input', 12);
  assert($('preview-canvas').width === 16 * 12 + 56, '网格缩放错误');
  assert(!$('symbols-input').disabled, '网格编号不可用');
  $('fit-button').click();
});

await check('像素预览为实色方格，圆豆预览有真实透明珠孔和间隙', async () => {
  input('zoom-input', 16);
  $('pixel-tab').click();
  let preview = $('preview-canvas');
  let rgba = preview.getContext('2d').getImageData(8, 8, 1, 1).data;
  assert(rgba[0] === 255 && rgba[1] === 0 && rgba[2] === 0 && rgba[3] === 255, '像素方格不正确');
  $('beads-tab').click();
  assert(!$('bead-settings').hidden && $('symbols-input').disabled, '拼豆控制没有显示');
  assert($('beads-tab').getAttribute('aria-pressed') === 'true', '拼豆模式未选中');
  preview = $('preview-canvas');
  const scale = preview.width / (16 * 16);
  const point = (x, y) => preview.getContext('2d').getImageData(Math.floor(x * scale), Math.floor(y * scale), 1, 1).data;
  assert(point(8, 8)[3] === 0, '圆豆珠孔不透明');
  rgba = point(12, 8);
  assert(rgba[0] > 180 && rgba[1] < 90 && rgba[2] < 90 && rgba[3] > 240, '圆豆位置或颜色错误');
  assert(point(16, 8)[3] < 80, '圆豆之间缺少间隙');
  assert(point(15 * 16 + 8, 7 * 16 + 8)[3] === 0, '空格被渲染成珠子');
});

await check('熨烫后只连接相邻珠子，珠孔变小，颜色与颗数不改变', async () => {
  const before = $('palette-list').textContent;
  $('bead-fused').click();
  assert($('bead-fused').getAttribute('aria-pressed') === 'true', '成品状态未选中');
  const preview = $('preview-canvas');
  const scale = preview.width / (16 * 16);
  const point = (x, y) => preview.getContext('2d').getImageData(Math.floor(x * scale), Math.floor(y * scale), 1, 1).data;
  assert(point(8, 8)[3] < 20, '成品珠孔消失');
  assert(point(10, 8)[3] > 240, '成品珠孔没有变小');
  assert(point(16, 8)[3] > 240, '相邻珠子没有连接');
  assert(point(15 * 16 + 8, 7 * 16 + 8)[3] === 0, '成品连接越过空格');
  assert($('palette-list').textContent === before && $('beads-stat').textContent === '96', '渲染改变了图纸数据');
  $('grid-tab').click();
  assert($('bead-settings').hidden, '离开拼豆模式仍显示状态选择');
});

await check('渲染实验：160 × 160 格正常绘制，两种状态不修改原始索引', async () => {
  const chart = { width: 160, height: 160, palette: [[230, 80, 120], [50, 90, 180]], indices: new Uint16Array(25600) };
  for (let i = 0; i < chart.indices.length; i++) chart.indices[i] = i % 11 === 0 ? 65535 : i % 2;
  const original = chart.indices.slice();
  const surface = doc.createElement('canvas');surface.width = surface.height = 640;
  for (const state of ['round', 'fused']) {
    surface.getContext('2d').clearRect(0, 0, 640, 640);
    const start = performance.now();
    drawBeads(surface.getContext('2d'), chart, 4, state);
    console.info(`bead render ${state}: ${Math.round(performance.now() - start)} ms`);
    assert(chart.indices.every((value, i) => value === original[i]), '渲染修改了索引');
    const alpha = surface.getContext('2d').getImageData(0, 0, 640, 640).data;
    assert(alpha.some((value, i) => i % 4 === 3 && value > 0), '渲染没有绘制任何珠子');
  }
});

await check('导出的 PNG 确为 8bit 索引色，浏览器可解码，透明像素正确', async () => {
  $('beads-tab').click();
  const before = downloads.length;
  $('export-pixel').click();
  await until(() => downloads.length > before, '索引 PNG 下载');
  const downloaded = downloads.at(-1);
  assert(downloaded.name.endsWith('-8bit.png'), '文件名错误');
  const data = new Uint8Array(await downloaded.blob.arrayBuffer());
  assert(data[24] === 8 && data[25] === 3, '不是 8bit 索引色');
  const bitmap = await createImageBitmap(downloaded.blob);
  assert(bitmap.width === 16 && bitmap.height === 8, 'PNG 尺寸错误');
  const decoded = doc.createElement('canvas');decoded.width = 16;decoded.height = 8;
  const context = decoded.getContext('2d');context.drawImage(bitmap, 0, 0);
  const rgba = context.getImageData(0, 0, 16, 8).data;
  assert(rgba[0] === 255 && rgba[1] === 0 && rgba[2] === 0 && rgba[3] === 255, '红色像素错误');
  assert(rgba[(7 * 16 + 15) * 4 + 3] === 0, '透明像素错误');
  bitmap.close();
});

await check('PNG 图纸导出可解码；CSV 包含中文 BOM、编号、RGB 和颗数', async () => {
  const before = downloads.length;
  $('export-chart').click();
  await until(() => downloads.length > before, '图纸下载');
  const bitmap = await createImageBitmap(downloads.at(-1).blob);
  assert(bitmap.width >= 720 && bitmap.height > 8 * 26, '图纸或清单不完整');
  bitmap.close();
  $('export-csv').click();
  const csv = downloads.at(-1);
  const bytes = new Uint8Array(await csv.blob.arrayBuffer());
  assert(bytes.slice(0, 3).join(',') === '239,187,191', '缺少 UTF-8 BOM');
  const text = await csv.blob.text();
  assert(text.includes('001,#FF0000,255,0,0,64'), 'CSV 红色计数错误');
  assert(text.includes('002,#0000FF,0,0,255,32'), 'CSV 蓝色计数错误');
});

await check('快速调整设置时禁用过期导出，最后一次设置生效', async () => {
  $('beads-tab').click();$('bead-fused').click();
  input('width-input', 80);input('width-input', 32);
  assert($('export-chart').disabled, '生成期间导出未禁用');
  await until(() => $('status').textContent === '图纸已就绪', '快速调整');
  assert($('size-stat').textContent === '32 × 16', '旧设置覆盖最新设置');
  assert($('beads-stat').textContent === '384', '重新生成计数错误');
  const preview = $('preview-canvas');
  assert(preview.dataset.mode === 'beads' && parseFloat(preview.style.width) === 32 * Number($('zoom-input').value), '拼豆预览没有跟随尺寸更新');
  assert($('bead-fused').getAttribute('aria-pressed') === 'true', '重新生成丢失熨烫状态');
  $('grid-tab').click();
});

await check('全透明图片生成零颗豆，并导出有效透明 PNG', async () => {
  const blank = doc.createElement('canvas');blank.width = 100;blank.height = 100;
  await upload('全透明.png', await new Promise(resolve => blank.toBlob(resolve)));
  assert($('beads-stat').textContent === '0', '全透明被计为豆子');
  assert($('colors-stat').textContent === '0 色', '全透明有配色');
  const before = downloads.length;$('export-pixel').click();
  await until(() => downloads.length > before, '透明 PNG');
  const bitmap = await createImageBitmap(downloads.at(-1).blob);
  assert(bitmap.width === 32 && bitmap.height === 32, '透明 PNG 尺寸错误');bitmap.close();
});

await check('全透明图片在熨烫前后都不产生虚假珠子', async () => {
  $('beads-tab').click();
  for (const state of ['round', 'fused']) {
    $('bead-' + state).click();
    const preview = $('preview-canvas');
    const rgba = preview.getContext('2d').getImageData(0, 0, preview.width, preview.height).data;
    assert(!rgba.some((value, i) => i % 4 === 3 && value), '透明图被渲染成珠子');
  }
  $('grid-tab').click();
});

await check('无效图片显示错误，保留上一份图纸', async () => {
  const transfer = new win.DataTransfer();
  transfer.items.add(new win.File(['not an image'], '损坏.png', { type: 'image/png' }));
  $('file-input').files = transfer.files;
  $('file-input').dispatchEvent(new win.Event('change', { bubbles: true }));
  await until(() => !$('error').hidden, '错误提示');
  assert($('error').textContent.includes('无法读取'), '没有文件解码错误');
  assert($('beads-stat').textContent === '0', '上一份图纸丢失');
});

await check('320px / 390px / 768px：页面无横向溢出，适应窗口可显示完整图纸', async () => {
  for (const width of [320, 390, 768]) {
    frame.style.width = `${width}px`;
    await new Promise(resolve => setTimeout(resolve, 50));
    $('fit-button').click();
    assert(doc.documentElement.scrollWidth <= doc.documentElement.clientWidth, `${width}px 页面横向溢出`);
    assert($('preview-canvas').width <= $('canvas-viewport').clientWidth, `${width}px 图纸仍溢出`);
    $('beads-tab').click();$('fit-button').click();
    assert(doc.documentElement.scrollWidth <= doc.documentElement.clientWidth, `${width}px 拼豆控件横向溢出`);
    assert($('preview-canvas').getBoundingClientRect().width <= $('canvas-viewport').clientWidth, `${width}px 拼豆预览仍溢出`);
    $('grid-tab').click();
  }
  frame.style.width = '100%';
});

await check('大图导出不阻塞点击，重复点击只导出一次，完成后可继续生成', async () => {
  const image = doc.createElement('canvas'); image.width=image.height=640;
  const ctx=image.getContext('2d'); ctx.fillStyle='#ffccc8'; ctx.fillRect(0,0,640,640);
  ctx.fillStyle='#293847'; ctx.beginPath(); ctx.arc(320,320,180,0,Math.PI*2);ctx.fill();
  input('width-input',160);
  await upload('导出压力测试.png',await new Promise(resolve=>image.toBlob(resolve)));
  const before=downloads.length;
  const start=performance.now(); $('export-chart').click();
  const blocked=performance.now()-start;
  assert(blocked<80, `导出点击同步阻塞 ${Math.round(blocked)}ms`);
  assert($('export-chart').disabled && $('export-chart').getAttribute('aria-busy')==='true', '未隔离导出状态');
  $('export-chart').click();
  $('pixel-tab').click();
  assert($('preview-canvas').dataset.mode==='pixel', '导出中无法切换预览');
  await until(()=>downloads.length>before,'大图下载');
  await until(()=>!$('export-chart').disabled,'导出状态恢复');
  assert(downloads.length===before+1,'重复导出触发多次下载');
  const bitmap=await createImageBitmap(downloads.at(-1).blob);
  assert(bitmap.width*bitmap.height<=8_000_000,'导出画布超出内存预算'); bitmap.close();
  input('width-input',32);
  await until(()=>$('status').textContent==='图纸已就绪','下载后继续生成');
  assert($('size-stat').textContent==='32 × 32' && !$('export-pixel').disabled,'下载后页面仍被锁定');
});

await check('导出失败恢复按钮，下一次导出可成功，不锁死页面', async () => {
  const NativeWorker=win.Worker;
  try {
    win.Worker=class {
      constructor(url,options) {
        if (!String(url).includes('export-worker')) return new NativeWorker(url,options);
      }
      postMessage() { setTimeout(()=>this.onerror?.(),0); }
      terminate() {}
    };
    $('export-chart').click();
    await until(()=>!$('export-chart').disabled,'导出错误恢复');
    assert(!$('error').hidden && $('export-status').textContent.includes('失败'),'没有导出错误提示');
  } finally { win.Worker=NativeWorker; }
  const before=downloads.length; $('export-chart').click();
  await until(()=>downloads.length>before,'导出重试');
  assert(!$('export-chart').disabled && $('error').hidden,'重试未恢复正常状态');
});

await check('无 OffscreenCanvas 时分批导出，完成后画布释放且页面可继续操作', async () => {
  const OriginalCanvas=win.OffscreenCanvas;
  const create=doc.createElement.bind(doc);
  const buffers=[];
  try {
    win.OffscreenCanvas=undefined;
    doc.createElement=(name,...args)=> {
      const element=create(name,...args);
      if(name==='canvas') buffers.push(element);
      return element;
    };
    const before=downloads.length; $('export-chart').click();
    assert($('export-chart').disabled,'回退导出未设置状态');
    $('grid-tab').click();
    await until(()=>downloads.length>before,'回退图纸下载');
    assert(buffers.some(c=>c.width===1 && c.height===1),'回退图纸画布未释放');
    assert(!$('export-chart').disabled && !$('export-csv').disabled,'回退导出后按钮仍禁用');
  } finally { win.OffscreenCanvas=OriginalCanvas; doc.createElement=create; }
});

await check('导出期间换图片，下载仍使用点击时的尺寸与文件名，新图纸可继续用', async () => {
  const NativeWorker=win.Worker;
  const originalName=$('file-name').textContent.replace(/\.[^.]+$/,'');
  const originalSize=Number.parseInt($('size-stat').textContent);
  try {
    win.Worker=class {
      constructor(url,options) {
        if (!String(url).includes('export-worker')) return new NativeWorker(url,options);
        this.worker=new NativeWorker(url,options);
        this.worker.onmessage=event=>setTimeout(()=>this.onmessage?.(event),300);
        this.worker.onerror=event=>this.onerror?.(event);
      }
      postMessage(data) { this.worker.postMessage(data); }
      terminate() { this.worker.terminate(); }
    };
    const before=downloads.length; $('export-chart').click();
    input('width-input',16);
    await upload('导出期间新图.png',blob);
    await until(()=>downloads.length>before,'旧图快照下载');
    assert(downloads.at(-1).name===originalName+'-拼豆图纸.png','导出文件名混用了新图片');
    const bitmap=await createImageBitmap(downloads.at(-1).blob);
    assert(bitmap.width===Math.max(720,originalSize*26+88),'导出尺寸混用了新图纸');bitmap.close();
    assert($('size-stat').textContent==='16 × 8' && !$('export-chart').disabled,'下载覆盖或锁定了新图纸');
  } finally { win.Worker=NativeWorker; }
});

await check('生成启动异常不会卡在忙碌状态，恢复环境后可重新生成和导出', async () => {
  const NativeWorker=win.Worker;
  try {
    win.Worker=class {constructor(){throw new Error('测试：Worker 启动失败');}};
    input('width-input',32);
    await until(()=>$('status').textContent==='生成失败','生成启动错误');
    assert($('canvas-viewport').getAttribute('aria-busy')==='false','生成异常仍卡在忙碌状态');
    assert(!$('error').hidden,'启动失败未提示');
  } finally { win.Worker=NativeWorker; }
  input('width-input',32);
  await until(()=>$('status').textContent==='图纸已就绪','生成异常后重试');
  assert(!$('export-chart').disabled,'重试后导出仍禁用');
});

await check('像素预览重复缩放复用图像数据，新图纸会刷新缓存', async () => {
  const create = doc.createElement.bind(doc);
  let buffers = 0;
  try {
    doc.createElement = (name, ...args) => {
      const element = create(name, ...args);
      if (name === 'canvas') buffers++;
      return element;
    };
    $('pixel-tab').click();
    const first = buffers;
    for (let i = 0; i < 10; i++) input('zoom-input', 12 + i);
    assert(buffers === first, '每次缩放仍重新建立像素缓存');
    input('width-input', 16);
    await until(() => $('status').textContent === '图纸已就绪', '缓存刷新');
    assert(buffers >= first + 2, '新图纸未创建新采样和像素缓存');
  } finally { doc.createElement = create; }
});

await check('最大预览缩放限制画布为 800 万像素，显示尺寸不改变', async () => {
  const square = doc.createElement('canvas'); square.width = square.height = 200;
  square.getContext('2d').fillRect(0, 0, 200, 200);
  input('width-input', 160);
  await upload('预览内存测试.png', await new Promise(resolve => square.toBlob(resolve)));
  for (const mode of ['pixel', 'grid', 'beads', 'original']) {
    $(mode + '-tab').click(); input('zoom-input', 32);
    const preview = $('preview-canvas');
    assert(preview.width * preview.height <= 8_000_000, `${mode} 预览超出内存预算`);
    assert(preview.style.width === `${5120 + (mode === 'grid' ? 56 : 0)}px`, '预览显示尺寸改变');
  }
  input('width-input', 32);
  await until(() => $('status').textContent === '图纸已就绪', '恢复默认豆数');
  $('grid-tab').click(); $('fit-button').click();
});

await check('读取新图片期间改设置不会生成或导出旧图片', async () => {
  const decode = win.createImageBitmap;
  let complete;
  try {
    win.createImageBitmap = file => new Promise(resolve => { complete = async () => resolve(await decode(file)); });
    const transfer = new win.DataTransfer();
    transfer.items.add(new win.File([blob], '延迟解码.png', { type: blob.type }));
    $('file-input').files = transfer.files;
    $('file-input').dispatchEvent(new win.Event('change', { bubbles: true }));
    input('width-input', 16);
    await new Promise(resolve => setTimeout(resolve, 220));
    assert($('status').textContent === '正在读取图片…' && $('export-chart').disabled, '新图片未解码就生成了旧图片');
    await complete();
    await until(() => $('file-name').textContent === '延迟解码.png' && $('status').textContent === '图纸已就绪', '延迟解码生成');
    assert($('size-stat').textContent === '16 × 8', '读取期间修改的设置未应用');
  } finally { win.createImageBitmap = decode; }
});

await check('生成超时恢复忙碌状态并禁用过期导出，下一次生成可恢复', async () => {
  const NativeWorker = win.Worker;
  const timer = win.setTimeout;
  try {
    win.Worker = class { postMessage() {} terminate() {} };
    win.setTimeout = (fn, delay, ...args) => timer(fn, delay === 45000 ? 1 : delay, ...args);
    input('width-input', 32);
    await until(() => $('status').textContent === '生成失败', '生成超时');
    assert($('error-message').textContent.includes('超时'), '未提示生成超时');
    assert($('canvas-viewport').getAttribute('aria-busy') === 'false' && $('export-chart').disabled, '超时状态未恢复或可导出过期数据');
  } finally { win.Worker = NativeWorker; win.setTimeout = timer; }
  input('width-input', 32);
  await until(() => $('status').textContent === '图纸已就绪', '超时后重试');
  assert(!$('export-chart').disabled, '超时重试后仍禁用导出');
});

await check('键盘入口、语音缩放值、手机点击区域和可关闭错误提示可用', async () => {
  assert(doc.querySelector('.skip-link').getAttribute('href') === '#workspace', '缺少跳过导航入口');
  assert($('canvas-viewport').tabIndex === 0, '画布不可键盘滚动');
  assert($('width-input').getAttribute('aria-valuetext') === '32 颗', '豆数缺少易读值');
  frame.style.width = '390px';
  await new Promise(resolve => setTimeout(resolve, 50));
  for (const id of ['grid-tab', 'fit-button', 'demo-button']) {
    assert($(id).getBoundingClientRect().height >= 44, `${id} 手机点击区域过小`);
  }
  $('error').hidden = false; $('error-message').textContent = '测试错误';
  $('error-dismiss').click(); assert($('error').hidden, '关闭错误按钮无效');
  $('error').hidden = false;
  win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape' }));
  assert($('error').hidden, 'Escape 未关闭错误提示');
  frame.style.width = '100%';
});

await check('连续拖动豆数和颜色时画布随生成结果更新，不需停止拖动或切换模式', async () => {
  $('demo-button').click();
  await until(() => $('status').textContent === '图纸已就绪', '拖动测试示例');
  for (const mode of ['grid', 'pixel', 'beads']) {
    $(mode + '-tab').click();
    for (const [id, values] of [
      ['width-input', Array.from({ length: 12 }, (_, i) => 40 + i)],
      ['colors-input', Array.from({ length: 12 }, (_, i) => 2 + i)],
    ]) {
      const before = $('preview-canvas').toDataURL();
      let updatedDuringDrag = false;
      for (const value of values) {
        input(id, value);
        assert($('export-chart').disabled, '拖动期间可导出过期图纸');
        await new Promise(resolve => setTimeout(resolve, 60));
        updatedDuringDrag ||= $('preview-canvas').toDataURL() !== before;
        assert($('preview-canvas').dataset.mode === mode, '测试意外切换了模式');
      }
      await until(() => $('status').textContent === '图纸已就绪', '拖动最后结果');
      assert(updatedDuringDrag, `${mode} / ${id} 连续拖动期间一直没有更新`);
      if (id === 'width-input') assert($('size-stat').textContent === '51 × 38', '没有采用最后豆数');
      else assert(Number.parseInt($('colors-stat').textContent) <= 13, '没有采用最后颜色上限');
    }
    input('width-input', 32); input('colors-input', 24);
    await until(() => $('status').textContent === '图纸已就绪', '恢复拖动测试设置');
  }
  $('grid-tab').click();
});

await check('慢 Worker 不因连续拖动而反复终止，生成后自动处理最新设置', async () => {
  const NativeWorker = win.Worker;
  let cancelled = 0;
  let delivered = 0;
  let pending = 0;
  let peak = 0;
  try {
    win.Worker = class {
      constructor(url, options) {
        this.worker = new NativeWorker(url, options);
        this.active = true; pending++; peak = Math.max(peak, pending);
        this.worker.onmessage = event => {
          this.timer = setTimeout(() => {
            if (!this.active) return;
            this.delivered = true; delivered++;
            this.onmessage?.(event);
          }, 220);
        };
        this.worker.onerror = event => this.onerror?.(event);
      }
      postMessage(...args) { this.worker.postMessage(...args); }
      terminate() {
        if (!this.active) return;
        if (!this.delivered) cancelled++;
        this.active = false; pending--;
        clearTimeout(this.timer); this.worker.terminate();
      }
    };
    const before = $('preview-canvas').toDataURL();
    let updated = false;
    for (let value = 33; value <= 48; value++) {
      input('width-input', value);
      await new Promise(resolve => setTimeout(resolve, 50));
      updated ||= $('preview-canvas').toDataURL() !== before;
    }
    await until(() => $('status').textContent === '图纸已就绪', '慢 Worker 最新设置');
    assert(updated && delivered >= 2, '慢生成期间没有更新预览');
    assert(cancelled === 0 && peak === 1, '拖动反复终止生成或启动了并行 Worker');
    assert($('size-stat').textContent === '48 × 36' && !$('export-chart').disabled, '慢生成未采用最后设置');
  } finally { win.Worker = NativeWorker; }
  input('width-input', 32);
  await until(() => $('status').textContent === '图纸已就绪', '恢复默认豆数');
});

win.URL.createObjectURL = createUrl;
win.HTMLAnchorElement.prototype.click = anchorClick;
for (const url of urls.keys()) win.URL.revokeObjectURL(url);
$('width-input').value=32;
$('colors-input').value=24;
$('color-card').value='mard221';
$('design-style').value='pixel';
$('demo-button').click();
document.getElementById('summary').textContent = `完成：${passed} 项通过，${failed} 项失败。`;
document.title = failed ? 'ニャンドゥ · 测试失败' : 'ニャンドゥ · 集成测试通过';
