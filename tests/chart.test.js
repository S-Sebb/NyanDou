import test from 'node:test';
import assert from 'node:assert/strict';
import { drawGrid, chartLayout, chartPng } from '../src/chart.ts';

/** A minimal 2D context that records strokes and text. */
function recordingContext() {
  return {
    strokes: [],
    labels: [],
    line: null,
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    moveTo(x, y) { this.line = [x, y]; },
    lineTo() {},
    stroke() { this.strokes.push({ line: this.line, color: this.strokeStyle, width: this.lineWidth }); },
    fillText(text) { this.labels.push(text); },
  };
}

function fakeCanvas(context, blob) {
  return { getContext: () => context, toBlob: resolve => resolve(blob) };
}

const chart = {
  width: 16,
  height: 16,
  palette: [[255, 255, 255]],
  codes: ['H2'],
  counts: [256],
  indices: new Uint16Array(256),
  empty: 0,
};

test('five-bead dividers are distinct from both ten-bead and single-bead lines', () => {
  const context = recordingContext();
  drawGrid(context, chart, 12);
  const verticalLineAt = column => context.strokes.find(stroke => stroke.line[0] === 28 + column * 12 && stroke.line[1] === 28);
  assert.equal(verticalLineAt(1).color, '#293e4225');
  assert.equal(verticalLineAt(5).color, '#293e4240');
  assert.equal(verticalLineAt(10).color, '#293e4266');
  assert.ok(verticalLineAt(1).width < verticalLineAt(5).width && verticalLineAt(5).width < verticalLineAt(10).width);
  assert.ok(context.labels.includes('H2'));
});

test('five-bead lines remain visible when zoom hides single-bead lines', () => {
  const context = recordingContext();
  drawGrid(context, chart, 2);
  assert.equal(context.strokes.length, 10);
  assert.equal(context.strokes.filter(stroke => stroke.color === '#293e4240').length, 4);
});

test('export stays below eight million pixels even at 160 × 160 with a full palette', () => {
  assert.equal(chartLayout(chart).cell, 26);
  const big = chartLayout({ width: 160, height: 160, palette: Array(256).fill([0, 0, 0]) });
  assert.ok(big.width * big.height <= 8_000_000);
  assert.ok(big.cell >= 12 && big.cell < 26);
});

test('fallback export yields, uses real codes, and releases its canvas buffer', async () => {
  const context = recordingContext();
  const canvas = fakeCanvas(context, new Blob(['PNG'], { type: 'image/png' }));
  let yields = 0;
  const blob = await chartPng(chart, { createCanvas: () => canvas, yieldBetweenRows: async () => { yields++; } });
  assert.equal(blob.type, 'image/png');
  assert.equal(yields, 4);
  assert.ok(context.labels.includes('H2  #FFFFFF'));
  assert.equal(canvas.width, 1);
  assert.equal(canvas.height, 1);
});

test('failed PNG encoding still releases the canvas buffer', async () => {
  const canvas = fakeCanvas(recordingContext(), null);
  await assert.rejects(chartPng(chart, { createCanvas: () => canvas }), /图纸导出失败/);
  assert.equal(canvas.width, 1);
  assert.equal(canvas.height, 1);
});
