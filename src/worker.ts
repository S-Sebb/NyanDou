// Generation worker: sampled pixels in, finished chart out.
import { errorMessage } from './format.ts';
import { MARD221 } from './mard.ts';
import { quantize } from './quantize.ts';
import { stylize } from './stylize.ts';
import type { QuantizeRequest, QuantizeResponse, WorkerPort } from './types.ts';

const scope = self as unknown as WorkerPort<QuantizeRequest, QuantizeResponse>;

scope.onmessage = ({ data }) => {
  try {
    const { width, height, maxColors } = data;
    const rgba = data.designStyle === 'pixel' ? stylize(data.rgba, width, height) : data.rgba;
    const colorCard = data.paletteMode === 'mard221' ? MARD221 : null;
    const result = quantize(rgba, width, height, maxColors, colorCard);
    scope.postMessage({ result }, [result.indices.buffer]);
  } catch (error) {
    scope.postMessage({ error: errorMessage(error) });
  }
};
