// sRGB (D65) <-> CIELAB conversion and color distances.
import type { Lab, RGB } from './types.ts';

const D65_WHITE_X = 0.95047;
const D65_WHITE_Z = 1.08883;
const LAB_EPSILON = 216 / 24389;
const LAB_KAPPA = 24389 / 27;

/** Converts an 8-bit sRGB channel to linear light in 0–1. */
export function srgbToLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value: number): number {
  const srgb = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, srgb)) * 255);
}

/** WCAG relative luminance in 0–1. */
export function relativeLuminance(rgb: RGB): number {
  const [r, g, b] = rgb.map(srgbToLinear);
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

export function rgbToLab(rgb: RGB): Lab {
  const [r, g, b] = rgb.map(srgbToLinear);
  const f = (t: number) => t > LAB_EPSILON ? Math.cbrt(t) : (LAB_KAPPA * t + 16) / 116;
  const x = f((r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / D65_WHITE_X);
  const y = f(r * 0.2126729 + g * 0.7151522 + b * 0.0721750);
  const z = f((r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / D65_WHITE_Z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function labToRgb([l, a, b]: Lab): RGB {
  const fInverse = (t: number) => t ** 3 > LAB_EPSILON ? t ** 3 : (116 * t - 16) * 27 / 24389;
  const fy = (l + 16) / 116;
  const x = fInverse(fy + a / 500) * D65_WHITE_X;
  const y = fInverse(fy);
  const z = fInverse(fy - b / 200) * D65_WHITE_Z;
  return [
    linearToSrgb(x * 3.2404542 - y * 1.5371385 - z * 0.4985314),
    linearToSrgb(-x * 0.9692660 + y * 1.8760108 + z * 0.0415560),
    linearToSrgb(x * 0.0556434 - y * 0.2040259 + z * 1.0572252),
  ];
}

/** Squared Euclidean distance; on Lab colors this is the (squared) CIE76 difference. */
export function squaredDistance(a: Readonly<RGB | Lab>, b: Readonly<RGB | Lab>): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}
