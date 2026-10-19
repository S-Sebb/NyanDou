// Dependency-free, true 8-bit indexed PNG (IHDR color type 3).
import type { Chart } from './types.ts';
const encoder = new TextEncoder();
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});

function chunk(type: string, data: Uint8Array) {
  const result = new Uint8Array(data.length + 12);
  const view = new DataView(result.buffer);
  view.setUint32(0, data.length);
  result.set(encoder.encode(type), 4);
  result.set(data, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < data.length + 8; i++) crc = crcTable[(crc ^ result[i]) & 255] ^ (crc >>> 8);
  view.setUint32(data.length + 8, (crc ^ 0xffffffff) >>> 0);
  return result;
}

export async function indexedPng({ width, height, palette, indices, empty }: Chart): Promise<Blob> {
  const colors = palette.length ? palette : [[255, 255, 255]];
  const transparent = empty ? (palette.length || 0) : -1;
  const entries = empty && palette.length ? [...colors, [255, 255, 255]] : colors;
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 3;
  const raw = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = indices[y * width + x];
      raw[y * (width + 1) + x + 1] = index === 65535 ? transparent : index;
    }
  }
  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('PLTE', new Uint8Array(entries.flat()))];
  if (empty) {
    const alpha = new Uint8Array(entries.length).fill(255);
    alpha[transparent] = 0;
    parts.push(chunk('tRNS', alpha));
  }
  parts.push(chunk('IDAT', compressed), chunk('IEND', new Uint8Array()));
  return new Blob(parts, { type: 'image/png' });
}
