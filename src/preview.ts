// Draws the selected preview mode of a chart onto the workspace canvas.
import { drawBeads } from './beads.ts';
import { releaseCanvas } from './canvas.ts';
import { drawGrid, GRID_MARGIN } from './chart.ts';
import { EMPTY_CELL, MAX_CANVAS_PIXELS } from './constants.ts';
import type { ImageSource } from './image-source.ts';
import type { BeadState, Chart, PreviewMode } from './types.ts';

export interface PreviewOptions {
  mode: PreviewMode;
  beadState: BeadState;
  /** Displayed size of one bead, in CSS pixels. */
  cellSize: number;
  showCodes: boolean;
  source: ImageSource | null;
}

/** Bead previews are rendered at twice the resolution for smooth contours... */
const BEAD_SUPERSAMPLING = 2;
/** ...unless they are already this large. */
const MAX_SUPERSAMPLED_SIDE = 2048;
/** Room for the viewport border and rounding when fitting the chart. */
const FIT_PADDING = 8;

function ariaLabel(mode: PreviewMode, beadState: BeadState): string {
  switch (mode) {
    case 'grid': return '带编号拼豆图纸';
    case 'pixel': return '像素效果预览';
    case 'beads': return beadState === 'round' ? '熨烫前拼豆效果预览' : '熨烫后拼豆效果预览';
    case 'original': return '原始图片对照';
  }
}

/** Only the numbered grid has row and column numbers around it. */
const previewMargin = (mode: PreviewMode) => mode === 'grid' ? GRID_MARGIN : 0;

/** The largest whole cell size at which the entire chart fits the available area. */
export function fitCellSize(chart: Chart, mode: PreviewMode, availableWidth: number, availableHeight: number): number {
  const margins = previewMargin(mode) * 2 + FIT_PADDING;
  return Math.floor(Math.min((availableWidth - margins) / chart.width, (availableHeight - margins) / chart.height));
}

/** One pixel per bead, drawn scaled up without smoothing for the pixel preview. */
function createPixelImage(chart: Chart): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = chart.width;
  canvas.height = chart.height;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(chart.width, chart.height);
  for (let cell = 0; cell < chart.indices.length; cell++) {
    const index = chart.indices[cell];
    if (index !== EMPTY_CELL) image.data.set([...chart.palette[index], 255], cell * 4);
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

export class ChartPreview {
  readonly #canvas: HTMLCanvasElement;
  /** Reused while zooming; rebuilt only when the chart changes. */
  #pixelImage: { chart: Chart; canvas: HTMLCanvasElement } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.#canvas = canvas;
  }

  render(chart: Chart, options: PreviewOptions): void {
    const { mode, cellSize } = options;
    const margin = previewMargin(mode);
    const width = chart.width * cellSize + margin * 2;
    const height = chart.height * cellSize + margin * 2;
    // Keep the backing buffer within the memory budget; the displayed size never changes.
    const desiredScale = mode === 'beads' && Math.max(width, height) <= MAX_SUPERSAMPLED_SIDE ? BEAD_SUPERSAMPLING : 1;
    const scale = Math.min(desiredScale, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)));

    const canvas = this.#canvas;
    canvas.width = Math.floor(width * scale);
    canvas.height = Math.floor(height * scale);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.dataset.mode = mode;
    canvas.setAttribute('aria-label', ariaLabel(mode, options.beadState));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法创建预览画布。');
    context.scale(scale, scale);

    switch (mode) {
      case 'grid':
        context.fillStyle = '#fdfdf9';
        context.fillRect(0, 0, width, height);
        drawGrid(context, chart, cellSize, margin, margin, options.showCodes);
        break;
      case 'beads':
        drawBeads(context, chart, cellSize, options.beadState);
        break;
      case 'pixel':
      case 'original': {
        const showOriginal = mode === 'original' && options.source !== null;
        context.imageSmoothingEnabled = mode === 'original';
        context.drawImage(showOriginal ? options.source! : this.#pixelImageFor(chart), 0, 0, width, height);
        break;
      }
    }
  }

  #pixelImageFor(chart: Chart): HTMLCanvasElement {
    if (this.#pixelImage?.chart !== chart) {
      if (this.#pixelImage) releaseCanvas(this.#pixelImage.canvas);
      this.#pixelImage = { chart, canvas: createPixelImage(chart) };
    }
    return this.#pixelImage.canvas;
  }
}
