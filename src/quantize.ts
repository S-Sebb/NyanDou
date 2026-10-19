// Reduces an image to a limited palette, either free colors or a fixed bead color card.
// Colors are compared in CIELAB with the CIE76 distance, not in RGB.
import { labToRgb, rgbToLab, squaredDistance } from './color.ts';
import { EMPTY_CELL } from './constants.ts';
import type { BeadColor, Chart, Lab, RGB } from './types.ts';

/** One distinct opaque color of the image and how many cells use it. */
interface HistogramEntry {
  rgb: RGB;
  lab: Lab;
  count: number;
}

interface Palette {
  colors: RGB[];
  /** Bead codes, parallel to `colors`; only present when matching a color card. */
  codes?: string[];
}

/** Entries of the indexed PNG palette, which is the hard cap for any chart. */
const PNG_PALETTE_SIZE = 256;
const MIN_COLORS = 2;
const KMEANS_MAX_ITERATIONS = 8;
const KMEANS_CONVERGED_DISTANCE = 0.01;
const NO_COLOR = -1;

const colorKey = (rgb: RGB) => (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
const unique = (values: number[]) => [...new Set(values)];

function nearestIndex(lab: Lab, candidates: Lab[]): number {
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const distance = squaredDistance(lab, candidates[i]);
    if (distance < bestDistance) {
      bestIndex = i;
      bestDistance = distance;
    }
  }
  return bestIndex;
}

function weightedMean(entries: HistogramEntry[]): Lab {
  const sum = [0, 0, 0];
  let weight = 0;
  for (const entry of entries) {
    weight += entry.count;
    for (let axis = 0; axis < 3; axis++) sum[axis] += entry.lab[axis] * entry.count;
  }
  return sum.map(value => value / weight) as Lab;
}

/**
 * Collects the distinct colors of the image and remembers each cell's color key.
 * Partial transparency is composited on white; fully transparent cells stay empty.
 */
function buildHistogram(rgba: Uint8ClampedArray, cellCount: number) {
  const histogram = new Map<number, HistogramEntry>();
  const cellKeys = new Int32Array(cellCount).fill(NO_COLOR);
  let empty = 0;
  for (let cell = 0; cell < cellCount; cell++) {
    const alpha = rgba[cell * 4 + 3] / 255;
    if (!alpha) {
      empty++;
      continue;
    }
    const rgb = [0, 1, 2].map(channel => Math.round(rgba[cell * 4 + channel] * alpha + 255 * (1 - alpha))) as RGB;
    const key = colorKey(rgb);
    cellKeys[cell] = key;
    const existing = histogram.get(key);
    if (existing) existing.count++;
    else histogram.set(key, { rgb, lab: rgbToLab(rgb), count: 1 });
  }
  return { histogram, cellKeys, empty };
}

// --- Median cut: initial cluster centers -------------------------------------

interface ColorBox {
  entries: HistogramEntry[];
  weight: number;
  /** Lab axis with the widest spread, along which the box is split. */
  axis: number;
  /** Wide, heavily used boxes are split first; a single color cannot be split. */
  priority: number;
}

function createBox(entries: HistogramEntry[]): ColorBox {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let weight = 0;
  for (const entry of entries) {
    weight += entry.count;
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], entry.lab[axis]);
      max[axis] = Math.max(max[axis], entry.lab[axis]);
    }
  }
  const spans = max.map((value, axis) => value - min[axis]);
  const axis = spans.indexOf(Math.max(...spans));
  const priority = entries.length > 1 ? spans[axis] * Math.sqrt(weight) : 0;
  return { entries, weight, axis, priority };
}

function splitAtWeightedMedian(box: ColorBox): [ColorBox, ColorBox] {
  const sorted = box.entries.sort((a, b) => a.lab[box.axis] - b.lab[box.axis]);
  let cumulative = 0;
  let splitIndex = 1;
  for (let i = 0; i < sorted.length - 1; i++) {
    cumulative += sorted[i].count;
    splitIndex = i + 1;
    if (cumulative >= box.weight / 2) break;
  }
  return [createBox(sorted.slice(0, splitIndex)), createBox(sorted.slice(splitIndex))];
}

function medianCut(entries: HistogramEntry[], targetCount: number): Lab[] {
  const boxes = [createBox(entries)];
  while (boxes.length < targetCount) {
    let splitIndex = 0;
    for (let i = 1; i < boxes.length; i++) {
      if (boxes[i].priority > boxes[splitIndex].priority) splitIndex = i;
    }
    const box = boxes[splitIndex];
    if (!box.priority) break;
    boxes.splice(splitIndex, 1, ...splitAtWeightedMedian(box));
  }
  return boxes.map(box => weightedMean(box.entries));
}

// --- Weighted k-means: refine the centers ------------------------------------

