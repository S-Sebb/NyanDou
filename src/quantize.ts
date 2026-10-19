// D65 sRGB / CIELAB. Distance uses CIE76, not RGB channel distance.
import type { RGB, Lab, BeadColor, Chart } from './types.ts';
interface Point { rgb: RGB; lab: Lab; count: number }

export function rgbToLab(rgb: RGB): Lab {
  const [r, g, b] = rgb.map(v => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const f = (v: number) => v > 216 / 24389 ? Math.cbrt(v) : (24389 / 27 * v + 16) / 116;
  const x = f((r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047);
  const y = f(r * 0.2126729 + g * 0.7151522 + b * 0.0721750);
  const z = f((r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function labToRgb([l, a, b]: Lab): RGB {
  const y = (l + 16) / 116;
  const inverse = (v: number) => v ** 3 > 216 / 24389 ? v ** 3 : (116 * v - 16) * 27 / 24389;
  const x = inverse(y + a / 500) * 0.95047;
  const yy = inverse(y);
  const z = inverse(y - b / 200) * 1.08883;
  return [x * 3.2404542 - yy * 1.5371385 - z * 0.4985314,
    -x * 0.9692660 + yy * 1.8760108 + z * 0.0415560,
    x * 0.0556434 - yy * 0.2040259 + z * 1.0572252].map(v => {
    const srgb = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.round(Math.max(0, Math.min(1, srgb)) * 255);
  }) as RGB;
}

const distance = (a: Lab, b: Lab) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const keyOf = (rgb: RGB) => (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];

function nearest(lab: Lab, centers: Lab[]) {
  let best = 0;
  let score = Infinity;
  for (let i = 0; i < centers.length; i++) {
    const d = distance(lab, centers[i]);
    if (d < score) { best = i; score = d; }
  }
  return best;
}

function box(points: Point[]) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let weight = 0;
  for (const p of points) {
    weight += p.count;
    for (let j = 0; j < 3; j++) {
      min[j] = Math.min(min[j], p.lab[j]);
      max[j] = Math.max(max[j], p.lab[j]);
    }
  }
  const spans = max.map((v, j) => v - min[j]);
  const axis = spans.indexOf(Math.max(...spans));
  return { points, weight, axis, score: points.length > 1 ? spans[axis] * Math.sqrt(weight) : 0 };
}

function mean(points: Point[]): Lab {
  const sum = [0, 0, 0];
  let weight = 0;
  for (const p of points) {
    weight += p.count;
    for (let j = 0; j < 3; j++) sum[j] += p.lab[j] * p.count;
  }
  return sum.map(v => v / weight) as Lab;
}

export function quantize(rgba: Uint8ClampedArray, width: number, height: number, maxColors = 24, colorCard: BeadColor[] | null = null): Chart {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || rgba.length !== width * height * 4) {
    throw new Error('图片尺寸与像素数据不一致');
  }
  if (!Number.isInteger(maxColors) || maxColors < 2 || maxColors > 256) throw new Error('颜色上限必须为 2–256');
  const histogram = new Map<number, Point>();
  const keys = new Int32Array(width * height).fill(-1);
  let empty = 0;
  for (let i = 0; i < keys.length; i++) {
    const alpha = rgba[i * 4 + 3] / 255;
    if (!alpha) { empty++; continue; }
    // Partial transparency is composited on white; fully transparent cells stay empty.
    const rgb = [0, 1, 2].map(j => Math.round(rgba[i * 4 + j] * alpha + 255 * (1 - alpha))) as RGB;
    const key = keyOf(rgb);
    keys[i] = key;
    const existing = histogram.get(key);
    if (existing) existing.count++;
    else histogram.set(key, { rgb, lab: rgbToLab(rgb), count: 1 });
  }
  const points = [...histogram.values()];
  const limit = Math.min(maxColors, empty ? 255 : 256, colorCard?.length ?? 256);
  const cardLabs = colorCard?.map(color => rgbToLab(color.rgb));
  const matches = cardLabs ? [...new Set(points.map(p => nearest(p.lab, cardLabs)))] : null;
  let palette: RGB[] = [];
  let codes: string[] = [];
  if (colorCard && matches && matches.length <= limit) {
    palette = matches.map(i => colorCard[i].rgb);
    codes = matches.map(i => colorCard[i].code);
  } else if (!colorCard && points.length <= limit) palette = points.map(p => p.rgb);
  else {
    const boxes = [box(points)];
    while (boxes.length < limit) {
      let split = 0;
      for (let i = 1; i < boxes.length; i++) if (boxes[i].score > boxes[split].score) split = i;
      const current = boxes[split];
      if (!current.score) break;
      current.points.sort((a, b) => a.lab[current.axis] - b.lab[current.axis]);
      let cumulative = 0;
      let midpoint = 1;
      for (let i = 0; i < current.points.length - 1; i++) {
        cumulative += current.points[i].count;
        midpoint = i + 1;
        if (cumulative >= current.weight / 2) break;
      }
      boxes.splice(split, 1, box(current.points.slice(0, midpoint)), box(current.points.slice(midpoint)));
    }
    let centers = boxes.map(b => mean(b.points));
    for (let iteration = 0; iteration < 8; iteration++) {
      const groups: Point[][] = centers.map(() => []);
      for (const p of points) groups[nearest(p.lab, centers)].push(p);
      const updated = groups.map((g, i) => {
        const center = g.length ? mean(g) : centers[i];
        return cardLabs ? cardLabs[nearest(center, cardLabs)] : center;
      });
      const moved = updated.some((v, i) => distance(v, centers[i]) > 0.01);
      centers = updated;
      if (!moved) break;
    }
    if (colorCard) {
      const selected = [...new Set(centers.map(c => nearest(c, cardLabs!)))];
      palette = selected.map(i => colorCard[i].rgb);
      codes = selected.map(i => colorCard[i].code);
    } else {
      palette = [...new Map(centers.map(c => {
        const rgb = labToRgb(c);
        return [keyOf(rgb), rgb];
      })).values()];
    }
  }
  const labs = palette.map(rgbToLab);
  const assignments = new Map<number, number>();
  const counts = palette.map(() => 0);
  for (const [key, p] of histogram) {
    const index = nearest(p.lab, labs);
    assignments.set(key, index);
    counts[index] += p.count;
  }
  // Stable chart labels: most-used color first. Remove unused entries.
  const order = palette.map((_, i) => i).filter(i => counts[i]).sort((a, b) => counts[b] - counts[a] || a - b);
  const remap = new Map(order.map((old, index) => [old, index]));
  const indices = new Uint16Array(keys.length);
  for (let i = 0; i < keys.length; i++) indices[i] = keys[i] === -1 ? 65535 : remap.get(assignments.get(keys[i])!)!;
  return { width, height, palette: order.map(i => palette[i]), counts: order.map(i => counts[i]), indices, empty,
    ...(colorCard ? { codes: order.map(i => codes[i]) } : {}) };
}
