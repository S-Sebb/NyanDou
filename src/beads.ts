// Illustrative top-down rendering of beads before and after ironing. Both states use
// the chart's exact cells; this is neither a physical simulation of melting plastic
// nor a calibrated color proof.
import { EMPTY_CELL } from './constants.ts';
import type { BeadState, ChartPixels, RGB } from './types.ts';

/** Bits of a neighbor mask: which adjacent cells hold a bead. */
const UP = 1;
const RIGHT = 2;
const DOWN = 4;
const LEFT = 8;

/** Sprites are drawn once per color and shape at this size, then scaled to the cell. */
const SPRITE_SIZE = 64;
/** A round bead leaves a small gap to its neighbors. */
const ROUND_BEAD_RADIUS = SPRITE_SIZE * 0.455;

export function neighborMask(indices: Uint16Array, width: number, height: number, x: number, y: number): number {
  const occupied = (column: number, row: number) =>
    column >= 0 && column < width && row >= 0 && row < height && indices[row * width + column] !== EMPTY_CELL;
  return (occupied(x, y - 1) ? UP : 0)
    | (occupied(x + 1, y) ? RIGHT : 0)
    | (occupied(x, y + 1) ? DOWN : 0)
    | (occupied(x - 1, y) ? LEFT : 0);
}

/** Mixes the color towards white (amount > 0) or black (amount < 0). */
function shade(rgb: RGB, amount: number): string {
  const target = amount > 0 ? 255 : 0;
  const mixed = rgb.map(value => Math.round(value + (target - value) * Math.abs(amount)));
  return `rgb(${mixed.join(',')})`;
}

/**
 * A rounded square that reaches the cell edge towards occupied neighbors, so fused
 * beads join into one piece. Corners stay round only where both sides are open.
 */
function traceFusedOutline(context: CanvasRenderingContext2D, mask: number) {
  const left = mask & LEFT ? 0 : SPRITE_SIZE * 0.04;
  const top = mask & UP ? 0 : SPRITE_SIZE * 0.04;
  const right = mask & RIGHT ? SPRITE_SIZE : SPRITE_SIZE * 0.96;
  const bottom = mask & DOWN ? SPRITE_SIZE : SPRITE_SIZE * 0.96;
  const radius = SPRITE_SIZE * 0.16;
  const topLeft = mask & (UP | LEFT) ? 0 : radius;
  const topRight = mask & (UP | RIGHT) ? 0 : radius;
  const bottomRight = mask & (DOWN | RIGHT) ? 0 : radius;
  const bottomLeft = mask & (DOWN | LEFT) ? 0 : radius;
  context.moveTo(left + topLeft, top);
  context.lineTo(right - topRight, top);
  context.quadraticCurveTo(right, top, right, top + topRight);
  context.lineTo(right, bottom - bottomRight);
  context.quadraticCurveTo(right, bottom, right - bottomRight, bottom);
  context.lineTo(left + bottomLeft, bottom);
  context.quadraticCurveTo(left, bottom, left, bottom - bottomLeft);
  context.lineTo(left, top + topLeft);
  context.quadraticCurveTo(left, top, left + topLeft, top);
  context.closePath();
}

function drawBeadBody(context: CanvasRenderingContext2D, rgb: RGB, fused: boolean, mask: number) {
  const center = SPRITE_SIZE / 2;
  const body = context.createLinearGradient(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  body.addColorStop(0, shade(rgb, fused ? 0.10 : 0.28));
  body.addColorStop(0.45, shade(rgb, 0));
  body.addColorStop(1, shade(rgb, fused ? -0.07 : -0.22));
  context.save();
  if (!fused) {
    context.shadowColor = '#332a2638';
    context.shadowBlur = SPRITE_SIZE * 0.035;
    context.shadowOffsetY = SPRITE_SIZE * 0.025;
  }
  context.beginPath();
  if (fused) traceFusedOutline(context, mask);
  else context.arc(center, center, ROUND_BEAD_RADIUS, 0, Math.PI * 2);
  context.fillStyle = body;
  context.fill();
  context.restore();
}

/** Cuts a truly transparent hole, so holes and empty cells show the same background. */
function drawBeadHole(context: CanvasRenderingContext2D, rgb: RGB, fused: boolean) {
  const center = SPRITE_SIZE / 2;
  const radius = SPRITE_SIZE * (fused ? 0.075 : 0.17);
  context.save();
  context.globalCompositeOperation = 'destination-out';
  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.fill();
  context.restore();

  const wall = context.createLinearGradient(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  wall.addColorStop(0, shade(rgb, -0.46));
  wall.addColorStop(1, shade(rgb, 0.14));
  context.strokeStyle = wall;
  context.lineWidth = SPRITE_SIZE * (fused ? 0.022 : 0.045);
  context.beginPath();
  context.arc(center, center, radius + context.lineWidth / 2, 0, Math.PI * 2);
  context.stroke();
}

function drawHighlight(context: CanvasRenderingContext2D) {
  const center = SPRITE_SIZE / 2;
  context.strokeStyle = '#ffffff48';
  context.lineWidth = SPRITE_SIZE * 0.018;
  context.beginPath();
  context.arc(center, center, ROUND_BEAD_RADIUS - SPRITE_SIZE * 0.025, Math.PI * 1.03, Math.PI * 1.68);
  context.stroke();
}

function createBeadSprite(document: Document, rgb: RGB, fused: boolean, mask: number): HTMLCanvasElement {
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = SPRITE_SIZE;
  const context = sprite.getContext('2d')!;
  drawBeadBody(context, rgb, fused, mask);
  drawBeadHole(context, rgb, fused);
  if (!fused) drawHighlight(context);
  return sprite;
}

export function drawBeads(context: CanvasRenderingContext2D, chart: ChartPixels, cell: number, state: BeadState = 'round'): void {
  const { width, height, indices, palette } = chart;
  const fused = state === 'fused';
  // Create sprites in the target canvas's document, which may be another frame's.
  const document = context.canvas.ownerDocument;
  const sprites = new Map<number, HTMLCanvasElement>();
  context.save();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = indices[y * width + x];
      if (index === EMPTY_CELL) continue;
      const mask = fused ? neighborMask(indices, width, height, x, y) : 0;
      const key = index * 16 + mask;
      let sprite = sprites.get(key);
      if (!sprite) {
        sprite = createBeadSprite(document, palette[index], fused, mask);
        sprites.set(key, sprite);
      }
      context.drawImage(sprite, x * cell, y * cell, cell, cell);
    }
  }
  context.restore();
}
