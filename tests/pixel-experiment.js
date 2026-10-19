// Visual comparison of the outline-first style against plain downsampling, on synthetic
// drawings with thin features. Reports how dark the cells covering the eyes stay.
import { EMPTY_CELL } from '../src/constants.ts';
import { sampleImage } from '../src/image-source.ts';
import { MARD221 } from '../src/mard.ts';
import { quantize } from '../src/quantize.ts';
import { stylize } from '../src/stylize.ts';

const SOURCE_SIZE = 256;
const VARIANTS = [
  { width: 32, style: 'faithful', title: '原算法 · 32×32' },
  { width: 32, style: 'pixel', title: '轮廓优先 · 32×32' },
  { width: 64, style: 'faithful', title: '原算法 · 64×64' },
];

const luma = rgb => rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;

function squareCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  return canvas;
}

function circle(context, x, y, radius, color) {
  context.fillStyle = color;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

function polygon(context, color, points) {
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(...points[0]);
  for (const point of points.slice(1)) context.lineTo(...point);
  context.fill();
}

function drawCat() {
  const image = squareCanvas(SOURCE_SIZE);
  const context = image.getContext('2d');
  context.fillStyle = '#fff7f3';
  context.fillRect(0, 0, SOURCE_SIZE, SOURCE_SIZE);

  // Head with ears
  context.strokeStyle = '#463c43';
  context.lineWidth = 3;
  context.lineJoin = 'round';
  context.fillStyle = '#ffc5a2';
  context.beginPath();
  context.moveTo(55, 105);
  context.lineTo(54, 44);
  context.lineTo(103, 83);
  context.lineTo(153, 83);
  context.lineTo(202, 44);
  context.lineTo(201, 105);
  context.bezierCurveTo(232, 210, 24, 210, 55, 105);
  context.fill();
  context.stroke();
  polygon(context, '#ec8fa3', [[63, 80], [62, 57], [82, 77]]);
  polygon(context, '#ec8fa3', [[173, 77], [194, 57], [193, 80]]);

  // Cheeks, eyes and nose
  circle(context, 77, 151, 9, '#f2a4aa');
  circle(context, 179, 151, 9, '#f2a4aa');
  context.fillStyle = '#463c43';
  context.fillRect(88, 128, 3, 10);
  context.fillRect(152, 128, 3, 10);
  polygon(context, '#e88191', [[122, 143], [135, 143], [128, 151]]);

  // Mouth and whiskers
  context.strokeStyle = '#463c43';
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(128, 151);
  context.lineTo(128, 158);
  context.quadraticCurveTo(122, 168, 115, 158);
  context.moveTo(128, 158);
  context.quadraticCurveTo(135, 168, 142, 158);
  context.stroke();
  context.beginPath();
  for (const [x1, y1, x2, y2] of [[31, 136, 62, 142], [28, 155, 61, 152], [196, 142, 226, 136], [196, 152, 228, 155]]) {
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
  }
  context.stroke();

  return { name: '小猫 · 细眼睛、嘴巴和胡须', image, eyes: [[88, 128, 3, 10], [152, 128, 3, 10]] };
}

function drawRabbit() {
  const image = squareCanvas(SOURCE_SIZE);
  const context = image.getContext('2d');
  context.fillStyle = '#e2daf7';
  context.fillRect(0, 0, SOURCE_SIZE, SOURCE_SIZE);
  context.strokeStyle = '#6f5562';
  context.lineWidth = 3;

  for (const x of [96, 160]) {
    context.fillStyle = '#fff5ef';
    context.beginPath();
    context.ellipse(x, 77, 18, 54, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = '#f3b8c5';
    context.beginPath();
    context.ellipse(x, 76, 8, 40, 0, 0, Math.PI * 2);
    context.fill();
  }
  context.fillStyle = '#fff5ef';
  context.beginPath();
  context.ellipse(128, 164, 74, 62, 0, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  circle(context, 81, 175, 10, '#f3b8c5');
  circle(context, 175, 175, 10, '#f3b8c5');
  context.fillStyle = '#6f5562';
  context.fillRect(100, 152, 3, 12);
  context.fillRect(152, 152, 3, 12);
  circle(context, 128, 170, 5, '#dd869e');
  context.beginPath();
  context.moveTo(117, 180);
  context.quadraticCurveTo(128, 189, 139, 180);
  context.stroke();

  return { name: '小兔 · 浅色身体和细五官', image, eyes: [[100, 152, 3, 12], [152, 152, 3, 12]] };
}

function drawLandscape() {
  const image = squareCanvas(SOURCE_SIZE);
  const context = image.getContext('2d');
  const sky = context.createLinearGradient(0, 0, 0, SOURCE_SIZE);
  sky.addColorStop(0, '#65799f');
  sky.addColorStop(0.6, '#eeb798');
  sky.addColorStop(1, '#f6ddb0');
  context.fillStyle = sky;
  context.fillRect(0, 0, SOURCE_SIZE, SOURCE_SIZE);
  circle(context, 170, 100, 25, '#ffe4b0');

  const ridges = [
    ['#9099a5', [[0, 170], [55, 103], [120, 178], [185, 130], [256, 186]]],
    ['#547879', [[0, 186], [70, 154], [132, 192], [204, 166], [256, 193]]],
    ['#2a555e', [[0, 213], [70, 195], [151, 220], [232, 201], [256, 217]]],
  ];
  for (const [color, ridge] of ridges) polygon(context, color, [[0, SOURCE_SIZE], ...ridge, [SOURCE_SIZE, SOURCE_SIZE]]);

  return { name: '风景 · 保留大轮廓，32 格仍会丢失纹理', image, eyes: [] };
}

function convert(image, width, style) {
  const sampled = sampleImage(image, width, width, style);
  const rgba = style === 'pixel' ? stylize(sampled, width, width) : sampled;
  return quantize(rgba, width, width, 24, MARD221);
}

function chartToCanvas(chart) {
  const canvas = squareCanvas(chart.width);
  const context = canvas.getContext('2d');
  const pixels = context.createImageData(chart.width, chart.height);
  chart.indices.forEach((index, cell) => {
    if (index !== EMPTY_CELL) pixels.data.set([...chart.palette[index], 255], cell * 4);
  });
  context.putImageData(pixels, 0, 0);
  return canvas;
}

/** Lowest luma among the chart cells covering a source rectangle (lower means more visible). */
function darkestLuma(chart, [x, y, width, height]) {
  const scale = chart.width / SOURCE_SIZE;
  let darkest = 255;
  for (let row = Math.floor(y * scale); row <= Math.floor((y + height - 1) * scale); row++) {
    for (let column = Math.floor(x * scale); column <= Math.floor((x + width - 1) * scale); column++) {
      darkest = Math.min(darkest, luma(chart.palette[chart.indices[row * chart.width + column]]));
    }
  }
  return darkest;
}

function figure(canvas, caption) {
  const element = document.createElement('figure');
  const label = document.createElement('figcaption');
  label.textContent = caption;
  element.append(canvas, label);
  return element;
}

export const metrics = [];

for (const fixture of [drawCat(), drawRabbit(), drawLandscape()]) {
  const section = document.createElement('section');
  const heading = document.createElement('h2');
  heading.textContent = fixture.name;
  const samples = document.createElement('div');
  samples.className = 'samples';
  samples.append(figure(fixture.image, '原始合成图 · 256×256'));
  section.append(heading, samples);

  const record = { name: fixture.name };
  for (const { width, style, title } of VARIANTS) {
    const chart = convert(fixture.image, width, style);
    samples.append(figure(chartToCanvas(chart), title));
    if (fixture.eyes.length) {
      const values = fixture.eyes.map(eye => darkestLuma(chart, eye));
      record[`${style}${width}`] = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    }
  }

  if (fixture.eyes.length) {
    const note = document.createElement('p');
    note.className = 'metric';
    note.textContent = `眼睛所在格的最暗色亮度（越低越清楚）：原算法32格 ${record.faithful32} / 轮廓优先32格 ${record.pixel32} / 原算法64格 ${record.faithful64}。仅衡量测试图的细线对比度，不衡量主观可爱程度。`;
    section.append(note);
  }
  metrics.push(record);
  document.getElementById('results').append(section);
}

document.body.dataset.ready = 'true';
