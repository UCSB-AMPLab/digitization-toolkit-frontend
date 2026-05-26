import { writable } from 'svelte/store';

export interface ChannelHistogram {
  r: number[];  // BINS values, normalised 0–100
  g: number[];
  b: number[];
}

const BINS = 30;

function empty(): ChannelHistogram {
  return {
    r: new Array(BINS).fill(0),
    g: new Array(BINS).fill(0),
    b: new Array(BINS).fill(0),
  };
}

/**
 * Compute an RGB histogram from a loaded <img> element.
 *
 * The image is redrawn at 128×72 onto an offscreen canvas before reading
 * pixels — this keeps the computation fast (9 216 pixels vs >900 000 for
 * a full 1280×720 preview frame) with no meaningful accuracy loss for a
 * histogram display.
 *
 * Returns BINS-length arrays normalised so the peak bin == 100.
 */
export function computeHistogram(imgEl: HTMLImageElement): ChannelHistogram {
  if (!imgEl.naturalWidth || !imgEl.naturalHeight) return empty();

  const W = 128, H = 72;
  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return empty();

  ctx.drawImage(imgEl, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;
  const total = W * H;

  const rCount = new Array(BINS).fill(0);
  const gCount = new Array(BINS).fill(0);
  const bCount = new Array(BINS).fill(0);

  for (let i = 0; i < total; i++) {
    const p = i * 4;
    rCount[Math.min(BINS - 1, Math.floor(data[p]     / 256 * BINS))]++;
    gCount[Math.min(BINS - 1, Math.floor(data[p + 1] / 256 * BINS))]++;
    bCount[Math.min(BINS - 1, Math.floor(data[p + 2] / 256 * BINS))]++;
  }

  const maxCount = Math.max(...rCount, ...gCount, ...bCount, 1);
  return {
    r: rCount.map(c => Math.round((c / maxCount) * 100)),
    g: gCount.map(c => Math.round((c / maxCount) * 100)),
    b: bCount.map(c => Math.round((c / maxCount) * 100)),
  };
}

/** Per-camera histogram data, updated by LiveViewport on each preview frame. */
export const histogramStore = writable<Record<number, ChannelHistogram>>({
  0: empty(),
  1: empty(),
});
