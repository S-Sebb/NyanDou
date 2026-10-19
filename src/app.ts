// Page controller: connects the controls to image loading, chart generation,
// the preview and the downloads.
import { MIN_CELL_FOR_CODES } from './chart.ts';
import { AUTO_COLOR_LIMIT, MARD_COLOR_LIMIT } from './constants.ts';
import { beadListCsv } from './csv.ts';
import { createDemoImage, DEMO_NAME } from './demo.ts';
import { downloadBlob } from './download.ts';
import { exportPng } from './export.ts';
import { errorMessage, formatCount } from './format.ts';
import { chartSize, sampleImage, thumbnailUrl, type ImageSource } from './image-source.ts';
import { renderPaletteList } from './palette-list.ts';
import { ChartPreview, fitCellSize } from './preview.ts';
import { startQuantizeJob } from './quantize-job.ts';
import { ui } from './ui.ts';
import type { WorkerJob } from './worker-job.ts';
import type { BeadState, Chart, DesignStyle, ExportFormat, PaletteMode, PreviewMode } from './types.ts';

const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** Setting changes within this window are combined into one generation. */
const GENERATION_DEBOUNCE_MS = 60;
const PREVIEW_MODES: PreviewMode[] = ['grid', 'pixel', 'beads', 'original'];
const BEAD_STATES: BeadState[] = ['round', 'fused'];

// --- State -------------------------------------------------------------------

let source: ImageSource | null = null;
/** Base name for downloaded files. */
let sourceName = DEMO_NAME;
let chart: Chart | null = null;
let previewMode: PreviewMode = 'grid';
let beadState: BeadState = 'round';
/** Keep fitting the zoom to the viewport until the user zooms manually. */
let fitToViewport = true;

/** An image is being read or a chart generated, so the current chart is about to change. */
let busy = true;
let generationFailed = false;
let exporting = false;
let readingImage = false;
/** Incremented per image change, so a slow decode cannot replace a newer image. */
let imageVersion = 0;
let generationJob: WorkerJob | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
/** Settings changed since the running job started; generate again when it finishes. */
let regenerationPending = false;

const preview = new ChartPreview(ui.canvas);

// --- Status, errors and exports ------------------------------------------------

function showError(message: string) {
  ui.errorMessage.textContent = message;
  ui.error.hidden = false;
}

function hideError() {
  ui.error.hidden = true;
}

/** The chart that may be downloaded right now, or null while it is stale or unavailable. */
function exportableChart(): Chart | null {
  return busy || exporting || generationFailed ? null : chart;
}

function syncExportButtons() {
  const disabled = !exportableChart();
  for (const button of [ui.exportChart, ui.exportPixel, ui.exportCsv]) button.disabled = disabled;
  ui.exportChart.querySelector('span')!.textContent = exporting ? '正在导出…' : '下载拼豆图纸';
  ui.exportChart.setAttribute('aria-busy', String(exporting));
}

function setBusy(isBusy: boolean, status = isBusy ? '正在生成…' : '图纸已就绪') {
  busy = isBusy;
  if (isBusy) generationFailed = false;
  syncExportButtons();
  ui.status.textContent = status;
  ui.viewport.setAttribute('aria-busy', String(isBusy));
}

function setPressed(button: HTMLButtonElement, pressed: boolean) {
  button.classList.toggle('active', pressed);
  button.setAttribute('aria-pressed', String(pressed));
}

// --- Settings ------------------------------------------------------------------

function readSettings() {
  const paletteMode: PaletteMode = ui.colorCard.value === 'auto' ? 'auto' : 'mard221';
  const designStyle: DesignStyle = ui.designStyle.value === 'faithful' ? 'faithful' : 'pixel';
  return {
    requestedWidth: Number(ui.widthInput.value),
    maxColors: Number(ui.colorsInput.value),
    paletteMode,
    designStyle,
  };
}

