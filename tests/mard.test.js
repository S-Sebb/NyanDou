import test from 'node:test';
import assert from 'node:assert/strict';
import { MARD221 } from '../src/mard.ts';
import { quantize } from '../src/quantize.ts';

const card = new Map(MARD221.map(color => [color.code, color.rgb]));
const rgba = colors => new Uint8ClampedArray(colors.flatMap(rgb => [...rgb, 255]));

test('standard card has exactly 221 unique codes and the nine complete standard series', () => {
  assert.equal(MARD221.length, 221);
  assert.equal(card.size, 221);
  const series = { A: 26, B: 32, C: 29, D: 26, E: 24, F: 25, G: 21, H: 23, M: 15 };
  for (const [prefix, size] of Object.entries(series)) {
    for (let i = 1; i <= size; i++) assert.ok(card.has(prefix + i));
  }
  assert.ok(MARD221.every(color => color.rgb.every(v => Number.isInteger(v) && v >= 0 && v <= 255)));
  assert.deepEqual(card.get('H2'), [255, 255, 255]);
  assert.deepEqual(card.get('H7'), [0, 0, 0]);
});

test('every exact reference color retains its real code when the color budget allows it', () => {
  const result = quantize(rgba(MARD221.map(c => c.rgb)), 221, 1, 256, MARD221);
  assert.equal(result.palette.length, 221);
  assert.deepEqual(result.codes, MARD221.map(c => c.code));
  assert.deepEqual(result.palette, MARD221.map(c => c.rgb));
  assert.ok(result.counts.every(count => count === 1));
});

test('MARD codes remain attached to colors when usage order changes', () => {
  const whiteFirst = quantize(rgba([card.get('H2'), card.get('H7'), card.get('H2')]), 3, 1, 2, MARD221);
  const blackFirst = quantize(rgba([card.get('H7'), card.get('H2'), card.get('H7')]), 3, 1, 2, MARD221);
  assert.deepEqual(whiteFirst.codes, ['H2', 'H7']);
  assert.deepEqual(blackFirst.codes, ['H7', 'H2']);
  for (const result of [whiteFirst, blackFirst]) {
    assert.deepEqual(result.counts, [2, 1]);
    result.codes.forEach((code, i) => assert.deepEqual(result.palette[i], card.get(code)));
  }
});

test('limited-color matching returns only real MARD references, not free cluster centroids', () => {
  const input = new Uint8ClampedArray(32 * 32 * 4);
  for (let i = 0; i < 1024; i++) input.set([i % 256, (i * 67) % 256, Math.floor(i / 4) % 256, 255], i * 4);
  for (const limit of [2, 8, 24, 221, 256]) {
    const result = quantize(input, 32, 32, limit, MARD221);
    assert.ok(result.palette.length <= Math.min(limit, 221));
    assert.equal(new Set(result.codes).size, result.codes.length);
    result.codes.forEach((code, i) => assert.deepEqual(result.palette[i], card.get(code)));
    assert.equal(result.counts.reduce((a, b) => a + b, 0), 1024);
    assert.ok([...result.indices].every(index => index < result.palette.length));
    assert.deepEqual(quantize(input, 32, 32, limit, MARD221), result);
  }
});

test('transparent cells and partial-alpha blending preserve counts in MARD mode', () => {
  const result = quantize(new Uint8ClampedArray([255,0,0,0,0,0,0,255,255,255,255,128]), 3, 1, 2, MARD221);
  assert.equal(result.empty, 1);
  assert.equal(result.indices[0], 65535);
  assert.deepEqual(result.codes, ['H7', 'H2']);
  assert.deepEqual(result.counts, [1, 1]);
  const blank = quantize(new Uint8ClampedArray(16), 2, 2, 256, MARD221);
  assert.deepEqual(blank.codes, []);
  assert.deepEqual(blank.palette, []);
  assert.equal(blank.empty, 4);
});

test('focused experiment: all MARD-mode output colors are purchasable codes; auto mode stays unrestricted', () => {
  const input = rgba([[17, 29, 41], [173, 113, 193]]);
  const automatic = quantize(input, 2, 1, 2);
  const matched = quantize(input, 2, 1, 2, MARD221);
  const realColors = new Set(MARD221.map(color => color.rgb.join(',')));
  assert.ok(automatic.palette.every(rgb => !realColors.has(rgb.join(','))));
  assert.ok(matched.palette.every(rgb => realColors.has(rgb.join(','))));
  assert.ok(matched.codes.every(code => card.has(code)));
  assert.equal(automatic.codes, undefined);
});
