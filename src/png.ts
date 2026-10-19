// Dependency-free encoder for true 8-bit indexed PNGs (IHDR color type 3).
import { EMPTY_CELL } from './constants.ts';
import type { Chart, RGB } from './types.ts';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const BIT_DEPTH = 8;
const COLOR_TYPE_INDEXED = 3;
const FILTER_NONE = 0;
const WHITE: RGB = [255, 255, 255];

type Bytes = Uint8Array<ArrayBuffer>;

const encoder = new TextEncoder();

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Length, type, data and a CRC over type and data. */
function createChunk(type: string, data: Uint8Array): Bytes {
  const chunk = new Uint8Array(data.length + 12);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(encoder.encode(type), 4);
  chunk.set(data, 8);
  view.setUint32(data.length + 8, crc32(chunk.subarray(4, data.length + 8)));
  return chunk;
}

function createHeader(width: number, height: number): Bytes {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = BIT_DEPTH;
  header[9] = COLOR_TYPE_INDEXED;
  return header;
}

/** Appends a transparent palette slot when the chart has empty cells. */
function paletteWithTransparency({ palette, empty }: Chart) {
  if (!empty) return { entries: palette, transparentIndex: null };
  // Without beads the palette is just the transparent slot at index 0.
  return { entries: [...palette, WHITE], transparentIndex: palette.length };
}

/** Every scanline starts with its filter type byte. */
function encodeScanlines({ width, height, indices }: Chart, transparentIndex: number | null): Bytes {
  const rowLength = width + 1;
  const raw = new Uint8Array(rowLength * height);
  for (let y = 0; y < height; y++) {
    raw[y * rowLength] = FILTER_NONE;
    for (let x = 0; x < width; x++) {
      const index = indices[y * width + x];
      raw[y * rowLength + x + 1] = index === EMPTY_CELL ? transparentIndex! : index;
    }
  }
  return raw;
}

async function deflate(bytes: Bytes): Promise<Bytes> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function indexedPng(chart: Chart): Promise<Blob> {
  const { entries, transparentIndex } = paletteWithTransparency(chart);
  const chunks = [
    new Uint8Array(PNG_SIGNATURE),
    createChunk('IHDR', createHeader(chart.width, chart.height)),
    createChunk('PLTE', new Uint8Array(entries.flat())),
  ];
  if (transparentIndex !== null) {
    const alpha = new Uint8Array(entries.length).fill(255);
    alpha[transparentIndex] = 0;
    chunks.push(createChunk('tRNS', alpha));
  }
  const imageData = await deflate(encodeScanlines(chart, transparentIndex));
  chunks.push(createChunk('IDAT', imageData), createChunk('IEND', new Uint8Array()));
  return new Blob(chunks, { type: 'image/png' });
}
