// The sample landscape shown before the first upload, drawn in the browser.
type Point = [x: number, y: number];

export const DEMO_NAME = '日落山谷';

const WIDTH = 640;
const HEIGHT = 480;

const SKY_GRADIENT: [offset: number, color: string][] = [
  [0, '#536b92'],
  [0.43, '#dda789'],
  [0.72, '#f0ca8e'],
  [1, '#f2d3a1'],
];

/** Mountain ridges from the farthest to the nearest. */
const RIDGES: { color: string; points: Point[] }[] = [
  { color: '#9394a3', points: [[0, 280], [90, 210], [170, 265], [275, 168], [395, 301], [510, 245], [640, 300]] },
  { color: '#6f8291', points: [[0, 330], [120, 275], [215, 330], [375, 249], [525, 346], [640, 288]] },
  { color: '#456871', points: [[0, 348], [85, 308], [180, 375], [320, 316], [440, 370], [560, 332], [640, 375]] },
  { color: '#2d5157', points: [[0, 382], [160, 368], [250, 414], [340, 384], [445, 409], [570, 388], [640, 415]] },
];

const TREES: [x: number, y: number, size: number][] = [
  [45, 456, 130],
  [98, 430, 91],
  [142, 463, 142],
  [535, 475, 130],
  [594, 445, 100],
  [488, 441, 64],
];

function drawSky(context: CanvasRenderingContext2D) {
  const sky = context.createLinearGradient(0, 0, 0, HEIGHT);
  for (const [offset, color] of SKY_GRADIENT) sky.addColorStop(offset, color);
  context.fillStyle = sky;
  context.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawSun(context: CanvasRenderingContext2D) {
  context.fillStyle = '#ffe3a4';
  context.beginPath();
  context.arc(390, 190, 57, 0, Math.PI * 2);
  context.fill();
}

function drawRidge(context: CanvasRenderingContext2D, color: string, points: Point[]) {
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(0, HEIGHT);
  for (const [x, y] of points) context.lineTo(x, y);
  context.lineTo(WIDTH, HEIGHT);
  context.closePath();
  context.fill();
}

/** A winding trail from the valley floor towards the viewer. */
function drawTrail(context: CanvasRenderingContext2D) {
  context.fillStyle = '#d4bb99';
  context.beginPath();
  context.moveTo(390, 360);
  context.bezierCurveTo(260, 415, 460, 410, 360, 480);
  context.lineTo(405, 480);
  context.bezierCurveTo(491, 418, 286, 419, 400, 360);
  context.fill();
}

/** A trunk under three stacked triangles; `y` is the ground line. */
function drawTree(context: CanvasRenderingContext2D, x: number, y: number, size: number) {
  context.fillStyle = '#203f44';
  context.fillRect(x - size * 0.04, y - size * 0.2, size * 0.08, size * 0.35);
  for (let tier = 0; tier < 3; tier++) {
    const top = y - size + tier * size * 0.2;
    const halfWidth = size * (0.2 + tier * 0.05);
    context.beginPath();
    context.moveTo(x, top);
    context.lineTo(x - halfWidth, top + size * 0.5);
    context.lineTo(x + halfWidth, top + size * 0.5);
    context.fill();
  }
}

export function createDemoImage(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d')!;
  drawSky(context);
  drawSun(context);
  for (const { color, points } of RIDGES) drawRidge(context, color, points);
  drawTrail(context);
  for (const [x, y, size] of TREES) drawTree(context, x, y, size);
  return canvas;
}
