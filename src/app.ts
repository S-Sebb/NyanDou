import { drawGrid } from './chart.ts';
import { exportPng } from './export.ts';
import { drawBeads } from './beads.ts';
import type { RGB, Chart, PreviewMode, BeadState, DesignStyle, QuantizeRequest, QuantizeResponse, ExportFormat } from './types.ts';

type Elements = Record<'status' | 'error' | 'error-message' | 'canvas-viewport' | 'export-status' | 'colors-max' | 'color-note' | 'width-value' | 'colors-value' | 'size-stat' | 'colors-stat' | 'beads-stat' | 'palette-count' | 'color-card-stat' | 'palette-label' | 'palette-disclaimer' | 'bead-settings' | 'preview-hint' | 'zoom-value' | 'palette-list' | 'file-name' | 'dropzone', HTMLElement>
  & Record<'file-input' | 'width-input' | 'colors-input' | 'zoom-input' | 'symbols-input', HTMLInputElement>
  & Record<'color-card' | 'design-style', HTMLSelectElement>
  & Record<'export-chart' | 'export-pixel' | 'export-csv' | 'full-colors' | 'demo-button' | 'fit-button' | 'error-dismiss' | `${PreviewMode}-tab` | `bead-${BeadState}`, HTMLButtonElement>
  & { 'preview-canvas': HTMLCanvasElement; 'source-thumbnail': HTMLImageElement };
function $<K extends keyof Elements>(id: K): Elements[K] {
  const element = document.getElementById(id);
  if (!element) throw new Error(`缺少页面元素：${id}`);
  return element as Elements[K];
}
const canvas = $('preview-canvas');
const controls = ['export-chart', 'export-pixel', 'export-csv'] as const;
const modes = ['grid', 'pixel', 'beads', 'original'] as const;
let source: HTMLCanvasElement | ImageBitmap | null = null;
let result: Chart | null = null;
let worker: Worker | null = null;
let mode: PreviewMode = 'grid';
let beadState: BeadState = 'round';
let imageVersion = 0;
let generationTimer: ReturnType<typeof setTimeout> | undefined;
let generationQueued = false;
let generationTimeout: ReturnType<typeof setTimeout> | undefined;
let baseName = '日落山谷';
let busy = true;
let generationFailed = false;
let fitted = true;
let exporting = false;
let readingImage = false;
let cachedPixel: HTMLCanvasElement | null = null;

const hex = (rgb: RGB) => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
const label = (index: number, chart = result) => chart?.codes?.[index] ?? String(index + 1).padStart(3, '0');
const number = (value: number) => value.toLocaleString('zh-CN');
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

function showError(message: string) {
  $('error-message').textContent = message;
  $('error').hidden = false;
}

function setBusy(value: boolean) {
  busy = value;
  if (value) generationFailed = false;
  syncExports();
  $('status').textContent = value ? '正在生成…' : '图纸已就绪';
  $('canvas-viewport').setAttribute('aria-busy', String(value));
}

function syncExports() {
  controls.forEach(id => { $(id).disabled = busy || exporting || generationFailed || !result; });
  $('export-chart').querySelector('span')!.textContent = exporting ? '正在导出…' : '下载拼豆图纸';
  $('export-chart').setAttribute('aria-busy', String(exporting));
}