/** `constrain` maps every updated center, e.g. onto the nearest card color. */
function refineCenters(entries: HistogramEntry[], initialCenters: Lab[], constrain: (center: Lab) => Lab): Lab[] {
  let centers = initialCenters;
  for (let iteration = 0; iteration < KMEANS_MAX_ITERATIONS; iteration++) {
    const clusters: HistogramEntry[][] = centers.map(() => []);
    for (const entry of entries) clusters[nearestIndex(entry.lab, centers)].push(entry);
    const updated = clusters.map((cluster, i) => constrain(cluster.length ? weightedMean(cluster) : centers[i]));
    const moved = updated.some((center, i) => squaredDistance(center, centers[i]) > KMEANS_CONVERGED_DISTANCE);
    centers = updated;
    if (!moved) break;
  }
  return centers;
}

// --- Palette selection -------------------------------------------------------

function chooseFreePalette(entries: HistogramEntry[], limit: number): Palette {
  if (entries.length <= limit) return { colors: entries.map(entry => entry.rgb) };
  const centers = refineCenters(entries, medianCut(entries, limit), center => center);
  // Distinct Lab centers can round to the same sRGB color; keep each color once.
  const colors = new Map(centers.map(center => {
    const rgb = labToRgb(center);
    return [colorKey(rgb), rgb];
  }));
  return { colors: [...colors.values()] };
}

function chooseCardPalette(entries: HistogramEntry[], limit: number, card: BeadColor[]): Palette {
  const cardLabs = card.map(color => rgbToLab(color.rgb));
  const nearestCardIndex = (lab: Lab) => nearestIndex(lab, cardLabs);
  const fromCard = (cardIndices: number[]): Palette => ({
    colors: cardIndices.map(i => card[i].rgb),
    codes: cardIndices.map(i => card[i].code),
  });

  // Plain nearest-color matching keeps the most detail, so use it when it fits the budget.
  const directMatches = unique(entries.map(entry => nearestCardIndex(entry.lab)));
  if (directMatches.length <= limit) return fromCard(directMatches);

  const centers = refineCenters(entries, medianCut(entries, limit), center => cardLabs[nearestCardIndex(center)]);
  return fromCard(unique(centers.map(nearestCardIndex)));
}

// --- Chart assembly ----------------------------------------------------------

/**
 * Maps every cell to its nearest palette color, drops unused colors and orders the
 * palette by usage (most used first), so chart labels are stable and meaningful.
 */
function buildChart(
  width: number,
  height: number,
  { histogram, cellKeys, empty }: ReturnType<typeof buildHistogram>,
  palette: Palette,
): Chart {
  const paletteLabs = palette.colors.map(rgbToLab);
  const paletteIndexByKey = new Map<number, number>();
  const counts = palette.colors.map(() => 0);
  for (const [key, entry] of histogram) {
    const index = nearestIndex(entry.lab, paletteLabs);
    paletteIndexByKey.set(key, index);
    counts[index] += entry.count;
  }

  const order = palette.colors
    .map((_, index) => index)
    .filter(index => counts[index])
    .sort((a, b) => counts[b] - counts[a] || a - b);
  const finalIndexOf = new Map(order.map((oldIndex, newIndex) => [oldIndex, newIndex]));

  const indices = new Uint16Array(cellKeys.length);
  for (let cell = 0; cell < cellKeys.length; cell++) {
    const key = cellKeys[cell];
    indices[cell] = key === NO_COLOR ? EMPTY_CELL : finalIndexOf.get(paletteIndexByKey.get(key)!)!;
  }

  const { codes } = palette;
  return {
    width,
    height,
    palette: order.map(i => palette.colors[i]),
    counts: order.map(i => counts[i]),
    indices,
    empty,
    ...(codes ? { codes: order.map(i => codes[i]) } : {}),
  };
}

/**
 * @param rgba One pixel per cell.
 * @param colorCard Restricts the palette to these bead colors; `null` allows any color.
 */
export function quantize(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  maxColors = 24,
  colorCard: BeadColor[] | null = null,
): Chart {
  const validSize = Number.isInteger(width) && Number.isInteger(height) && width >= 1 && height >= 1;
  if (!validSize || rgba.length !== width * height * 4) throw new Error('图片尺寸与像素数据不一致');
  if (!Number.isInteger(maxColors) || maxColors < MIN_COLORS || maxColors > PNG_PALETTE_SIZE) {
    throw new Error('颜色上限必须为 2–256');
  }

  const histogram = buildHistogram(rgba, width * height);
  const entries = [...histogram.histogram.values()];
  // Empty cells need a transparent slot of their own in the indexed PNG palette.
  const pngLimit = histogram.empty ? PNG_PALETTE_SIZE - 1 : PNG_PALETTE_SIZE;
  const limit = Math.min(maxColors, pngLimit, colorCard?.length ?? PNG_PALETTE_SIZE);
  const palette = colorCard ? chooseCardPalette(entries, limit, colorCard) : chooseFreePalette(entries, limit);
  return buildChart(width, height, histogram, palette);
}
