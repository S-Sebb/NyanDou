export type RGB = [number, number, number];
export type Lab = [number, number, number];
export type PreviewMode = 'grid' | 'pixel' | 'beads' | 'original';
export type BeadState = 'round' | 'fused';
export type PaletteMode = 'mard221' | 'auto';
export type DesignStyle = 'pixel' | 'faithful';
export type ExportFormat = 'chart' | 'pixel';
export type DrawingContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface BeadColor {
  code: string;
  rgb: RGB;
}

/** What is needed to draw a chart. */
export interface ChartPixels {
  width: number;
  height: number;
  palette: RGB[];
  /** One palette index per cell, row by row; EMPTY_CELL marks a cell without a bead. */
  indices: Uint16Array<ArrayBuffer>;
  /** Bead codes parallel to `palette`; only present for charts matched to a color card. */
  codes?: string[];
}

export interface Chart extends ChartPixels {
  /** Beads needed per palette color. */
  counts: number[];
  /** Number of empty cells. */
  empty: number;
}

export interface QuantizeRequest {
  rgba: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
  maxColors: number;
  paletteMode: PaletteMode;
  designStyle: DesignStyle;
}

export interface ErrorResponse {
  error: string;
}

export type QuantizeResponse = { result: Chart } | ErrorResponse;

export interface ExportRequest {
  chart: Chart;
  format: ExportFormat;
}

export type ExportResponse = { blob: Blob } | ErrorResponse;

/** The worker side of a typed message channel, without the Window postMessage overloads. */
export interface WorkerPort<Request, Response> {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(message: Response, transfer?: Transferable[]): void;
}
