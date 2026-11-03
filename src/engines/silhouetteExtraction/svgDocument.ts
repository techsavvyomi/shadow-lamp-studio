/**
 * Extracts filled vector geometry from an SVG document (requires DOMParser: the
 * browser main thread, or happy-dom in tests).
 *
 * Every filled element (path, rect, circle, ellipse, polygon, polyline) is flattened
 * with its accumulated transform. Fill, fill-rule, display and opacity are resolved
 * from attributes, inline styles, simple class/tag rules in <style> blocks and
 * inheritance. Shapes are kept in document (painter's) order; a light-coloured fill
 * painted over darker shapes subtracts from the silhouette, matching how the
 * drawing looks.
 */
import type { FillRule, Loop, Rect, Shape, SilhouetteData } from '@/types';
import { type Affine, applyAffine, composeAffine, ellipsePoints, IDENTITY, parsePathData, parseTransform, roundedRectPoints } from './svgPath';

const SKIP = new Set(['defs', 'clipPath', 'mask', 'symbol', 'style', 'title', 'desc', 'metadata', 'pattern', 'marker', 'linearGradient', 'radialGradient', 'filter', 'script', 'text']);

interface Style {
  fill: string;
  fillRule: FillRule;
  hidden: boolean;
  opacity: number;
}

const NAMED: Record<string, [number, number, number]> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  silver: [192, 192, 192],
  yellow: [255, 255, 0],
  orange: [255, 165, 0],
  navy: [0, 0, 128],
  maroon: [128, 0, 0],
  purple: [128, 0, 128],
  teal: [0, 128, 128],
  olive: [128, 128, 0],
  lime: [0, 255, 0],
  aqua: [0, 255, 255],
  fuchsia: [255, 0, 255],
  brown: [165, 42, 42],
};

/** Relative luminance of a CSS colour, or null for none/unknown (treated as dark). */
export function colourLuminance(c: string): number | null {
  const s = c.trim().toLowerCase();
  if (s === 'none' || s === 'transparent') return null;
  let rgb: [number, number, number] | null = NAMED[s] ?? null;
  if (!rgb && s.startsWith('#')) {
    const h = s.slice(1);
    if (h.length === 3 || h.length === 4) rgb = [0, 1, 2].map((i) => parseInt(h[i] + h[i], 16)) as [number, number, number];
    else if (h.length >= 6) rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  }
  if (!rgb) {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const parts = m[1].split(/[\s,/]+/).filter(Boolean);
      rgb = parts.slice(0, 3).map((p) => (p.endsWith('%') ? (parseFloat(p) * 255) / 100 : parseFloat(p))) as [number, number, number];
    }
  }
  if (!rgb || rgb.some((v) => Number.isNaN(v))) return 0; // currentColor, url(#grad), etc.
  return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
}

