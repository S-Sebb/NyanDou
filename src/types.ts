export type RGB = [number, number, number];
export type Lab = [number, number, number];
export type PreviewMode = 'grid' | 'pixel' | 'beads' | 'original';
export type BeadState = 'round' | 'fused';
export type PaletteMode = 'mard221' | 'auto';
export type DesignStyle = 'pixel' | 'faithful';
export type ExportFormat = 'chart' | 'pixel';
export type DrawingContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface BeadColor { code: string; rgb: RGB }
export interface ChartPixels {
  width: number;
  height: number;
  palette: RGB[];
  indices: Uint16Array<ArrayBuffer>;
  codes?: string[];
}
export interface Chart extends ChartPixels {
  counts: number[];
  empty: number;
  paletteMode?: PaletteMode;
}
export interface QuantizeRequest {
  rgba: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
  maxColors: number;
  paletteMode: PaletteMode;
  designStyle: DesignStyle;
}
export type QuantizeResponse = { result: Chart } | { error: string };
export interface ExportRequest { chart: Chart; format: ExportFormat }
export type ExportResponse = { blob: Blob } | { error: string };

// A narrow, typed message port avoids mixing Window and Worker postMessage APIs.
export interface WorkerPort<Request, Response> {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(message: Response, transfer?: Transferable[]): void;
}
