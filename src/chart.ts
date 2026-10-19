import type { RGB, Chart, ChartPixels, DrawingContext } from './types.ts';
const hex = (rgb: RGB) => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
const label = (chart: ChartPixels, i: number) => chart.codes?.[i] ?? String(i + 1).padStart(3, '0');
const number = (value: number) => value.toLocaleString('zh-CN');

function ink(rgb: RGB) {
  const linear = rgb.map(v => v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722 > .179 ? '#25312b' : '#ffffff';
}

function gridPainter(context: DrawingContext, chart: ChartPixels, cell: number, x: number, y: number, symbols: boolean) {
  const colors = chart.palette.map(hex);
  const inks = chart.palette.map(ink);
  const labels = chart.palette.map((_, i) => label(chart, i));
  context.fillStyle = '#ffffff';
  context.fillRect(x, y, chart.width * cell, chart.height * cell);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `${Math.max(7, Math.floor(cell * .35))}px monospace`;
  return (row: number) => {
    for (let column = 0; column < chart.width; column++) {
      const i = chart.indices[row * chart.width + column];
      if (i === 65535) continue;
      context.fillStyle = colors[i];
      context.fillRect(x + column * cell, y + row * cell, cell, cell);
      if (symbols && cell >= 12) {
        context.fillStyle = inks[i];
        context.fillText(labels[i], x + (column + .5) * cell, y + (row + .5) * cell);
      }
    }
  };
}

function gridLines(context: DrawingContext, chart: ChartPixels, cell: number, x: number, y: number) {
  for (let axis = 0; axis < 2; axis++) {
    const limit = axis ? chart.height : chart.width;
    for (let i = 0; i <= limit; i++) {
      const major = i % 10 === 0 || i === limit;
      const middle = i % 5 === 0;
      if (!major && !middle && cell < 4) continue;
      context.beginPath();
      context.strokeStyle = major ? '#293e4266' : middle ? '#293e4240' : '#293e4225';
      context.lineWidth = major ? 1 : middle ? .8 : .5;
      if (axis) { context.moveTo(x, y + i * cell); context.lineTo(x + chart.width * cell, y + i * cell); }
      else { context.moveTo(x + i * cell, y); context.lineTo(x + i * cell, y + chart.height * cell); }
      context.stroke();
    }
  }
  context.fillStyle = '#708073';
  context.font = '9px monospace';
  const step = Math.max(5, Math.ceil(24 / cell / 5) * 5);
  for (let i = 0; i < chart.width; i++) {
    if (i === 0 || (i + 1) % step === 0) context.fillText(String(i + 1), x + (i + .5) * cell, y - 12);
  }
  for (let i = 0; i < chart.height; i++) {
    if (i === 0 || (i + 1) % step === 0) context.fillText(String(i + 1), x - 15, y + (i + .5) * cell);
  }
}

export function drawGrid(context: DrawingContext, chart: ChartPixels, cell: number, x = 28, y = 28, symbols = true) {
  const row = gridPainter(context, chart, cell, x, y, symbols);
  for (let i = 0; i < chart.height; i++) row(i);
  gridLines(context, chart, cell, x, y);
}

export function chartLayout(chart: Pick<ChartPixels, 'width' | 'height' | 'palette'>) {
  const margin = 44;
  for (let cell = 26; cell >= 12; cell--) {
    const width = Math.max(720, chart.width * cell + margin * 2);
    const columns = Math.floor((width - margin * 2) / 178);
    const legendTop = 120 + chart.height * cell + 48;
    const height = legendTop + Math.ceil(chart.palette.length / columns) * 43 + 88;
    if (width * height <= 8_000_000) return { cell, margin, width, height, columns, legendTop };
  }
  throw new Error('图纸过大，请减少横向豆数后重试。');
}

// The worker owns its canvas. The fallback yields between small row batches.
export async function chartPng(chart: Chart, createCanvas: () => HTMLCanvasElement | OffscreenCanvas = () => new OffscreenCanvas(1, 1), yieldTask: () => Promise<void> = () => Promise.resolve()): Promise<Blob> {
  const { cell, margin, width, height, columns, legendTop } = chartLayout(chart);
  const canvas = createCanvas();
  try {
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d') as DrawingContext | null;
    if (!context) throw new Error('浏览器无法创建图纸画布。');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height);
    context.fillStyle = '#253b39'; context.font = 'bold 25px sans-serif';
    context.fillText('ニャンドゥ · 拼豆图纸', margin, 40);
    context.font = '14px sans-serif'; context.fillStyle = '#6d7d70';
    context.fillText(`${chart.width} × ${chart.height} 格  /  ${chart.palette.length} 色  /  ${number(chart.width * chart.height - chart.empty)} 颗  /  空格 ${number(chart.empty)}  /  ${chart.codes ? 'MARD 标准 221 色' : '自动提取参考色'}`, margin, 70);
    const row = gridPainter(context, chart, cell, margin, 120, true);
    for (let y = 0; y < chart.height; y++) {
      row(y);
      if (y % 4 === 3) await yieldTask();
    }
    gridLines(context, chart, cell, margin, 120);
    context.textAlign = 'left'; context.textBaseline = 'alphabetic';
    context.fillStyle = '#253b39'; context.font = 'bold 17px sans-serif';
    context.fillText('用豆清单', margin, legendTop);
    chart.palette.forEach((rgb, i) => {
      const x = margin + (i % columns) * 178;
      const y = legendTop + 19 + Math.floor(i / columns) * 43;
      context.fillStyle = hex(rgb); context.fillRect(x, y, 25, 25);
      context.strokeStyle = '#d5dacf'; context.lineWidth = 1; context.strokeRect(x, y, 25, 25);
      context.fillStyle = '#253b39'; context.font = '12px monospace';
      context.fillText(`${label(chart, i)}  ${hex(rgb)}`, x + 33, y + 10);
      context.fillStyle = '#6d7d70'; context.font = '11px sans-serif';
      context.fillText(`${number(chart.counts[i])} 颗`, x + 33, y + 25);
    });
    context.font = '12px sans-serif'; context.fillStyle = '#8a9384';
    context.fillText(chart.codes ? '一格一颗豆。图中编号为 MARD 色号。透明区域留空。' : '一格一颗豆。编号为本图配色编号，并非品牌色号。透明区域留空。', margin, height - 38);
    context.fillText('10 格深线 / 5 格浅线。屏幕颜色仅供参考，购买前请核对店家实物色卡。', margin, height - 18);
    const blob = 'convertToBlob' in canvas ? await canvas.convertToBlob({ type: 'image/png' })
      : await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('图纸导出失败，请减少图纸尺寸后重试。');
    return blob;
  } finally {
    canvas.width = canvas.height = 1;
  }
}
