// The "colors to prepare" list below the preview.
import { colorLabel, formatCount, toHex } from './format.ts';
import type { Chart, RGB } from './types.ts';

function createElement<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function createPaletteItem(chart: Chart, rgb: RGB, index: number): HTMLElement {
  const swatch = createElement('span', 'swatch');
  swatch.style.backgroundColor = toHex(rgb);
  const meta = createElement('div', 'palette-meta');
  meta.append(createElement('strong', undefined, colorLabel(chart, index)), createElement('span', undefined, toHex(rgb)));
  const count = createElement('span', 'palette-number', `${formatCount(chart.counts[index])} 颗`);
  const item = createElement('div', 'palette-item');
  item.append(swatch, meta, count);
  return item;
}

export function renderPaletteList(container: HTMLElement, chart: Chart): void {
  if (!chart.palette.length) {
    container.replaceChildren(createElement('p', 'empty-palette', '图片完全透明，没有需要拼放的豆子。'));
    return;
  }
  container.replaceChildren(...chart.palette.map((rgb, index) => createPaletteItem(chart, rgb, index)));
}
