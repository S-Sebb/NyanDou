// Typed handles for every page element the app controls, looked up once at startup.
import type { BeadState, PreviewMode } from './types.ts';

function element<T extends HTMLElement>(id: string, type: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`缺少页面元素：${id}`);
  return found;
}

export const ui = {
  // 01 Image source
  dropzone: element('dropzone', HTMLLabelElement),
  fileInput: element('file-input', HTMLInputElement),
  fileName: element('file-name', HTMLElement),
  sourceThumbnail: element('source-thumbnail', HTMLImageElement),
  demoButton: element('demo-button', HTMLButtonElement),

  // 02 Settings
  colorCard: element('color-card', HTMLSelectElement),
  designStyle: element('design-style', HTMLSelectElement),
  widthPresets: [...document.querySelectorAll<HTMLButtonElement>('button[data-width]')],
  widthInput: element('width-input', HTMLInputElement),
  widthValue: element('width-value', HTMLOutputElement),
  colorsInput: element('colors-input', HTMLInputElement),
  colorsValue: element('colors-value', HTMLOutputElement),
  colorsMax: element('colors-max', HTMLElement),
  colorPresets: [...document.querySelectorAll<HTMLButtonElement>('button[data-colors]')],
  fullColorsPreset: element('full-colors', HTMLButtonElement),
  colorNote: element('color-note', HTMLElement),

  // 03 Export
  exportChart: element('export-chart', HTMLButtonElement),
  exportPixel: element('export-pixel', HTMLButtonElement),
  exportCsv: element('export-csv', HTMLButtonElement),
  exportStatus: element('export-status', HTMLElement),

  // Workspace summary
  status: element('status', HTMLElement),
  sizeStat: element('size-stat', HTMLElement),
  colorsStat: element('colors-stat', HTMLElement),
  colorCardStat: element('color-card-stat', HTMLElement),
  beadsStat: element('beads-stat', HTMLElement),

  // Preview
  modeTabs: {
    grid: element('grid-tab', HTMLButtonElement),
    pixel: element('pixel-tab', HTMLButtonElement),
    beads: element('beads-tab', HTMLButtonElement),
    original: element('original-tab', HTMLButtonElement),
  } satisfies Record<PreviewMode, HTMLButtonElement>,
  symbolsInput: element('symbols-input', HTMLInputElement),
  beadSettings: element('bead-settings', HTMLElement),
  beadStateButtons: {
    round: element('bead-round', HTMLButtonElement),
    fused: element('bead-fused', HTMLButtonElement),
  } satisfies Record<BeadState, HTMLButtonElement>,
  viewport: element('canvas-viewport', HTMLElement),
  canvas: element('preview-canvas', HTMLCanvasElement),
  previewHint: element('preview-hint', HTMLElement),
  fitButton: element('fit-button', HTMLButtonElement),
  zoomInput: element('zoom-input', HTMLInputElement),
  zoomValue: element('zoom-value', HTMLOutputElement),

  // Palette list
  paletteCount: element('palette-count', HTMLElement),
  paletteLabel: element('palette-label', HTMLElement),
  paletteList: element('palette-list', HTMLElement),
  paletteDisclaimer: element('palette-disclaimer', HTMLElement),

  // Error banner
  error: element('error', HTMLElement),
  errorMessage: element('error-message', HTMLElement),
  errorDismiss: element('error-dismiss', HTMLButtonElement),
};
