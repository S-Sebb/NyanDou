import { quantize } from './quantize.ts';
import { MARD221 } from './mard.ts';
import { stylize } from './stylize.ts';
import type { WorkerPort, QuantizeRequest, QuantizeResponse } from './types.ts';
const scope = self as unknown as WorkerPort<QuantizeRequest, QuantizeResponse>;

scope.onmessage = ({ data }) => {
  try {
    const paletteMode = data.paletteMode === 'auto' ? 'auto' : 'mard221';
    const rgba = data.designStyle === 'pixel' ? stylize(data.rgba, data.width, data.height) : data.rgba;
    const result = quantize(rgba, data.width, data.height, data.maxColors, paletteMode === 'auto' ? null : MARD221);
    result.paletteMode = paletteMode;
    scope.postMessage({ result }, [result.indices.buffer]);
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
