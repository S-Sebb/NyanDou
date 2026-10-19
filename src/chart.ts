// The numbered bead grid, used by the live preview and the downloadable chart PNG.
import { releaseCanvas } from './canvas.ts';
import { relativeLuminance } from './color.ts';
import { EMPTY_CELL, MAX_CANVAS_PIXELS } from './constants.ts';
import { colorLabel, formatCount, toHex } from './format.ts';
import type { Chart, ChartPixels, DrawingContext, RGB } from './types.ts';

/** Space around the preview grid for the row and column numbers. */
export const GRID_MARGIN = 28;
/** Smaller cells cannot fit a readable color code. */
export const MIN_CELL_FOR_CODES = 12;
const MIN_CELL_FOR_SINGLE_LINES = 4;

interface LineStyle {
  color: string;
  width: number;
}

const TEN_BEAD_LINE: LineStyle = { color: '#293e4266', width: 1 };
const FIVE_BEAD_LINE: LineStyle = { color: '#293e4240', width: 0.8 };
const SINGLE_BEAD_LINE: LineStyle = { color: '#293e4225', width: 0.5 };

const DARK_INK = '#25312b';
const LIGHT_INK = '#ffffff';

/** Text color that stays readable on the given bead color. */
function inkFor(rgb: RGB): string {
  return relativeLuminance(rgb) > 0.179 ? DARK_INK : LIGHT_INK;
}

/**
 * Prepares the grid area and returns a function that paints one row of cells.
 * Painting row by row lets the export yield between batches.
 */
function createRowPainter(
  context: DrawingContext,
  chart: ChartPixels,
  cell: number,
  left: number,
  top: number,
  showCodes: boolean,
) {
  const colors = chart.palette.map(toHex);
  const inks = chart.palette.map(inkFor);
  const labels = chart.palette.map((_, index) => colorLabel(chart, index));
  const drawCodes = showCodes && cell >= MIN_CELL_FOR_CODES;

  context.fillStyle = '#ffffff';
  context.fillRect(left, top, chart.width * cell, chart.height * cell);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `${Math.max(7, Math.floor(cell * 0.35))}px monospace`;

  return (row: number) => {
    for (let column = 0; column < chart.width; column++) {
      const index = chart.indices[row * chart.width + column];
      if (index === EMPTY_CELL) continue;
      context.fillStyle = colors[index];
      context.fillRect(left + column * cell, top + row * cell, cell, cell);
      if (drawCodes) {
        context.fillStyle = inks[index];
        context.fillText(labels[index], left + (column + 0.5) * cell, top + (row + 0.5) * cell);
      }
    }
  };
}

/** Every 10th line and the outer border are dark, every 5th line is medium. */
function lineStyleAt(position: number, lineCount: number): LineStyle {
  if (position % 10 === 0 || position === lineCount) return TEN_BEAD_LINE;
  if (position % 5 === 0) return FIVE_BEAD_LINE;
  return SINGLE_BEAD_LINE;
}

function strokeLine(context: DrawingContext, style: LineStyle, x1: number, y1: number, x2: number, y2: number) {
  context.beginPath();
  context.strokeStyle = style.color;
  context.lineWidth = style.width;
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}

function drawGridLines(context: DrawingContext, chart: ChartPixels, cell: number, left: number, top: number) {
  const right = left + chart.width * cell;
  const bottom = top + chart.height * cell;
  // Single-bead lines would turn a zoomed-out grid into a gray wash.
  const visible = (style: LineStyle) => style !== SINGLE_BEAD_LINE || cell >= MIN_CELL_FOR_SINGLE_LINES;

  for (let column = 0; column <= chart.width; column++) {
    const style = lineStyleAt(column, chart.width);
    const x = left + column * cell;
    if (visible(style)) strokeLine(context, style, x, top, x, bottom);
  }
  for (let row = 0; row <= chart.height; row++) {
    const style = lineStyleAt(row, chart.height);
    const y = top + row * cell;
    if (visible(style)) strokeLine(context, style, left, y, right, y);
  }
}

/** Numbers the first row and column and then every 5th (or more, when cells are small). */
function drawAxisNumbers(context: DrawingContext, chart: ChartPixels, cell: number, left: number, top: number) {
  context.fillStyle = '#708073';
  context.font = '9px monospace';
  const step = Math.max(5, Math.ceil(24 / cell / 5) * 5);
  const labelled = (index: number) => index === 0 || (index + 1) % step === 0;
  for (let column = 0; column < chart.width; column++) {
    if (labelled(column)) context.fillText(String(column + 1), left + (column + 0.5) * cell, top - 12);
  }
  for (let row = 0; row < chart.height; row++) {
    if (labelled(row)) context.fillText(String(row + 1), left - 15, top + (row + 0.5) * cell);
  }
}

export function drawGrid(
  context: DrawingContext,
  chart: ChartPixels,
  cell: number,
  left = GRID_MARGIN,
  top = GRID_MARGIN,
  showCodes = true,
): void {
  const paintRow = createRowPainter(context, chart, cell, left, top, showCodes);
  for (let row = 0; row < chart.height; row++) paintRow(row);
  drawGridLines(context, chart, cell, left, top);
  drawAxisNumbers(context, chart, cell, left, top);
}

// --- Downloadable chart PNG --------------------------------------------------

const EXPORT_MARGIN = 44;
const EXPORT_MIN_WIDTH = 720;
const EXPORT_MAX_CELL = 26;
const EXPORT_GRID_TOP = 120;
const LEGEND_GAP = 48;
const LEGEND_COLUMN_WIDTH = 178;
const LEGEND_ROW_HEIGHT = 43;
const SWATCH_SIZE = 25;
const FOOTER_HEIGHT = 88;
const ROWS_PER_YIELD = 4;