/** Updates limits, labels and presets to match the current settings. */
function syncSettingControls() {
  const isMard = readSettings().paletteMode === 'mard221';
  const limit = isMard ? MARD_COLOR_LIMIT : AUTO_COLOR_LIMIT;
  ui.colorsInput.max = String(limit);
  if (Number(ui.colorsInput.value) > limit) ui.colorsInput.value = String(limit);
  ui.colorsMax.textContent = `${limit} · ${isMard ? '全色' : '丰富'}`;
  ui.fullColorsPreset.dataset.colors = String(limit);
  ui.fullColorsPreset.querySelector('strong')!.textContent = String(limit);
  ui.colorNote.textContent = isMard
    ? '匹配 MARD 标准 221 色。颜色更少，拼起来更轻松。'
    : '自动提取参考配色，不对应实物色号。颜色更少，拼起来更轻松。';

  ui.widthValue.textContent = `${ui.widthInput.value} 颗`;
  ui.colorsValue.textContent = `${ui.colorsInput.value} 色`;
  ui.widthInput.setAttribute('aria-valuetext', ui.widthValue.textContent);
  ui.colorsInput.setAttribute('aria-valuetext', ui.colorsValue.textContent);
  for (const preset of ui.widthPresets) setPressed(preset, preset.dataset.width === ui.widthInput.value);
  for (const preset of ui.colorPresets) setPressed(preset, preset.dataset.colors === ui.colorsInput.value);
}

// --- Generation ----------------------------------------------------------------

function cancelGeneration() {
  generationJob?.cancel();
  generationJob = null;
}

function clearScheduledGeneration() {
  clearTimeout(debounceTimer);
  debounceTimer = undefined;
  regenerationPending = false;
}

function failGeneration(message: string) {
  cancelGeneration();
  clearScheduledGeneration();
  generationFailed = true;
  setBusy(false, '生成失败');
  showError(message);
}

/** Starts generating right away, replacing any running job. */
function generate() {
  if (!source) return;
  clearScheduledGeneration();
  cancelGeneration();
  setBusy(true);
  hideError();
  try {
    startGeneration(source);
  } catch (error) {
    failGeneration(`无法生成图纸：${errorMessage(error)}`);
  }
}

function startGeneration(image: ImageSource) {
  const { requestedWidth, maxColors, paletteMode, designStyle } = readSettings();
  const { width, height } = chartSize(image.width, image.height, requestedWidth);
  const rgba = sampleImage(image, width, height, designStyle);
  generationJob = startQuantizeJob({ rgba, width, height, maxColors, paletteMode, designStyle }, response => {
    generationJob = null;
    if ('error' in response) failGeneration(response.error);
    else showChart(response.result);
  });
}

/**
 * Coalesces setting changes in a fixed window instead of waiting for a drag to stop.
 * A running job is never cancelled for a newer value: slow devices must be able to
 * finish and paint a result, then pick up the newest settings.
 */
function scheduleGeneration() {
  syncSettingControls();
  // Changes made while a new image is decoding apply to that image, not the old one.
  if (readingImage) return;
  regenerationPending = true;
  setBusy(true);
  if (generationJob || debounceTimer !== undefined) return;
  debounceTimer = setTimeout(generate, GENERATION_DEBOUNCE_MS);
}

function showChart(next: Chart) {
  const resized = !chart || chart.width !== next.width || chart.height !== next.height;
  chart = next;
  showChartSummary(next);
  renderPaletteList(ui.paletteList, next);
  if (resized) fitPreview();
  else renderPreview();
  // Results are painted during a drag, but exports stay disabled until the
  // chart for the final settings is ready.
  if (regenerationPending) scheduleGeneration();
  else setBusy(false);
}

function showChartSummary(next: Chart) {
  const isMard = Boolean(next.codes);
  ui.sizeStat.textContent = `${next.width} × ${next.height}`;
  ui.colorsStat.textContent = `${next.palette.length} 色`;
  ui.beadsStat.textContent = formatCount(next.width * next.height - next.empty);
  ui.colorCardStat.textContent = isMard ? 'MARD 221' : '自动提取';
  ui.paletteCount.textContent = String(next.palette.length);
  ui.paletteLabel.textContent = isMard ? 'MARD 色号 · HEX · 颗数' : '图纸编号 · HEX · 颗数';
  ui.paletteDisclaimer.textContent = isMard
    ? 'MARD 标准 221 色 · 屏幕参考色，购买前请核对店家实物色卡。'
    : '自动提取的配色不是品牌色号，购买前请核对实物色卡。';
}

