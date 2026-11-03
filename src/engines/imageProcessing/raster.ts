/**
 * Dependency-free raster operations on RGBA / scalar images. Pure functions so they
 * run identically in a Web Worker and in Node tests.
 */

export interface RGBAImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Rec. 709 luminance in [0, 1], alpha-composited over white. */
export function luminance(img: RGBAImage): Float32Array {
  const { data, width, height } = img;
  const out = new Float32Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    const a = data[p + 3] / 255;
    const r = (data[p] / 255) * a + (1 - a);
    const g = (data[p + 1] / 255) * a + (1 - a);
    const b = (data[p + 2] / 255) * a + (1 - a);
    out[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return out;
}

export function alphaChannel(img: RGBAImage): Float32Array {
  const out = new Float32Array(img.width * img.height);
  for (let i = 0; i < out.length; i++) out[i] = img.data[i * 4 + 3] / 255;
  return out;
}

/** True when a meaningful share of pixels is transparent (a cut-out PNG). */
export function hasTransparency(img: RGBAImage): boolean {
  let transparent = 0;
  let opaque = 0;
  const n = img.width * img.height;
  for (let i = 0; i < n; i++) {
    const a = img.data[i * 4 + 3];
    if (a < 128) transparent++;
    else opaque++;
  }
  return transparent > n * 0.02 && opaque > n * 0.005;
}

/** Contrast in [-1, 1] around mid-grey. */
export function applyContrast(v: Float32Array, contrast: number): Float32Array {
  if (contrast === 0) return v;
  const k = Math.tan(((contrast + 1) * Math.PI) / 4);
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = Math.min(1, Math.max(0, (v[i] - 0.5) * k + 0.5));
  return out;
}

/** Otsu's threshold for values in [0, 1]. Returns a threshold in [0, 1]. */
export function otsu(v: Float32Array, mask?: Uint8Array): number {
  const hist = new Float64Array(256);
  let n = 0;
  for (let i = 0; i < v.length; i++) {
    if (mask && !mask[i]) continue;
    hist[Math.min(255, Math.max(0, Math.round(v[i] * 255)))]++;
    n++;
  }
  if (n === 0) return 0.5;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestLo = 127;
  let bestHi = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = n - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best * (1 + 1e-9)) {
      best = between;
      bestLo = bestHi = t;
    } else if (between >= best * (1 - 1e-9)) {
      bestHi = t; // plateau (empty histogram gap): keep extending
    }
  }
  // Mid-plateau is the most noise-tolerant cut between well-separated modes.
  return ((bestLo + bestHi) / 2 + 0.5) / 255;
}

/** Separable Gaussian blur with edge clamping. */
export function gaussianBlur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (sigma <= 0.05) return src.slice();
  const r = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float32Array(2 * r + 1);
  let ks = 0;
  for (let i = -r; i <= r; i++) {
    kernel[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
    ks += kernel[i + r];
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= ks;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) {
        const xx = Math.min(w - 1, Math.max(0, x + k));
        s += src[row + xx] * kernel[k + r];
      }
      tmp[row + x] = s;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) {
        const yy = Math.min(h - 1, Math.max(0, y + k));
        s += tmp[yy * w + x] * kernel[k + r];
      }
      out[y * w + x] = s;
    }
  }
  return out;
}

/** Median colour of the 1-px image border (robust background estimate). */
export function borderColour(img: RGBAImage): { rgb: [number, number, number]; spread: number } {
  const { data, width: w, height: h } = img;
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const push = (x: number, y: number) => {
    const p = (y * w + x) * 4;
    const a = data[p + 3] / 255;
    rs.push(data[p] * a + 255 * (1 - a));
    gs.push(data[p + 1] * a + 255 * (1 - a));
    bs.push(data[p + 2] * a + 255 * (1 - a));
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    push(0, y);
    push(w - 1, y);
  }
  const med = (a: number[]) => {
    const s = [...a].sort((p, q) => p - q);
    return s[Math.floor(s.length / 2)];
  };
  const rgb: [number, number, number] = [med(rs), med(gs), med(bs)];
  let spread = 0;
  for (let i = 0; i < rs.length; i++) spread += Math.hypot(rs[i] - rgb[0], gs[i] - rgb[1], bs[i] - rgb[2]);
  return { rgb, spread: spread / rs.length };
}

/** Euclidean RGB distance to a reference colour, normalised to [0, 1]. */
export function colourDistance(img: RGBAImage, ref: [number, number, number]): Float32Array {
  const { data } = img;
  const out = new Float32Array(img.width * img.height);
  const norm = 1 / (255 * Math.sqrt(3));
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    const a = data[p + 3] / 255;
    const r = data[p] * a + 255 * (1 - a);
    const g = data[p + 1] * a + 255 * (1 - a);
    const b = data[p + 2] * a + 255 * (1 - a);
    out[i] = Math.hypot(r - ref[0], g - ref[1], b - ref[2]) * norm;
  }
  return out;
}

