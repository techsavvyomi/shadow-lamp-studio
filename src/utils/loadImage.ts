import { extractSvg } from '@/engines/silhouetteExtraction/svgDocument';
import type { SourceImage } from '@/stores/imageStore';
import type { SilhouetteData } from '@/types';

/** Longest side kept after decoding; bounds memory for very large uploads. */
const MAX_DECODE = 2048;
const MAX_BYTES = 40 * 1024 * 1024;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];

export const ACCEPT_ATTR = '.png,.jpg,.jpeg,.svg,.webp,image/png,image/jpeg,image/svg+xml,image/webp';

function fitSize(w: number, h: number, max: number) {
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

function draw(img: CanvasImageSource, w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is not available in this browser.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h);
  return { data: d.data, width: w, height: h };
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The image could not be decoded.'));
    img.src = url;
  });
}

export async function loadImageFile(file: File): Promise<SourceImage> {
  const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
  if (!isSvg && !ACCEPTED.includes(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name))
    throw new Error(`Unsupported file type "${file.type || file.name}". Use PNG, JPG or SVG.`);
  if (file.size > MAX_BYTES) throw new Error(`File is ${(file.size / 1048576).toFixed(0)} MB; the limit is 40 MB.`);

  if (isSvg) {
    const text = await file.text();
    let vector: SilhouetteData | null = null;
    let warnings: string[] = [];
    try {
      const ex = extractSvg(text);
      vector = ex.silhouette;
      warnings = ex.warnings;
    } catch (e) {
      warnings = [e instanceof Error ? e.message : 'SVG could not be parsed as vectors; using raster mode.'];
    }
    const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
    const img = await loadHtmlImage(url);
    const aspectW = vector?.frame.w || img.naturalWidth || 1024;
    const aspectH = vector?.frame.h || img.naturalHeight || 1024;
    const { w, h } = fitSize(aspectW * 100, aspectH * 100, 1600);
    // Transparency is kept: auto mode then segments by the alpha channel.
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h);
    return {
      name: file.name,
      kind: 'svg',
      rgba: { data: d.data, width: w, height: h },
      url,
      vector,
      vectorWarnings: warnings,
      originalWidth: Math.round(aspectW),
      originalHeight: Math.round(aspectH),
    };
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('The image could not be decoded — the file may be corrupt.');
  }
  const { w, h } = fitSize(bitmap.width, bitmap.height, MAX_DECODE);
  const rgba = draw(bitmap, w, h);
  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;
  bitmap.close();
  return {
    name: file.name,
    kind: 'raster',
    rgba,
    url: URL.createObjectURL(file),
    vector: null,
    vectorWarnings: [],
    originalWidth,
    originalHeight,
  };
}

export async function loadSample(url: string, name: string): Promise<SourceImage> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load sample ${name}`);
  const blob = await res.blob();
  return loadImageFile(new File([blob], name, { type: blob.type || (name.endsWith('.svg') ? 'image/svg+xml' : 'image/png') }));
}