function syncControls() {
  const mard = $('color-card').value === 'mard221';
  const limit = mard ? 221 : 256;
  $('colors-input').max = String(limit);
  if (Number($('colors-input').value) > limit) $('colors-input').value = String(limit);
  $('colors-max').textContent = `${limit} · ${mard ? '全色' : '丰富'}`;
  $('full-colors').dataset.colors = String(limit);
  $('full-colors').textContent = `${limit} 色`;
  $('color-note').textContent = mard
    ? '匹配 MARD 标准 221 色。颜色更少，拼起来更轻松。'
    : '自动提取参考配色，不对应实物色号。颜色更少，拼起来更轻松。';
  $('width-value').textContent = `${$('width-input').value} 颗`;
  $('colors-value').textContent = `${$('colors-input').value} 色`;
  $('width-input').setAttribute('aria-valuetext', $('width-value').textContent!);
  $('colors-input').setAttribute('aria-valuetext', $('colors-value').textContent!);
  document.querySelectorAll<HTMLButtonElement>('[data-colors]').forEach(button => {
    const active = button.dataset.colors === $('colors-input').value;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function updateThumbnail() {
  if (!source) return;
  const thumbnail = document.createElement('canvas');
  thumbnail.width = 108;
  thumbnail.height = Math.max(1, Math.round(108 * source.height / source.width));
  // Limit the thumbnail buffer for unusually tall images.
  if (thumbnail.height > 108) {
    thumbnail.height = 108;
    thumbnail.width = Math.max(1, Math.round(108 * source.width / source.height));
  }
  thumbnail.getContext('2d')!.drawImage(source, 0, 0, thumbnail.width, thumbnail.height);
  $('source-thumbnail').src = thumbnail.toDataURL('image/png');
}

function cancelGeneration() {
  worker?.terminate();
  worker = null;
  clearTimeout(generationTimeout);
}

function clearPendingGeneration() {
  clearTimeout(generationTimer);
  generationTimer = undefined;
  generationQueued = false;
}

function failGeneration(message: string) {
  cancelGeneration();
  clearPendingGeneration();
  generationFailed = true;
  setBusy(false);
  $('status').textContent = '生成失败';
  showError(message);
}

function closeSource() {
  if (source && 'close' in source) source.close();
}

function generate() {
  if (!source) return;
  clearPendingGeneration();
  cancelGeneration();
  setBusy(true);
  $('error').hidden = true;
  try {
    generateImage();
  } catch (error) {
    failGeneration(`无法生成图纸：${errorText(error)}`);
  }
}

function generateImage() {
  if (!source) return;
  const requestedWidth = Number($('width-input').value);
  const width = Math.min(requestedWidth, Math.max(1, Math.round(160 * source.width / source.height)));
  const height = Math.min(160, Math.max(1, Math.round(width * source.height / source.width)));
  const sample = document.createElement('canvas');
  const designStyle: DesignStyle = $('design-style').value === 'faithful' ? 'faithful' : 'pixel';
  const sampling = designStyle === 'pixel' ? 4 : 1;
  sample.width = width * sampling;
  sample.height = height * sampling;
  const context = sample.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('浏览器无法创建图片处理画布。');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, sample.width, sample.height);
  const rgba = context.getImageData(0, 0, sample.width, sample.height).data;
  sample.width = sample.height = 1;
  const currentWorker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker = currentWorker;
  generationTimeout = setTimeout(() => {
    if (worker === currentWorker) failGeneration('生成超时，请减少豆数或换一张图片后重试。');
  }, 45000);
  currentWorker.onmessage = ({ data }: MessageEvent<QuantizeResponse>) => {
    if (worker !== currentWorker) return;
    cancelGeneration();
    if ('error' in data) {
      failGeneration(data.error);
      return;
    }
    const resized = !result || result.width !== data.result.width || result.height !== data.result.height;
    result = data.result;
    if (cachedPixel) cachedPixel.width = cachedPixel.height = 1;
    cachedPixel = null;
    $('size-stat').textContent = `${result.width} × ${result.height}`;
    $('colors-stat').textContent = `${result.palette.length} 色`;
    $('beads-stat').textContent = number(result.width * result.height - result.empty);
    $('palette-count').textContent = String(result.palette.length);
    $('color-card-stat').textContent = result.codes ? 'MARD 221' : '自动提取';
    $('palette-label').textContent = result.codes ? 'MARD 色号 · HEX · 颗数' : '图纸编号 · HEX · 颗数';
    $('palette-disclaimer').textContent = result.codes
      ? 'MARD 标准 221 色 · 屏幕参考色，购买前请核对店家实物色卡。'
      : '自动提取的配色不是品牌色号，购买前请核对实物色卡。';
    renderPalette();
    if (resized) fitPreview();
    else renderPreview();
    // Paint completed results during a drag, then process the latest settings.
    // Keep exports disabled until the final requested result is ready.
    if (generationQueued) scheduleGenerate();
    else setBusy(false);
  };
  currentWorker.onerror = () => {
    if (worker !== currentWorker) return;
    failGeneration('无法生成图纸。请使用支持 Web Worker 的现代浏览器，或刷新后重试。');
  };
  currentWorker.postMessage({ rgba, width, height, designStyle, maxColors: Number($('colors-input').value), paletteMode: $('color-card').value === 'auto' ? 'auto' : 'mard221' } satisfies QuantizeRequest, [rgba.buffer]);
}

function scheduleGenerate() {
  syncControls();
  // Apply edits to the new image after decoding, not to the previous source.
  if (readingImage) return;
  generationQueued = true;
  setBusy(true);
  // Coalesce changes in a fixed window instead of waiting for dragging to stop.
  // Never cancel an active Worker for another slider event: slow devices must
  // be able to finish, paint, and then pick up the newest values.
  if (worker || generationTimer !== undefined) return;
  generationTimer = setTimeout(generate, 60);
}

function pixelCanvas(chart: Chart) {
  if (cachedPixel) return cachedPixel;
  const pixel = document.createElement('canvas');
  pixel.width = chart.width;
  pixel.height = chart.height;
  const context = pixel.getContext('2d')!;
  const image = context.createImageData(chart.width, chart.height);
  for (let i = 0; i < chart.indices.length; i++) {
    const index = chart.indices[i];
    if (index === 65535) continue;
    image.data.set([...chart.palette[index], 255], i * 4);
  }
  context.putImageData(image, 0, 0);
  cachedPixel = pixel;
  return cachedPixel;
}

function renderPreview() {
  if (!result) return;
  const cell = Number($('zoom-input').value);
  $('zoom-value').textContent = `${cell}px`;
  $('zoom-input').setAttribute('aria-valuetext', `${cell} 像素每格`);
  const margin = mode === 'grid' ? 28 : 0;
  const width = result.width * cell + margin * 2;
  const height = result.height * cell + margin * 2;
  // Smooth small bead contours without creating unbounded high-DPI buffers.
  const desiredScale = mode === 'beads' && Math.max(width, height) <= 2048 ? 2 : 1;
  const scale = Math.min(desiredScale, Math.sqrt(8_000_000 / (width * height)));
  canvas.width = Math.floor(width * scale);
  canvas.height = Math.floor(height * scale);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.dataset.mode = mode;
  canvas.setAttribute('aria-label', { grid: '带编号拼豆图纸', pixel: '像素效果预览', beads: beadState === 'round' ? '熨烫前拼豆效果预览' : '熨烫后拼豆效果预览', original: '原始图片对照' }[mode]);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法创建预览画布。');
  context.scale(scale, scale);
  if (mode === 'grid') {
    context.fillStyle = '#fdfdf9';
    context.fillRect(0, 0, width, height);
    drawGrid(context, result, cell, margin, margin, $('symbols-input').checked);
  } else if (mode === 'beads') {
    drawBeads(context, result, cell, beadState);
  } else {
    context.imageSmoothingEnabled = mode === 'original';
    if (mode === 'original' && source) context.drawImage(source, 0, 0, width, height);
    else context.drawImage(pixelCanvas(result), 0, 0, width, height);
  }
  $('bead-settings').hidden = mode !== 'beads';
  $('symbols-input').disabled = mode !== 'grid';
  $('preview-hint').textContent = mode === 'grid'
    ? (cell < 12 && $('symbols-input').checked ? '编号需 12px · 10 格深线 / 5 格浅线' : '10 格深线 / 5 格浅线 · 透明区域留空')
    : (mode === 'beads' ? '一格一颗豆 · 放大查看珠孔和连接处' : mode === 'pixel' ? '一像素一颗豆 · 无抖动杂色' : '原图对照 · 图片只在本机处理');
}

function fitPreview() {
  if (!result) return;
  fitted = true;
  const viewport = $('canvas-viewport');
  const margin = mode === 'grid' ? 56 : 0;
  $('zoom-input').value = String(Math.max(1, Math.min(32, Math.floor(Math.min((viewport.clientWidth - margin - 8) / result.width, (viewport.clientHeight - margin - 8) / result.height)))));
  renderPreview();
  viewport.scrollTop = 0;
  viewport.scrollLeft = 0;
}

function renderPalette() {
  const chart = result;
  if (!chart) return;
  $('palette-list').replaceChildren();
  if (!chart.palette.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-palette';
    empty.textContent = '图片完全透明，没有需要拼放的豆子。';
    $('palette-list').append(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  chart.palette.forEach((rgb, index) => {
    const item = document.createElement('div');
    item.className = 'palette-item';
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.backgroundColor = hex(rgb);
    const meta = document.createElement('div');
    meta.className = 'palette-meta';
    const code = document.createElement('strong');
    code.textContent = label(index);
    const color = document.createElement('span');
    color.textContent = hex(rgb);
    meta.append(code, color);
    const count = document.createElement('span');
    count.className = 'palette-number';
    count.textContent = `${number(chart.counts[index])} 颗`;
    item.append(swatch, meta, count);
    fragment.append(item);
  });
  $('palette-list').append(fragment);
}

async function loadFile(file: File | undefined) {
  if (!file) return;
  if (file.size > 25 * 1024 * 1024) { showError('图片超过 25 MB，请先缩小图片。'); return; }
  const version = ++imageVersion;
  const previousFailure = generationFailed;
  readingImage = true;
  cancelGeneration();
  clearPendingGeneration();
  setBusy(true);
  $('error').hidden = true;
  $('status').textContent = '正在读取图片…';
  try {
    const bitmap = await createImageBitmap(file);
    if (version !== imageVersion) { bitmap.close(); return; }
    readingImage = false;
    closeSource();
    source = bitmap;
    baseName = file.name.replace(/\.[^.]+$/, '') || '我的拼豆';
    $('file-name').textContent = file.name;
    $('file-name').title = file.name;
    updateThumbnail();
    generate();
  } catch {
    if (version !== imageVersion) return;
    readingImage = false;
    generationFailed = previousFailure;
    setBusy(false);
    $('status').textContent = result ? '保留上一份图纸' : '图片读取失败';
    showError('无法读取这张图片。请尝试 PNG、JPG 或 WebP 文件。');
  }
}

function useDemo() {
  imageVersion++;
  readingImage = false;
  clearPendingGeneration();
  const demo = document.createElement('canvas');
  demo.width = 640;
  demo.height = 480;
  const ctx = demo.getContext('2d')!;
  const sky = ctx.createLinearGradient(0, 0, 0, 480);
  sky.addColorStop(0, '#536b92');
  sky.addColorStop(0.43, '#dda789');
  sky.addColorStop(0.72, '#f0ca8e');
  sky.addColorStop(1, '#f2d3a1');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 640, 480);
  ctx.fillStyle = '#ffe3a4';
  ctx.beginPath();ctx.arc(390, 190, 57, 0, Math.PI * 2);ctx.fill();
  const mountain = (color: string, points: [number, number][]) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 480);
    points.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(640, 480);ctx.closePath();ctx.fill();
  };
  mountain('#9394a3', [[0,280],[90,210],[170,265],[275,168],[395,301],[510,245],[640,300]]);
  mountain('#6f8291', [[0,330],[120,275],[215,330],[375,249],[525,346],[640,288]]);
  mountain('#456871', [[0,348],[85,308],[180,375],[320,316],[440,370],[560,332],[640,375]]);
  mountain('#2d5157', [[0,382],[160,368],[250,414],[340,384],[445,409],[570,388],[640,415]]);
  ctx.fillStyle = '#d4bb99';
  ctx.beginPath();ctx.moveTo(390,360);ctx.bezierCurveTo(260,415,460,410,360,480);ctx.lineTo(405,480);ctx.bezierCurveTo(491,418,286,419,400,360);ctx.fill();
  const tree = (x: number, y: number, size: number) => {
    ctx.fillStyle = '#203f44';
    ctx.fillRect(x - size * .04, y - size * .2, size * .08, size * .35);
    for (let i = 0; i < 3; i++) {
      const top = y - size + i * size * .2;
      const half = size * (.2 + i * .05);
      ctx.beginPath();ctx.moveTo(x, top);ctx.lineTo(x - half, top + size * .5);ctx.lineTo(x + half, top + size * .5);ctx.fill();
    }
  };
  ([[45,456,130],[98,430,91],[142,463,142],[535,475,130],[594,445,100],[488,441,64]] as [number, number, number][]).forEach(args => tree(...args));
  closeSource();
  source = demo;
  baseName = '日落山谷';
  $('file-name').textContent = '日落山谷 · 示例图片';
  $('file-name').title = '';
  $('file-input').value = '';
  updateThumbnail();
  syncControls();
  generate();
}

function download(blob: Blob, suffix: string, name = baseName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name}-${suffix}`;
  document.body.append(link);
  try { link.click(); }
  finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}

async function exportImage(format: ExportFormat) {
  if (busy || exporting || generationFailed || !result) return;
  exporting = true;
  syncExports();
  $('error').hidden = true;
  const chart = result;
  const name = baseName;
  $('export-status').textContent = '正在制作下载文件，仍可切换预览和调整设置…';
  try {
    const blob = await exportPng(chart, format);
    download(blob, format === 'chart' ? '拼豆图纸.png' : '8bit.png', name);
    $('export-status').textContent = '已触发下载，可以继续创作。';
  } catch (error) {
    $('export-status').textContent = '导出失败，可重新尝试。';
    showError(errorText(error));
  } finally {
    exporting = false;
    syncExports();
  }
}

$('file-input').addEventListener('change', () => loadFile($('file-input').files?.[0]));
$('demo-button').addEventListener('click', useDemo);
for (const event of ['dragenter', 'dragover'] as const) $('dropzone').addEventListener(event, e => {
  e.preventDefault();$('dropzone').classList.add('dragging');
});
for (const event of ['dragleave', 'drop'] as const) $('dropzone').addEventListener(event, e => {
  e.preventDefault();$('dropzone').classList.remove('dragging');
  if (event === 'drop') loadFile(e.dataTransfer?.files[0]);
});
// Prevent an accidental drop outside the uploader from navigating away.
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => e.preventDefault());
$('width-input').addEventListener('input', scheduleGenerate);
$('colors-input').addEventListener('input', scheduleGenerate);
$('color-card').addEventListener('change', scheduleGenerate);
$('design-style').addEventListener('change', scheduleGenerate);
document.querySelectorAll<HTMLButtonElement>('[data-colors]').forEach(button => button.addEventListener('click', () => {
  $('colors-input').value = button.dataset.colors!;
  scheduleGenerate();
}));
for (const tab of modes) $(`${tab}-tab`).addEventListener('click', () => {
  mode = tab;
  for (const other of modes) {
    $(`${other}-tab`).classList.toggle('active', other === tab);
    $(`${other}-tab`).setAttribute('aria-pressed', String(other === tab));
  }
  if (fitted) fitPreview();
  else renderPreview();
});
for (const state of ['round', 'fused'] as const) $(`bead-${state}`).addEventListener('click', () => {
  beadState = state;
  for (const other of ['round', 'fused'] as const) {
    $(`bead-${other}`).classList.toggle('active', other === state);
    $(`bead-${other}`).setAttribute('aria-pressed', String(other === state));
  }
  renderPreview();
});
$('symbols-input').addEventListener('change', renderPreview);
$('zoom-input').addEventListener('input', () => {
  fitted = false;
  renderPreview();
});
$('fit-button').addEventListener('click', fitPreview);
$('error-dismiss').addEventListener('click', () => { $('error').hidden = true; });
window.addEventListener('keydown', event => { if (event.key === 'Escape') $('error').hidden = true; });
// Observe the container, not the canvas: rendering must not change page layout.
new ResizeObserver(() => {
  if (fitted) fitPreview();
}).observe($('canvas-viewport'));
window.addEventListener('resize', () => {
  if (fitted) fitPreview();
});
$('export-chart').addEventListener('click', () => exportImage('chart'));
$('export-pixel').addEventListener('click', () => exportImage('pixel'));
$('export-csv').addEventListener('click', () => {
  if (busy || exporting || generationFailed || !result) return;
  const lines = [result.codes ? 'MARD色号,HEX,R,G,B,颗数' : '图纸编号（非品牌色号）,HEX,R,G,B,颗数'];
  const chart = result;
  chart.palette.forEach((rgb, i) => lines.push(`${label(i)},${hex(rgb)},${rgb.join(',')},${chart.counts[i]}`));
  download(new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), '用豆清单.csv');
});

syncControls();
useDemo();
