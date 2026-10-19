/** Shrinks a canvas so the browser can free its pixel buffer right away. */
export function releaseCanvas(canvas: HTMLCanvasElement | OffscreenCanvas): void {
  canvas.width = canvas.height = 1;
}
