import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_CELL } from '../src/constants.ts';
import { MARD221 } from '../src/mard.ts';
import { quantize } from '../src/quantize.ts';
import { stylize } from '../src/stylize.ts';

/** The 4 × 4 samples of a single bead, all of one opaque color. */
const tile = rgb => new Uint8ClampedArray(Array.from({ length: 16 }, () => [...rgb, 255]).flat());
/** Byte offset of sample (x, y) inside a single-bead tile. */
const sampleOffset = (x, y) => (y * 4 + x) * 4;
const luma = rgb => rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;

const SKIN = [240, 220, 210];
const INK = [20, 20, 20];

test('flat colors and fully transparent input remain exact', () => {
  assert.deepEqual([...stylize(tile([20, 150, 210]), 1, 1)], [20, 150, 210, 255]);
  assert.deepEqual([...stylize(new Uint8ClampedArray(64), 1, 1)], [0, 0, 0, 0]);

  const halfTransparent = tile([20, 150, 210]);
  for (let i = 3; i < 64; i += 4) halfTransparent[i] = 128;
  assert.deepEqual([...stylize(halfTransparent, 1, 1)], [20, 150, 210, 128]);
});

test('connected thin eyes and outlines survive where average downsampling blurs them', () => {
  const input = tile(SKIN);
  for (let y = 0; y < 4; y++) input.set([...INK, 255], sampleOffset(1, y));
  const original = input.slice();

  const styled = stylize(input, 1, 1);
  assert.deepEqual([...styled], [...INK, 255]);
  const areaAverage = [185, 170, 163];
  assert.ok(luma(SKIN) - luma(styled) > 3 * (luma(SKIN) - luma(areaAverage)));
  assert.deepEqual(input, original, 'input must not be modified');
});

test('one dark noise speck is removed, not expanded into a bead', () => {
  const input = tile(SKIN);
  input.set([...INK, 255], sampleOffset(1, 1));
  assert.deepEqual([...stylize(input, 1, 1)], [...SKIN, 255]);
});

test('low-contrast shades are averaged instead of being made into harsh outlines', () => {
  const input = tile([210, 180, 160]);
  for (let y = 0; y < 4; y++) input.set([200, 170, 150, 255], sampleOffset(1, y));
  assert.deepEqual([...stylize(input, 1, 1)], [208, 178, 158, 255]);
});

test('32-bead output is deterministic, uses only MARD codes and preserves count contracts', () => {
  const width = 32;
  const height = 24;
  const input = new Uint8ClampedArray(width * height * 64);
  for (let i = 0; i < input.length / 4; i++) {
    input.set([i % 256, (i * 43) % 256, (i * 13) % 256, i % 9 === 0 ? 0 : 255], i * 4);
  }

  const reduced = stylize(input, width, height);
  assert.equal(reduced.length, width * height * 4);
  assert.deepEqual(stylize(input, width, height), reduced);

  const result = quantize(reduced, width, height, 24, MARD221);
  assert.ok(result.palette.length <= 24);
  assert.ok(result.codes.every(code => MARD221.some(color => color.code === code)));
  assert.equal(result.counts.reduce((a, b) => a + b, 0) + result.empty, width * height);
  assert.ok([...result.indices].every(index => index === EMPTY_CELL || index < result.palette.length));
});

test('invalid detail sampling dimensions are rejected', () => {
  assert.throws(() => stylize(new Uint8ClampedArray(4), 1, 1), /采样尺寸/);
});
