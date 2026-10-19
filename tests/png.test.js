import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { indexedPng } from '../src/png.ts';
import { quantize } from '../src/quantize.ts';

async function decodeChunks(result) {
  const bytes = new Uint8Array(await (await indexedPng(result)).arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks = {};
  let offset = 8;
  while (offset < bytes.length) {
    const length = new DataView(bytes.buffer).getUint32(offset);
    const name = new TextDecoder().decode(bytes.slice(offset + 4, offset + 8));
    chunks[name] = bytes.slice(offset + 8, offset + 8 + length);
    offset += length + 12;
  }
  return chunks;
}

test('PNG uses real 8-bit indexed color, with exact dimensions and pixel indices', async () => {
  const result = quantize(new Uint8ClampedArray([255,0,0,255,0,0,255,255,255,0,0,255,0,0,255,255]), 2, 2, 2);
  const chunks = await decodeChunks(result);
  const header = new DataView(chunks.IHDR.buffer, chunks.IHDR.byteOffset);
  assert.equal(header.getUint32(0), 2);
  assert.equal(header.getUint32(4), 2);
  assert.equal(chunks.IHDR[8], 8);
  assert.equal(chunks.IHDR[9], 3);
  assert.deepEqual([...inflateSync(chunks.IDAT)], [0,0,1,0,0,1]);
  assert.deepEqual([...chunks.PLTE], result.palette.flat());
  assert.equal(chunks.tRNS, undefined);
});

test('PNG transparency has a distinct palette index', async () => {
  const result = quantize(new Uint8ClampedArray([255,0,0,255,0,0,0,0]), 2, 1, 2);
  const chunks = await decodeChunks(result);
  assert.deepEqual([...chunks.tRNS], [255,0]);
  assert.deepEqual([...inflateSync(chunks.IDAT)], [0,0,1]);
});

test('all-transparent PNG has a valid one-entry transparent palette', async () => {
  const result = quantize(new Uint8ClampedArray(16), 2, 2, 256);
  const chunks = await decodeChunks(result);
  assert.equal(chunks.PLTE.length, 3);
  assert.deepEqual([...chunks.tRNS], [0]);
  assert.deepEqual([...inflateSync(chunks.IDAT)], [0,0,0,0,0,0]);
});