export interface Components {
  labels: Int32Array;
  areas: number[];
  touchesBorder: boolean[];
}

/** 8-connected component labelling of a binary mask (non-zero = set). */
export function labelComponents(mask: Uint8Array, w: number, h: number, connectivity: 4 | 8 = 8): Components {
  const labels = new Int32Array(w * h).fill(-1);
  const areas: number[] = [];
  const touchesBorder: boolean[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start] !== -1) continue;
    const id = areas.length;
    let area = 0;
    let border = false;
    labels[start] = id;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      area++;
      const x = p % w;
      const y = (p - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (connectivity === 4 && dx && dy) continue;
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const q = yy * w + xx;
          if (mask[q] && labels[q] === -1) {
            labels[q] = id;
            stack.push(q);
          }
        }
      }
    }
    areas.push(area);
    touchesBorder.push(border);
  }
  return { labels, areas, touchesBorder };
}

/** Removes set components smaller than `minArea` pixels. Returns the count removed. */
export function removeSmallComponents(mask: Uint8Array, w: number, h: number, minArea: number): number {
  if (minArea <= 0) return 0;
  const { labels, areas } = labelComponents(mask, w, h, 8);
  let removed = 0;
  const drop = areas.map((a) => a < minArea);
  removed = drop.filter(Boolean).length;
  for (let i = 0; i < mask.length; i++) if (labels[i] >= 0 && drop[labels[i]]) mask[i] = 0;
  return removed;
}

/** Fills enclosed holes (background components not touching the border) below `maxArea`. */
export function fillSmallHoles(mask: Uint8Array, w: number, h: number, maxArea: number): number {
  const inv = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) inv[i] = mask[i] ? 0 : 1;
  const { labels, areas, touchesBorder } = labelComponents(inv, w, h, 4);
  const fill = areas.map((a, i) => !touchesBorder[i] && a < maxArea);
  for (let i = 0; i < mask.length; i++) if (labels[i] >= 0 && fill[labels[i]]) mask[i] = 1;
  return fill.filter(Boolean).length;
}

/** Background = pixels similar to `bg` that are 4-connected to the image border. */
export function borderConnectedBackground(dist: Float32Array, w: number, h: number, tolerance: number): Uint8Array {
  const bg = new Uint8Array(w * h);
  const stack: number[] = [];
  const seed = (p: number) => {
    if (!bg[p] && dist[p] <= tolerance) {
      bg[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) seed(p - 1);
    if (x < w - 1) seed(p + 1);
    if (y > 0) seed(p - w);
    if (y < h - 1) seed(p + w);
  }
  return bg;
}

/** Crops and resamples (box filter / bilinear) an RGBA image so its longest side ≤ maxSide. */
export function cropAndResample(img: RGBAImage, crop: { x: number; y: number; w: number; h: number }, maxSide: number): RGBAImage {
  const sx0 = Math.max(0, Math.floor(crop.x * img.width));
  const sy0 = Math.max(0, Math.floor(crop.y * img.height));
  const sx1 = Math.min(img.width, Math.ceil((crop.x + crop.w) * img.width));
  const sy1 = Math.min(img.height, Math.ceil((crop.y + crop.h) * img.height));
  const cw = Math.max(1, sx1 - sx0);
  const ch = Math.max(1, sy1 - sy0);
  const s = Math.min(1, maxSide / Math.max(cw, ch));
  const w = Math.max(1, Math.round(cw * s));
  const h = Math.max(1, Math.round(ch * s));
  const out = new Uint8ClampedArray(w * h * 4);
  const fx = cw / w;
  const fy = ch / h;
  for (let y = 0; y < h; y++) {
    const y0 = sy0 + y * fy;
    const y1 = y0 + fy;
    for (let x = 0; x < w; x++) {
      const x0 = sx0 + x * fx;
      const x1 = x0 + fx;
      // area-average over the source footprint (exact box filter for downscaling)
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let wsum = 0;
      for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++) {
        const wy = Math.min(y1, yy + 1) - Math.max(y0, yy);
        if (wy <= 0) continue;
        for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) {
          const wx = Math.min(x1, xx + 1) - Math.max(x0, xx);
          if (wx <= 0) continue;
          const p = (Math.min(img.height - 1, yy) * img.width + Math.min(img.width - 1, xx)) * 4;
          const wt = wx * wy;
          const al = img.data[p + 3];
          r += img.data[p] * al * wt;
          g += img.data[p + 1] * al * wt;
          b += img.data[p + 2] * al * wt;
          a += al * wt;
          wsum += wt;
        }
      }
      const q = (y * w + x) * 4;
      if (a > 0) {
        out[q] = r / a;
        out[q + 1] = g / a;
        out[q + 2] = b / a;
      }
      out[q + 3] = wsum > 0 ? a / wsum : 0;
    }
  }
  return { data: out, width: w, height: h };
}
