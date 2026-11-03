/**
 * Image → silhouette pipeline.
 *
 * Automatic mode picks a segmentation strategy:
 *  • transparent PNGs → alpha channel;
 *  • uniform border  → colour distance from the border colour (Otsu split);
 *  • otherwise       → luminance Otsu, polarity chosen so the border is background.
 * Manual mode exposes method, threshold, contrast, background removal, noise and
 * hole filtering and contour smoothing.
 *
 * The binary mask is smoothed (Gaussian) and contoured at the 0.5 iso-level with
 * sub-pixel marching squares, giving resolution-independent polygons.
 */
import type { Loop, ProcessingParams, ProcessingStats } from '@/types';
import { simplifyLoop, marchingSquares } from '../silhouetteExtraction/marchingSquares';
import {
  alphaChannel,
  applyContrast,
  borderColour,
  borderConnectedBackground,
  colourDistance,
  cropAndResample,
  fillSmallHoles,
  gaussianBlur,
  hasTransparency,
  labelComponents,
  luminance,
  otsu,
  removeSmallComponents,
  type RGBAImage,
} from './raster';

export interface ProcessingResult {
  width: number;
  height: number;
  /** Final binary mask (1 = silhouette), width × height. */
  mask: Uint8Array;
  loops: Loop[];
  stats: ProcessingStats;
}

export function processImage(src: RGBAImage, params: ProcessingParams): ProcessingResult {
  const notes: string[] = [];
  const img = cropAndResample(src, params.crop, params.resolution);
  const { width: w, height: h } = img;
  const n = w * h;
  let method = params.method;
  let threshold = params.threshold;
  const mask = new Uint8Array(n);

  if (params.mode === 'auto') {
    if (hasTransparency(img)) {
      method = 'alpha';
      threshold = 128;
      notes.push('Transparent image: using the alpha channel as the silhouette.');
    } else {
      const border = borderColour(img);
      if (border.spread < 40) {
        method = 'background';
        notes.push(`Uniform background detected (rgb ${border.rgb.map((v) => Math.round(v)).join(', ')}).`);
      } else {
        method = 'luminance';
        notes.push('Busy background: using luminance segmentation. Manual mode may give better results for photos.');
      }
    }
  }

  if (method === 'alpha') {
    const a = alphaChannel(img);
    const t = params.mode === 'auto' ? 0.5 : threshold / 255;
    threshold = Math.round(t * 255);
    for (let i = 0; i < n; i++) mask[i] = a[i] > t ? 1 : 0;
  } else if (method === 'background') {
    const border = borderColour(img);
    const dist = colourDistance(img, border.rgb);
    let t: number;
    if (params.mode === 'auto') {
      t = Math.max(0.06, otsu(dist));
      threshold = Math.round(t * 255);
    } else {
      t = params.bgTolerance / 255;
      threshold = params.bgTolerance;
    }
    // Auto mode thresholds globally so enclosed holes (gaps between limbs, rings)
    // stay holes; border-connected removal is a manual option for photos.
    if (params.mode === 'manual' && params.removeBackground) {
      const bg = borderConnectedBackground(dist, w, h, t);
      for (let i = 0; i < n; i++) mask[i] = bg[i] ? 0 : 1;
    } else {
      for (let i = 0; i < n; i++) mask[i] = dist[i] > t ? 1 : 0;
    }
  } else {
    const lum = applyContrast(luminance(img), params.contrast);
    let t = threshold / 255;
    let darkIsForeground = true;
    if (params.mode === 'auto') {
      t = otsu(lum);
      threshold = Math.round(t * 255);
      // the class that dominates the border is background
      let borderDark = 0;
      let borderCount = 0;
      for (let x = 0; x < w; x++)
        for (const y of [0, h - 1]) {
          borderCount++;
          if (lum[y * w + x] < t) borderDark++;
        }
      for (let y = 0; y < h; y++)
        for (const x of [0, w - 1]) {
          borderCount++;
          if (lum[y * w + x] < t) borderDark++;
        }
      darkIsForeground = borderDark < borderCount / 2;
      if (!darkIsForeground) notes.push('Light figure on a dark background detected.');
    }
    for (let i = 0; i < n; i++) mask[i] = (lum[i] < t) === darkIsForeground ? 1 : 0;
    if (params.mode === 'manual' && params.removeBackground) {
      // drop foreground blobs that touch the border (frames, edge clutter)
      const { labels, touchesBorder, areas } = labelComponents(mask, w, h, 8);
      const largest = areas.indexOf(Math.max(...areas));
      for (let i = 0; i < n; i++) if (labels[i] >= 0 && touchesBorder[labels[i]] && labels[i] !== largest) mask[i] = 0;
    }
  }

  if (params.invert) for (let i = 0; i < n; i++) mask[i] = mask[i] ? 0 : 1;

  const removed = removeSmallComponents(mask, w, h, (params.noiseArea / 100) * n);
  const filled = fillSmallHoles(mask, w, h, (params.holeArea / 100) * n);
  if (removed) notes.push(`Removed ${removed} noise region${removed > 1 ? 's' : ''}.`);
  if (filled) notes.push(`Filled ${filled} small hole${filled > 1 ? 's' : ''}.`);

  // smooth and contour
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = mask[i];
  const field = gaussianBlur(f, w, h, params.smoothing);
  // re-binarise so the preview mask matches the contours exactly
  for (let i = 0; i < n; i++) mask[i] = field[i] > 0.5 ? 1 : 0;
  const raw = marchingSquares(field, w, h, 0.5);
  const tol = 0.25 + params.smoothing * 0.1;
  const minLoopArea = Math.max(2, (params.noiseArea / 100) * n * 0.5);
  const loops: Loop[] = [];
  let vertices = 0;
  let holes = 0;
  let components = 0;
  for (const l of raw) {
    let a = 0;
    for (let i = 0, j = l.length - 1; i < l.length; j = i++) a += (l[j][0] - l[i][0]) * (l[j][1] + l[i][1]);
    if (Math.abs(a / 2) < minLoopArea) continue;
    const s = simplifyLoop(l, tol);
    loops.push(s);
    vertices += s.length;
    // Outer boundaries are traced clockwise on screen (y down), which is a positive
    // shoelace sum when the coordinates are read algebraically; holes are negative.
    if (a > 0) components++;
    else holes++;
  }
  let fg = 0;
  for (let i = 0; i < n; i++) fg += mask[i];
  if (fg === 0) notes.push('No silhouette found — try manual mode, invert, or a different threshold.');
  return {
    width: w,
    height: h,
    mask,
    loops,
    stats: {
      method,
      threshold,
      foregroundPct: (fg / n) * 100,
      components,
      holes,
      vertices,
      width: w,
      height: h,
      notes,
    },
  };
}
