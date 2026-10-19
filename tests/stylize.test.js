import test from 'node:test';
import assert from 'node:assert/strict';
import { rgbToLab } from '../src/color.ts';
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
const PAPER = [235, 235, 235];
const INK = [20, 20, 20];
const chroma = rgb => Math.hypot(...rgbToLab(rgb).slice(1));

test('grays and fully transparent input remain exact', () => {
  assert.deepEqual([...stylize(tile(PAPER), 1, 1)], [...PAPER, 255]);
  assert.deepEqual([...stylize(new Uint8ClampedArray(64), 1, 1)], [0, 0, 0, 0]);
});

test('colors become more saturated at the same lightness', () => {
  const styled = [...stylize(tile([120, 160, 180]), 1, 1)];
  assert.equal(styled[3], 255);
  assert.ok(chroma(styled.slice(0, 3)) > chroma([120, 160, 180]) * 1.15);
  assert.ok(Math.abs(rgbToLab(styled.slice(0, 3))[0] - rgbToLab([120, 160, 180])[0]) < 1);
});

test('beads are placed solid when at least half covered, otherwise left empty', () => {
  const halfTransparent = tile(PAPER);
  for (let i = 3; i < 64; i += 4) halfTransparent[i] = 128;
  assert.deepEqual([...stylize(halfTransparent, 1, 1)], [...PAPER, 255]);

  const quarterCovered = tile(PAPER);
  for (let y = 0; y < 4; y++) for (let x = 1; x < 4; x++) quarterCovered[sampleOffset(x, y) + 3] = 0;
  assert.deepEqual([...stylize(quarterCovered, 1, 1)], [0, 0, 0, 0]);
});

test('samples blended across an edge do not tint the chosen color', () => {
  // A pale mint area meets white paper; the second column blends both sides.
  const input = tile(PAPER);
  for (let y = 0; y < 4; y++) {
    input.set([200, 235, 200, 255], sampleOffset(0, y));
    input.set([226, 235, 226, 255], sampleOffset(1, y));
  }
  assert.deepEqual([...stylize(input, 1, 1)], [...PAPER, 255]);
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
  const input = tile(PAPER);
  input.set([...INK, 255], sampleOffset(1, 1));
  assert.deepEqual([...stylize(input, 1, 1)], [...PAPER, 255]);
});

test('low-contrast shades are averaged instead of being made into harsh outlines', () => {
  const input = tile([210, 210, 210]);
  for (let y = 0; y < 4; y++) input.set([190, 190, 190, 255], sampleOffset(1, y));
  assert.deepEqual([...stylize(input, 1, 1)], [205, 205, 205, 255]);
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
