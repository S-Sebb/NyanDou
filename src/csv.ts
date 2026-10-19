import { colorLabel, toHex } from './format.ts';
import type { Chart } from './types.ts';

/** Lets spreadsheet apps detect UTF-8 and show the Chinese header correctly. */
const BYTE_ORDER_MARK = '\ufeff';

/** One row per color: label, HEX, R, G, B and bead count. */
export function beadListCsv(chart: Chart): string {
  const header = chart.codes ? 'MARD色号,HEX,R,G,B,颗数' : '图纸编号（非品牌色号）,HEX,R,G,B,颗数';
  const rows = chart.palette.map((rgb, index) =>
    [colorLabel(chart, index), toHex(rgb), ...rgb, chart.counts[index]].join(','));
  return BYTE_ORDER_MARK + [header, ...rows].join('\r\n');
}
