// Four samples per bead axis. Prefer coherent dark details over blurred averages;
// simplify low-contrast texture without inventing features or changing the framing.
import type { RGB } from './types.ts';
interface Sample { rgb: RGB; a: number; sx: number; sy: number }
const distance = (a: RGB, b: RGB) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const light = (rgb: RGB) => rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;

export function stylize(rgba: Uint8ClampedArray, width: number, height: number) {
  if (rgba.length !== width * height * 16 * 4) throw new Error('细节采样尺寸不正确');
  const output = new Uint8ClampedArray(width * height * 4);
  const stride = width * 4;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const samples: Sample[] = [];
      let alpha = 0;
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const offset = ((y * 4 + sy) * stride + x * 4 + sx) * 4;
          const a = rgba[offset + 3];
          alpha += a;
          if (a) samples.push({ rgb: [rgba[offset], rgba[offset + 1], rgba[offset + 2]], a, sx, sy });
        }
      }
      if (!samples.length) continue;
      const average = (group: Sample[]): RGB => {
        const sum = [0, 0, 0];
        let weight = 0;
        for (const p of group) {
          weight += p.a;
          for (let c = 0; c < 3; c++) sum[c] += p.rgb[c] * p.a;
        }
        return sum.map(v => v / weight) as RGB;
      };
      const mean = average(samples);
      const first = samples.reduce((a, b) => distance(a.rgb, mean) > distance(b.rgb, mean) ? a : b);
      const second = samples.reduce((a, b) => distance(a.rgb, first.rgb) > distance(b.rgb, first.rgb) ? a : b);
      let centers: [RGB, RGB] = [first.rgb, second.rgb];
      let groups: [Sample[], Sample[]] = [[], []];
      for (let iteration = 0; iteration < 3; iteration++) {
        groups = [[], []];
        for (const p of samples) groups[distance(p.rgb, centers[0]) <= distance(p.rgb, centers[1]) ? 0 : 1].push(p);
        centers = groups.map((g, i) => g.length ? average(g) : centers[i]) as [RGB, RGB];
      }
      let rgb = mean;
      if (groups[0].length && groups[1].length && distance(...centers) > 40 ** 2) {
        const dominant = groups[0].length >= groups[1].length ? 0 : 1;
        const dark = light(centers[0]) < light(centers[1]) ? 0 : 1;
        const details = groups[dark];
        const connected = details.filter(p => details.some(q => Math.abs(p.sx - q.sx) + Math.abs(p.sy - q.sy) === 1)).length;
        // Require a connected detail, not one isolated speck. Keeping dark accents
        // makes eyes, mouths and outlines readable even when they cover < half a bead.
        rgb = light(centers[1 - dark]) - light(centers[dark]) > 50
          && details.length >= 3 && connected >= 3 ? centers[dark] : centers[dominant];
      }
      const offset = (y * width + x) * 4;
      output.set(rgb.map(Math.round), offset);
      // Snap sufficiently covered opaque edges; retain genuine partial alpha.
      output[offset + 3] = samples.length >= 6 ? Math.round(alpha / samples.length) : 0;
    }
  }
  return output;
}