function parseStyleBlocks(doc: Document): Map<string, Record<string, string>> {
  const rules = new Map<string, Record<string, string>>();
  for (const el of Array.from(doc.getElementsByTagName('style'))) {
    const css = (el.textContent ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
    const re = /([^{}]+)\{([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(css))) {
      const decls = parseDecls(m[2]);
      for (const sel of m[1].split(',').map((x) => x.trim())) {
        if (/^[.#]?[\w-]+$/.test(sel)) rules.set(sel, { ...(rules.get(sel) ?? {}), ...decls });
      }
    }
  }
  return rules;
}

function parseDecls(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of s.split(';')) {
    const i = d.indexOf(':');
    if (i > 0) out[d.slice(0, i).trim().toLowerCase()] = d.slice(i + 1).trim();
  }
  return out;
}

const num = (el: Element, name: string, def = 0) => {
  const v = el.getAttribute(name);
  const f = v === null ? NaN : parseFloat(v);
  return Number.isFinite(f) ? f : def;
};

export interface SvgExtraction {
  silhouette: SilhouetteData;
  warnings: string[];
  elementCount: number;
}

export function extractSvg(svgText: string, tolerance = 0.2): SvgExtraction {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length)
    throw new Error('Not a valid SVG document');
  const rules = parseStyleBlocks(doc);
  const warnings: string[] = [];
  const shapes: Shape[] = [];
  const byId = new Map<string, Element>();
  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    const id = el.getAttribute('id');
    if (id) byId.set(id, el);
  }

  const vb = (root.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  let frame: Rect | null = vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0 ? { x: vb[0], y: vb[1], w: vb[2], h: vb[3] } : null;
  if (!frame) {
    const w = num(root, 'width', NaN);
    const h = num(root, 'height', NaN);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) frame = { x: 0, y: 0, w, h };
  }

  const resolveStyle = (el: Element, parent: Style): Style => {
    const props: Record<string, string> = {};
    const tag = el.nodeName;
    Object.assign(props, rules.get(tag) ?? {});
    for (const cls of (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)) Object.assign(props, rules.get('.' + cls) ?? {});
    const id = el.getAttribute('id');
    if (id) Object.assign(props, rules.get('#' + id) ?? {});
    for (const a of ['fill', 'fill-rule', 'display', 'visibility', 'opacity', 'fill-opacity']) {
      const v = el.getAttribute(a);
      if (v !== null) props[a] = v;
    }
    Object.assign(props, parseDecls(el.getAttribute('style') ?? ''));
    const opacity = parent.opacity * (props['opacity'] !== undefined ? parseFloat(props['opacity']) : 1);
    const fillOpacity = props['fill-opacity'] !== undefined ? parseFloat(props['fill-opacity']) : 1;
    return {
      fill: props['fill'] && props['fill'] !== 'inherit' ? props['fill'] : parent.fill,
      fillRule: props['fill-rule'] === 'evenodd' ? 'evenodd' : props['fill-rule'] === 'nonzero' ? 'nonzero' : parent.fillRule,
      hidden: parent.hidden || props['display'] === 'none' || props['visibility'] === 'hidden' || opacity * fillOpacity < 0.05,
      opacity,
    };
  };

  const emit = (loops: Loop[], style: Style, m: Affine) => {
    const lum = colourLuminance(style.fill);
    if (lum === null || style.hidden) return;
    const tl = loops.filter((l) => l.length >= 3).map((l) => l.map((p) => applyAffine(m, p)));
    if (tl.length) shapes.push({ loops: tl, fillRule: style.fillRule, subtract: lum > 0.6 });
  };

  const walk = (el: Element, parentM: Affine, parentStyle: Style, depth: number) => {
    if (depth > 64) return;
    const tag = el.nodeName.replace(/^svg:/, '');
    if (SKIP.has(tag)) return;
    const style = resolveStyle(el, parentStyle);
    if (style.hidden && tag !== 'g' && tag !== 'svg') return;
    let m = composeAffine(parentM, parseTransform(el.getAttribute('transform')));
    switch (tag) {
      case 'svg':
      case 'g':
      case 'a':
      case 'switch':
        for (const c of Array.from(el.children)) walk(c, m, style, depth + 1);
        return;
      case 'use': {
        const href = el.getAttribute('href') ?? el.getAttribute('xlink:href') ?? '';
        const target = href.startsWith('#') ? byId.get(href.slice(1)) : undefined;
        if (target) {
          m = composeAffine(m, [1, 0, 0, 1, num(el, 'x'), num(el, 'y')]);
          if (target.nodeName === 'symbol') for (const c of Array.from(target.children)) walk(c, m, style, depth + 1);
          else walk(target, m, style, depth + 1);
        }
        return;
      }
      case 'path': {
        try {
          const sp = parsePathData(el.getAttribute('d') ?? '', tolerance);
          emit(
            sp.map((s) => s.points),
            style,
            m,
          );
        } catch {
          warnings.push('Skipped a path with malformed data.');
        }
        return;
      }
      case 'rect':
        emit([roundedRectPoints(num(el, 'x'), num(el, 'y'), num(el, 'width'), num(el, 'height'), num(el, 'rx', num(el, 'ry')), num(el, 'ry', num(el, 'rx')), tolerance)], style, m);
        return;
      case 'circle':
        emit([ellipsePoints(num(el, 'cx'), num(el, 'cy'), num(el, 'r'), num(el, 'r'), tolerance)], style, m);
        return;
      case 'ellipse':
        emit([ellipsePoints(num(el, 'cx'), num(el, 'cy'), num(el, 'rx'), num(el, 'ry'), tolerance)], style, m);
        return;
      case 'polygon':
      case 'polyline': {
        const v = (el.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number);
        const pts: Loop = [];
        for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i], v[i + 1]]);
        emit([pts], style, m);
        return;
      }
      default:
        return;
    }
  };

  walk(root, IDENTITY, { fill: 'black', fillRule: 'nonzero', hidden: false, opacity: 1 }, 0);

  if (shapes.length && shapes.every((s) => s.subtract)) {
    for (const s of shapes) s.subtract = false;
    warnings.push('Only light-coloured fills found; treating them all as the silhouette.');
  }
  if (!shapes.length) warnings.push('No filled shapes found (stroke-only artwork?). Disable "exact vector paths" to rasterise instead.');

  if (!frame) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const s of shapes)
      for (const l of s.loops)
        for (const [x, y] of l) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
    frame = Number.isFinite(minX) ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : { x: 0, y: 0, w: 1, h: 1 };
  }
  return { silhouette: { shapes, frame, invert: false, source: 'vector' }, warnings, elementCount: shapes.length };
}