// --- Preview -------------------------------------------------------------------

function previewHint(cellSize: number, showCodes: boolean): string {
  switch (previewMode) {
    case 'grid':
      return cellSize < MIN_CELL_FOR_CODES && showCodes
        ? '编号需 12px · 10 格深线 / 5 格浅线'
        : '10 格深线 / 5 格浅线 · 透明区域留空';
    case 'beads': return '一格一颗豆 · 放大查看珠孔和连接处';
    case 'pixel': return '一像素一颗豆 · 无抖动杂色';
    case 'original': return '原图对照 · 图片只在本机处理';
  }
}

function renderPreview() {
  if (!chart) return;
  const cellSize = Number(ui.zoomInput.value);
  const showCodes = ui.symbolsInput.checked;
  ui.zoomValue.textContent = `${cellSize}px`;
  ui.zoomInput.setAttribute('aria-valuetext', `${cellSize} 像素每格`);
  preview.render(chart, { mode: previewMode, beadState, cellSize, showCodes, source });
  ui.beadSettings.hidden = previewMode !== 'beads';
  ui.symbolsInput.disabled = previewMode !== 'grid';
  ui.previewHint.textContent = previewHint(cellSize, showCodes);
}

function fitPreview() {
  if (!chart) return;
  fitToViewport = true;
  const fitted = fitCellSize(chart, previewMode, ui.viewport.clientWidth, ui.viewport.clientHeight);
  const cellSize = Math.max(Number(ui.zoomInput.min), Math.min(Number(ui.zoomInput.max), fitted));
  ui.zoomInput.value = String(cellSize);
  renderPreview();
  ui.viewport.scrollTop = 0;
  ui.viewport.scrollLeft = 0;
}

function refitIfAutomatic() {
  if (fitToViewport) fitPreview();
}

function selectPreviewMode(mode: PreviewMode) {
  previewMode = mode;
  for (const other of PREVIEW_MODES) setPressed(ui.modeTabs[other], other === mode);
  if (fitToViewport) fitPreview();
  else renderPreview();
}

function selectBeadState(state: BeadState) {
  beadState = state;
  for (const other of BEAD_STATES) setPressed(ui.beadStateButtons[other], other === state);
  renderPreview();
}

// --- Image source --------------------------------------------------------------

function setSource(image: ImageSource, name: string, label: string, title: string) {
  if (source instanceof ImageBitmap) source.close();
  source = image;
  sourceName = name;
  ui.fileName.textContent = label;
  ui.fileName.title = title;
  ui.sourceThumbnail.src = thumbnailUrl(image);
}

async function loadFile(file: File | undefined) {
  if (!file) return;
  if (file.size > MAX_FILE_BYTES) {
    showError('图片超过 25 MB，请先缩小图片。');
    return;
  }
  const version = ++imageVersion;
  const failedBefore = generationFailed;
  readingImage = true;
  cancelGeneration();
  clearScheduledGeneration();
  setBusy(true, '正在读取图片…');
  hideError();
  try {
    const bitmap = await createImageBitmap(file);
    if (version !== imageVersion) {
      bitmap.close();
      return;
    }
    readingImage = false;
    setSource(bitmap, file.name.replace(/\.[^.]+$/, '') || '我的拼豆', file.name, file.name);
    generate();
  } catch {
    if (version !== imageVersion) return;
    // Keep showing (and allow exporting) the previous chart.
    readingImage = false;
    generationFailed = failedBefore;
    setBusy(false, chart ? '保留上一份图纸' : '图片读取失败');
    showError('无法读取这张图片。请尝试 PNG、JPG 或 WebP 文件。');
  }
}

function useDemo() {
  imageVersion++; // Abandon any image that is still decoding.
  readingImage = false;
  clearScheduledGeneration();
  setSource(createDemoImage(), DEMO_NAME, `${DEMO_NAME} · 示例图片`, '');
  ui.fileInput.value = '';
  syncSettingControls();
  generate();
}

