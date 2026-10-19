import test from 'node:test';
import assert from 'node:assert/strict';
import { neighborMask } from '../src/beads.ts';

test('isolated bead has no fused connections', () => {
  assert.equal(neighborMask(new Uint16Array([0]), 1, 1, 0, 0), 0);
});

test('fused connections follow occupied neighbors, regardless of their color', () => {
  const indices = new Uint16Array([0, 1, 0, 1, 0, 1, 0, 1, 0]);
  assert.equal(neighborMask(indices, 3, 3, 1, 1), 15);
  assert.equal(neighborMask(indices, 3, 3, 0, 0), 6);
  assert.equal(neighborMask(indices, 3, 3, 2, 2), 9);
});

test('empty cells do not create bridges and rows do not wrap', () => {
  const indices = new Uint16Array([0, 65535, 1, 65535, 0, 65535]);
  assert.equal(neighborMask(indices, 3, 2, 0, 0), 0);
  assert.equal(neighborMask(indices, 3, 2, 2, 0), 0);
  assert.equal(neighborMask(indices, 3, 2, 1, 1), 0);
});
