import type { ChartPixels, RGB } from './types.ts';

export function toHex(rgb: RGB): string {
  return '#' + rgb.map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** The MARD code when the chart uses the MARD card, otherwise a chart-local number such as `001`. */
export function colorLabel(chart: Pick<ChartPixels, 'codes'>, index: number): string {
  return chart.codes?.[index] ?? String(index + 1).padStart(3, '0');
}

export function formatCount(value: number): string {
  return value.toLocaleString('zh-CN');
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