// --- Downloads -----------------------------------------------------------------

async function exportImage(format: ExportFormat) {
  // Snapshot the chart and name, so later changes cannot mix into this download.
  const snapshot = exportableChart();
  if (!snapshot) return;
  const name = sourceName;
  exporting = true;
  syncExportButtons();
  hideError();
  ui.exportStatus.textContent = '正在制作下载文件，仍可切换预览和调整设置…';
  try {
    const blob = await exportPng(snapshot, format);
    downloadBlob(blob, `${name}-${format === 'chart' ? '拼豆图纸.png' : '8bit.png'}`);
    ui.exportStatus.textContent = '已触发下载，可以继续创作。';
  } catch (error) {
    ui.exportStatus.textContent = '导出失败，可重新尝试。';
    showError(errorMessage(error));
  } finally {
    exporting = false;
    syncExportButtons();
  }
}

function exportCsv() {
  const snapshot = exportableChart();
  if (!snapshot) return;
  const csv = new Blob([beadListCsv(snapshot)], { type: 'text/csv;charset=utf-8' });
  downloadBlob(csv, `${sourceName}-用豆清单.csv`);
}

// --- Wiring --------------------------------------------------------------------

function bindImageSourceEvents() {
  ui.fileInput.addEventListener('change', () => loadFile(ui.fileInput.files?.[0]));
  ui.demoButton.addEventListener('click', useDemo);
  for (const type of ['dragenter', 'dragover'] as const) {
    ui.dropzone.addEventListener(type, event => {
      event.preventDefault();
      ui.dropzone.classList.add('dragging');
    });
  }
  for (const type of ['dragleave', 'drop'] as const) {
    ui.dropzone.addEventListener(type, event => {
      event.preventDefault();
      ui.dropzone.classList.remove('dragging');
      if (type === 'drop') loadFile(event.dataTransfer?.files[0]);
    });
  }
  // A drop that misses the uploader must not navigate away from the page.
  window.addEventListener('dragover', event => event.preventDefault());
  window.addEventListener('drop', event => event.preventDefault());
}

function bindSettingEvents() {
  ui.widthInput.addEventListener('input', scheduleGeneration);
  ui.colorsInput.addEventListener('input', scheduleGeneration);
  ui.colorCard.addEventListener('change', scheduleGeneration);
  ui.designStyle.addEventListener('change', scheduleGeneration);
  for (const preset of ui.widthPresets) {
    preset.addEventListener('click', () => {
      ui.widthInput.value = preset.dataset.width!;
      scheduleGeneration();
    });
  }
  for (const preset of ui.colorPresets) {
    preset.addEventListener('click', () => {
      ui.colorsInput.value = preset.dataset.colors!;
      scheduleGeneration();
    });
  }
}

function bindPreviewEvents() {
  for (const mode of PREVIEW_MODES) ui.modeTabs[mode].addEventListener('click', () => selectPreviewMode(mode));
  for (const state of BEAD_STATES) ui.beadStateButtons[state].addEventListener('click', () => selectBeadState(state));
  ui.symbolsInput.addEventListener('change', renderPreview);
  ui.zoomInput.addEventListener('input', () => {
    fitToViewport = false;
    renderPreview();
  });
  ui.fitButton.addEventListener('click', fitPreview);
  // Observe the container, not the canvas: rendering must not change the page layout.
  new ResizeObserver(refitIfAutomatic).observe(ui.viewport);
  window.addEventListener('resize', refitIfAutomatic);
}

function bindDownloadAndErrorEvents() {
  ui.exportChart.addEventListener('click', () => exportImage('chart'));
  ui.exportPixel.addEventListener('click', () => exportImage('pixel'));
  ui.exportCsv.addEventListener('click', exportCsv);
  ui.errorDismiss.addEventListener('click', hideError);
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') hideError();
  });
}

bindImageSourceEvents();
bindSettingEvents();
bindPreviewEvents();
bindDownloadAndErrorEvents();
syncSettingControls();
useDemo();