const TITLE_COLOR = '#253b39';
const MUTED_COLOR = '#6d7d70';

/**
 * Picks the largest cell size whose chart, legend included, fits the canvas budget.
 * The export always shows codes, so cells never shrink below MIN_CELL_FOR_CODES.
 */
export function chartLayout(chart: Pick<ChartPixels, 'width' | 'height' | 'palette'>) {
  const margin = EXPORT_MARGIN;
  for (let cell = EXPORT_MAX_CELL; cell >= MIN_CELL_FOR_CODES; cell--) {
    const width = Math.max(EXPORT_MIN_WIDTH, chart.width * cell + margin * 2);
    const columns = Math.floor((width - margin * 2) / LEGEND_COLUMN_WIDTH);
    const legendTop = EXPORT_GRID_TOP + chart.height * cell + LEGEND_GAP;
    const legendRows = Math.ceil(chart.palette.length / columns);
    const height = legendTop + legendRows * LEGEND_ROW_HEIGHT + FOOTER_HEIGHT;
    if (width * height <= MAX_CANVAS_PIXELS) return { cell, margin, width, height, columns, legendTop };
  }
  throw new Error('图纸过大，请减少横向豆数后重试。');
}

type Layout = ReturnType<typeof chartLayout>;

function drawTitle(context: DrawingContext, chart: Chart, { margin }: Layout) {
  const beads = chart.width * chart.height - chart.empty;
  const card = chart.codes ? 'MARD 标准 221 色' : '自动提取参考色';
  context.fillStyle = TITLE_COLOR;
  context.font = 'bold 25px sans-serif';
  context.fillText('ニャンドゥ · 拼豆图纸', margin, 40);
  context.font = '14px sans-serif';
  context.fillStyle = MUTED_COLOR;
  context.fillText(
    `${chart.width} × ${chart.height} 格  /  ${chart.palette.length} 色  /  ${formatCount(beads)} 颗  /  空格 ${formatCount(chart.empty)}  /  ${card}`,
    margin,
    70,
  );
}

function drawLegend(context: DrawingContext, chart: Chart, { margin, columns, legendTop }: Layout) {
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.fillStyle = TITLE_COLOR;
  context.font = 'bold 17px sans-serif';
  context.fillText('用豆清单', margin, legendTop);
  chart.palette.forEach((rgb, index) => {
    const x = margin + (index % columns) * LEGEND_COLUMN_WIDTH;
    const y = legendTop + 19 + Math.floor(index / columns) * LEGEND_ROW_HEIGHT;
    context.fillStyle = toHex(rgb);
    context.fillRect(x, y, SWATCH_SIZE, SWATCH_SIZE);
    context.strokeStyle = '#d5dacf';
    context.lineWidth = 1;
    context.strokeRect(x, y, SWATCH_SIZE, SWATCH_SIZE);
    context.fillStyle = TITLE_COLOR;
    context.font = '12px monospace';
    context.fillText(`${colorLabel(chart, index)}  ${toHex(rgb)}`, x + 33, y + 10);
    context.fillStyle = MUTED_COLOR;
    context.font = '11px sans-serif';
    context.fillText(`${formatCount(chart.counts[index])} 颗`, x + 33, y + 25);
  });
}

function drawFooter(context: DrawingContext, chart: Chart, { margin, height }: Layout) {
  context.font = '12px sans-serif';
  context.fillStyle = '#8a9384';
  const codeNote = chart.codes
    ? '一格一颗豆。图中编号为 MARD 色号。透明区域留空。'
    : '一格一颗豆。编号为本图配色编号，并非品牌色号。透明区域留空。';
  context.fillText(codeNote, margin, height - 38);
  context.fillText('10 格深线 / 5 格浅线。屏幕颜色仅供参考，购买前请核对店家实物色卡。', margin, height - 18);
}

async function encodePng(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob | null> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/png' });
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

export interface ChartPngOptions {
  createCanvas?: () => HTMLCanvasElement | OffscreenCanvas;
  /** Called between row batches so a main-thread export keeps the page responsive. */
  yieldBetweenRows?: () => Promise<void>;
}

/** Renders the full chart with title, grid and bead legend. Runs in a worker or on the main thread. */
export async function chartPng(
  chart: Chart,
  {
    createCanvas = () => new OffscreenCanvas(1, 1),
    yieldBetweenRows = () => Promise.resolve(),
  }: ChartPngOptions = {},
): Promise<Blob> {
  const layout = chartLayout(chart);
  const { cell, margin, width, height } = layout;
  const canvas = createCanvas();
  try {
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d') as DrawingContext | null;
    if (!context) throw new Error('浏览器无法创建图纸画布。');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    drawTitle(context, chart, layout);

    const paintRow = createRowPainter(context, chart, cell, margin, EXPORT_GRID_TOP, true);
    for (let row = 0; row < chart.height; row++) {
      paintRow(row);
      if (row % ROWS_PER_YIELD === ROWS_PER_YIELD - 1) await yieldBetweenRows();
    }
    drawGridLines(context, chart, cell, margin, EXPORT_GRID_TOP);
    drawAxisNumbers(context, chart, cell, margin, EXPORT_GRID_TOP);

    drawLegend(context, chart, layout);
    drawFooter(context, chart, layout);

    const blob = await encodePng(canvas);
    if (!blob) throw new Error('图纸导出失败，请减少图纸尺寸后重试。');
    return blob;
  } finally {
    releaseCanvas(canvas);
  }
}
