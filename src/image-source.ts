// Turning the user's image into chart dimensions, worker input and a thumbnail.
import { releaseCanvas } from './canvas.ts';
import { DETAIL_SAMPLES_PER_AXIS, MAX_BEADS_PER_SIDE } from './constants.ts';
import type { DesignStyle } from './types.ts';

export type ImageSource = HTMLCanvasElement | ImageBitmap;

const THUMBNAIL_SIZE = 108;

/** Keeps the image's aspect ratio; the longer side never exceeds MAX_BEADS_PER_SIDE. */
export function chartSize(imageWidth: number, imageHeight: number, requestedWidth: number) {
  const width = Math.min(requestedWidth, Math.max(1, Math.round(MAX_BEADS_PER_SIDE * imageWidth / imageHeight)));
  const height = Math.min(MAX_BEADS_PER_SIDE, Math.max(1, Math.round(width * imageHeight / imageWidth)));
  return { width, height };
}

/**
 * Scales the image down to the chart size with the browser's high-quality smoothing.
 * The outline-first style keeps a 4 × 4 grid of samples per bead for `stylize`.
 */
export function sampleImage(
  image: ImageSource,
  width: number,
  height: number,
  designStyle: DesignStyle,
): Uint8ClampedArray<ArrayBuffer> {
  const samplesPerAxis = designStyle === 'pixel' ? DETAIL_SAMPLES_PER_AXIS : 1;
  const canvas = document.createElement('canvas');
  try {
    canvas.width = width * samplesPerAxis;
    canvas.height = height * samplesPerAxis;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('浏览器无法创建图片处理画布。');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return context.getImageData(0, 0, canvas.width, canvas.height).data;
  } finally {
    releaseCanvas(canvas);
  }
}

/** A small PNG data URL whose longer side is THUMBNAIL_SIZE, even for very tall images. */
export function thumbnailUrl(image: ImageSource): string {
  const canvas = document.createElement('canvas');
  const heightAtFullWidth = Math.max(1, Math.round(THUMBNAIL_SIZE * image.height / image.width));
  if (heightAtFullWidth <= THUMBNAIL_SIZE) {
    canvas.width = THUMBNAIL_SIZE;
    canvas.height = heightAtFullWidth;
  } else {
    canvas.width = Math.max(1, Math.round(THUMBNAIL_SIZE * image.width / image.height));
    canvas.height = THUMBNAIL_SIZE;
  }
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}
