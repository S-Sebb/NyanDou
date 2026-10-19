// Illustrative top-down bead rendering. Both states use the chart's exact indices;
// this is not a physical simulation of plastic melting or a calibrated color proof.
const SIZE = 64;
import type { RGB, ChartPixels, BeadState } from './types.ts';

export function neighborMask(indices: Uint16Array, width: number, height: number, x: number, y: number) {
  const occupied = (xx: number, yy: number) => xx >= 0 && xx < width && yy >= 0 && yy < height && indices[yy * width + xx] !== 65535;
  return (occupied(x, y - 1) ? 1 : 0) | (occupied(x + 1, y) ? 2 : 0)
    | (occupied(x, y + 1) ? 4 : 0) | (occupied(x - 1, y) ? 8 : 0);
}

function shade(rgb: RGB, amount: number) {
  return `rgb(${rgb.map(value => Math.round(value + ((amount > 0 ? 255 : 0) - value) * Math.abs(amount))).join(',')})`;
}

function fusedOutline(context: CanvasRenderingContext2D, mask: number) {
  const left = mask & 8 ? 0 : SIZE * 0.04;
  const top = mask & 1 ? 0 : SIZE * 0.04;
  const right = mask & 2 ? SIZE : SIZE * 0.96;
  const bottom = mask & 4 ? SIZE : SIZE * 0.96;
  const radius = SIZE * 0.16;
  const tl = mask & 9 ? 0 : radius;
  const tr = mask & 3 ? 0 : radius;
  const br = mask & 6 ? 0 : radius;
  const bl = mask & 12 ? 0 : radius;
  context.moveTo(left + tl, top);
  context.lineTo(right - tr, top);
  context.quadraticCurveTo(right, top, right, top + tr);
  context.lineTo(right, bottom - br);
  context.quadraticCurveTo(right, bottom, right - br, bottom);
  context.lineTo(left + bl, bottom);
  context.quadraticCurveTo(left, bottom, left, bottom - bl);
  context.lineTo(left, top + tl);
  context.quadraticCurveTo(left, top, left + tl, top);
  context.closePath();
}

function sprite(rgb: RGB, fused: boolean, mask: number, document: Document) {
  const image = document.createElement('canvas');
  image.width = image.height = SIZE;
  const context = image.getContext('2d')!;
  const center = SIZE / 2;
  const outer = SIZE * 0.455;
  const hole = SIZE * (fused ? 0.075 : 0.17);
  const body = context.createLinearGradient(0, 0, SIZE, SIZE);
  body.addColorStop(0, shade(rgb, fused ? 0.10 : 0.28));
  body.addColorStop(0.45, shade(rgb, 0));
  body.addColorStop(1, shade(rgb, fused ? -0.07 : -0.22));
  context.save();
  if (!fused) {
    context.shadowColor = '#332a2638';
    context.shadowBlur = SIZE * 0.035;
    context.shadowOffsetY = SIZE * 0.025;
  }
  context.beginPath();
  if (fused) fusedOutline(context, mask);
  else context.arc(center, center, outer, 0, Math.PI * 2);
  context.fillStyle = body;
  context.fill();
  context.restore();

  // Cut an actual transparent hole. Empty cells and holes expose the same surface.
  context.save();
  context.globalCompositeOperation = 'destination-out';
  context.beginPath();
  context.arc(center, center, hole, 0, Math.PI * 2);
  context.fill();
  context.restore();

  const wall = context.createLinearGradient(0, 0, SIZE, SIZE);
  wall.addColorStop(0, shade(rgb, -0.46));
  wall.addColorStop(1, shade(rgb, 0.14));
  context.strokeStyle = wall;
  context.lineWidth = SIZE * (fused ? 0.022 : 0.045);
  context.beginPath();
  context.arc(center, center, hole + context.lineWidth / 2, 0, Math.PI * 2);
  context.stroke();
  if (!fused) {
    context.strokeStyle = '#ffffff48';
    context.lineWidth = SIZE * 0.018;
    context.beginPath();
    context.arc(center, center, outer - SIZE * 0.025, Math.PI * 1.03, Math.PI * 1.68);
    context.stroke();
  }
  return image;
}

export function drawBeads(context: CanvasRenderingContext2D, chart: ChartPixels, cell: number, state: BeadState = 'round') {
  const { width, height, indices, palette } = chart;
  const fused = state === 'fused';
  const sprites = new Map<number, HTMLCanvasElement>();
  context.save();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = indices[y * width + x];
      if (index === 65535) continue;
      const mask = fused ? neighborMask(indices, width, height, x, y) : 0;
      const key = index * 16 + mask;
      let image = sprites.get(key);
      if (!image) {
        image = sprite(palette[index], fused, mask, context.canvas.ownerDocument);
        sprites.set(key, image);
      }
      context.drawImage(image, x * cell, y * cell, cell, cell);
    }
  }
  context.restore();
}
