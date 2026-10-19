// "Outline first" downsampling. Every bead is sampled as a 4 × 4 grid of pixels whose
// colors are split into two clusters. Coherent dark details (outlines, eyes, mouths)
// win over a blurred average, while low-contrast texture is simplified. Nothing is
// invented and the framing is never changed.
import { squaredDistance } from './color.ts';
import { DETAIL_SAMPLES_PER_AXIS } from './constants.ts';
import type { RGB } from './types.ts';

interface Sample {
  rgb: RGB;
  alpha: number;
  /** Position inside the bead's sample grid. */
  x: number;
  y: number;
}

type Pair<T> = [T, T];

const SAMPLES_PER_BEAD = DETAIL_SAMPLES_PER_AXIS ** 2;
const CLUSTER_ITERATIONS = 3;
/** Clusters closer than this RGB distance are one texture and get averaged. */
const MIN_CLUSTER_DISTANCE = 40;
/** A detail must be at least this much darker (in luma) than its surroundings. */
const MIN_DETAIL_CONTRAST = 50;
/** A detail needs this many samples that touch another detail sample; one speck is noise. */
const MIN_CONNECTED_DETAIL_SAMPLES = 3;
/** Beads with fewer opaque samples are left empty, which trims fringes at transparent edges. */
const MIN_OPAQUE_SAMPLES = 6;

/** Rec. 709 luma of the gamma-encoded color. */
const luma = (rgb: RGB) => rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;

function weightedAverage(samples: Sample[]): RGB {
  const sum = [0, 0, 0];
  let weight = 0;
  for (const sample of samples) {
    weight += sample.alpha;
    for (let channel = 0; channel < 3; channel++) sum[channel] += sample.rgb[channel] * sample.alpha;
  }
  return sum.map(value => value / weight) as RGB;
}

function farthestSample(samples: Sample[], target: RGB): Sample {
  return samples.reduce((a, b) => squaredDistance(a.rgb, target) > squaredDistance(b.rgb, target) ? a : b);
}

/** Two-means clustering, seeded with the two most different samples. */
function splitIntoTwoClusters(samples: Sample[], mean: RGB) {
  const first = farthestSample(samples, mean);
  const second = farthestSample(samples, first.rgb);
  let centers: Pair<RGB> = [first.rgb, second.rgb];
  let clusters: Pair<Sample[]> = [[], []];
  for (let iteration = 0; iteration < CLUSTER_ITERATIONS; iteration++) {
    clusters = [[], []];
    for (const sample of samples) {
      const closerToFirst = squaredDistance(sample.rgb, centers[0]) <= squaredDistance(sample.rgb, centers[1]);
      clusters[closerToFirst ? 0 : 1].push(sample);
    }
    centers = clusters.map((cluster, i) => cluster.length ? weightedAverage(cluster) : centers[i]) as Pair<RGB>;
  }
  return { centers, clusters };
}

function countConnectedSamples(samples: Sample[]): number {
  const touches = (a: Sample, b: Sample) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
  return samples.filter(sample => samples.some(other => touches(sample, other))).length;
}

function chooseBeadColor(samples: Sample[]): RGB {
  const mean = weightedAverage(samples);
  const { centers, clusters } = splitIntoTwoClusters(samples, mean);
  const hasTwoColors = clusters[0].length && clusters[1].length
    && squaredDistance(...centers) > MIN_CLUSTER_DISTANCE ** 2;
  if (!hasTwoColors) return mean;

  const dark = luma(centers[0]) < luma(centers[1]) ? 0 : 1;
  const light = 1 - dark;
  const dominant = clusters[0].length >= clusters[1].length ? 0 : 1;
  // Keeping a connected dark accent makes eyes, mouths and outlines readable even
  // when they cover less than half of the bead.
  const isDetail = luma(centers[light]) - luma(centers[dark]) > MIN_DETAIL_CONTRAST
    && countConnectedSamples(clusters[dark]) >= MIN_CONNECTED_DETAIL_SAMPLES;
  return centers[isDetail ? dark : dominant];
}

/**
 * @param rgba The image scaled to `width × height` beads with 4 × 4 samples per bead.
 * @returns One RGBA pixel per bead.
 */
export function stylize(rgba: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  if (rgba.length !== width * height * SAMPLES_PER_BEAD * 4) throw new Error('细节采样尺寸不正确');
  const output = new Uint8ClampedArray(width * height * 4);
  const samplesPerRow = width * DETAIL_SAMPLES_PER_AXIS;

  for (let beadY = 0; beadY < height; beadY++) {
    for (let beadX = 0; beadX < width; beadX++) {
      const samples: Sample[] = [];
      let alphaSum = 0;
      for (let y = 0; y < DETAIL_SAMPLES_PER_AXIS; y++) {
        for (let x = 0; x < DETAIL_SAMPLES_PER_AXIS; x++) {
          const sampleRow = beadY * DETAIL_SAMPLES_PER_AXIS + y;
          const sampleColumn = beadX * DETAIL_SAMPLES_PER_AXIS + x;
          const offset = (sampleRow * samplesPerRow + sampleColumn) * 4;
          const alpha = rgba[offset + 3];
          alphaSum += alpha;
          if (alpha) samples.push({ rgb: [rgba[offset], rgba[offset + 1], rgba[offset + 2]], alpha, x, y });
        }
      }
      if (!samples.length) continue;

      const offset = (beadY * width + beadX) * 4;
      output.set(chooseBeadColor(samples).map(Math.round), offset);
      // Snap well-covered edges to the average opacity of their opaque samples.
      output[offset + 3] = samples.length >= MIN_OPAQUE_SAMPLES ? Math.round(alphaSum / samples.length) : 0;
    }
  }
  return output;
}
