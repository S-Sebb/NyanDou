import test from 'node:test';
import assert from 'node:assert/strict';
import { quantize, rgbToLab } from '../src/quantize.ts';

const pixels = colors => new Uint8ClampedArray(colors.flat());

test('keeps exact colors when the input fits the palette, counts every bead', () => {
  const input = pixels([[255, 0, 0, 255], [0, 0, 255, 255], [255, 0, 0, 255]]);
  const result = quantize(input, 3, 1, 2);
  assert.deepEqual(result.palette, [[255, 0, 0], [0, 0, 255]]);
  assert.deepEqual(result.counts, [2, 1]);
  assert.deepEqual([...result.indices], [0, 1, 0]);
});

test('transparent cells remain empty; partial alpha composites on white', () => {
  const result = quantize(pixels([[20, 30, 40, 0], [255, 0, 0, 128]]), 2, 1, 2);
  assert.equal(result.empty, 1);
  assert.equal(result.indices[0], 65535);
  assert.deepEqual(result.palette, [[255, 127, 127]]);
  assert.deepEqual(result.counts, [1]);
});

test('all-transparent input produces zero beads, not a spurious color', () => {
  const result = quantize(new Uint8ClampedArray(16), 2, 2, 256);
  assert.equal(result.empty, 4);
  assert.deepEqual(result.palette, []);
  assert.deepEqual(result.counts, []);
  assert.ok([...result.indices].every(i => i === 65535));
});

function gradient(size = 1024) {
  const input = new Uint8ClampedArray(size * 4);
  for (let i = 0; i < size; i++) input.set([i % 256, Math.floor(i / 4) % 256, (i * 37) % 256, 255], i * 4);
  return input;
}

test('quantization is deterministic, bounded, and preserves counts', () => {
  const input = gradient();
  for (const limit of [2, 8, 24, 256]) {
    const result = quantize(input, 32, 32, limit);
    assert.ok(result.palette.length <= limit);
    assert.equal(result.counts.reduce((a, b) => a + b, 0), 1024);
    assert.ok([...result.indices].every(i => i < result.palette.length));
    assert.deepEqual(quantize(input, 32, 32, limit), result);
  }
});

test('reserves one palette entry for transparency at the 256-color limit', () => {
  const input = gradient();
  input[3] = 0;
  const result = quantize(input, 32, 32, 256);
  assert.ok(result.palette.length <= 255);
  assert.equal(result.empty, 1);
  assert.equal(result.counts.reduce((a, b) => a + b, 0), 1023);
});

test('Lab conversion matches D65 black and white', () => {
  assert.deepEqual(rgbToLab([0, 0, 0]), [0, 0, 0]);
  const white = rgbToLab([255, 255, 255]);
  assert.ok(Math.abs(white[0] - 100) < 0.001);
  assert.ok(Math.abs(white[1]) < 0.001);
  assert.ok(Math.abs(white[2]) < 0.001);
});

test('rejects invalid dimensions and palette limits', () => {
  assert.throws(() => quantize(new Uint8Array(4), 2, 1, 2));
  assert.throws(() => quantize(new Uint8Array(4), 1, 1, 257));
});

test('focused experiment: quantization beats an unrelated fixed palette on a warm image', () => {
  const input = new Uint8ClampedArray(64 * 64 * 4);
  for (let i = 0; i < 4096; i++) input.set([180 + i % 76, 70 + Math.floor(i / 64) % 80, 30 + i % 40, 255], i * 4);
  const result = quantize(input, 64, 64, 8);
  const error = (a, b) => a.reduce((sum, value, j) => sum + (value - b[j]) ** 2, 0);
  const fixed = [[0,0,0],[255,255,255],[255,0,0],[0,255,0],[0,0,255],[255,255,0],[0,255,255],[255,0,255]].map(rgbToLab);
  const labs = result.palette.map(rgbToLab);
  let adaptiveError = 0;
  let fixedError = 0;
  for (let i = 0; i < 4096; i++) {
    const lab = rgbToLab([...input.slice(i * 4, i * 4 + 3)]);
    adaptiveError += error(lab, labs[result.indices[i]]);
    fixedError += Math.min(...fixed.map(color => error(lab, color)));
  }
  assert.ok(adaptiveError < fixedError * 0.1, `adaptive error ${adaptiveError}, fixed error ${fixedError}`);
});
