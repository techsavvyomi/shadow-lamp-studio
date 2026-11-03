/**
 * Artwork for the wall plate's raised decoration, as resolution-independent
 * silhouettes (y down, like SVG) that the geometry engine scales onto the plate.
 *
 *  - built-in shapes, drawn on a 100 × 100 canvas; light parts (`subtract`) become
 *    recesses in the relief;
 *  - text, laid out with a real font (opentype.js) and flattened to polygons.
 */
import type { Font, Path } from 'opentype.js';
import type { DecorationFont, DecorationIcon, Loop, Shape, SilhouetteData, Vec2 } from '@/types';
import { ellipsePoints, parsePathData } from '../silhouetteExtraction/svgPath';

const TOL = 0.12;
const path = (d: string): Loop[] =>
  parsePathData(d, TOL)
    .map((s) => s.points)
    .filter((l) => l.length >= 3);
const ellipse = (cx: number, cy: number, rx: number, ry: number): Loop => ellipsePoints(cx, cy, rx, ry, TOL);
const add = (loops: Loop[]): Shape => ({ loops, fillRule: 'nonzero' });
const cut = (loops: Loop[]): Shape => ({ loops, fillRule: 'nonzero', subtract: true });

function star(cx: number, cy: number, R: number, r: number, points = 5): Loop {
  return Array.from({ length: points * 2 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const k = i % 2 ? r : R;
    return [cx + k * Math.cos(a), cy + k * Math.sin(a)] as Vec2;
  });
}

const ICONS: Record<Exclude<DecorationIcon, 'figure'>, () => Shape[]> = {
  moon: () => [add([ellipse(50, 50, 42, 42)]), cut([ellipse(67, 39, 35, 35)])],
  star: () => [add([star(50, 53, 47, 19)])],
  heart: () => [add(path('M50 90 C22 68 4 50 10 28 C16 8 42 6 50 26 C58 6 84 8 90 28 C96 50 78 68 50 90 Z'))],
  bat: () => [
    add(
      path(
        'M50 40 L53 41 L57 30 L59 43 Q70 40 80 32 Q88 26 98 30 Q90 37 90 47 Q84 42 78 48 Q74 44 69 51 Q65 47 60 53 Q55 56 52 64 L50 69 L48 64 Q45 56 40 53 Q35 47 31 51 Q26 44 22 48 Q16 42 10 47 Q10 37 2 30 Q12 26 20 32 Q30 40 41 43 L43 30 L47 41 Z',
      ),
    ),
  ],
  pumpkin: () => [
    add([ellipse(33, 62, 19, 27), ellipse(67, 62, 19, 27), ellipse(50, 61, 21, 30)]),
    add(path('M46 35 L45 21 Q49 15 56 18 L54 23 Q51 23 51 28 L53 35 Z')),
    cut(path('M33 54 L43 54 L38 45 Z M57 54 L67 54 L62 45 Z M46 64 L54 64 L50 58 Z')),
    cut(path('M29 70 Q50 90 71 70 Q67 73 63 71 L61 76 L56 72 L50 78 L44 72 L39 76 L37 71 Q33 73 29 70 Z')),
  ],
  ghost: () => [
    add(path('M26 90 L26 44 C26 12 74 12 74 44 L74 90 L66 82 L58 90 L50 82 L42 90 L34 82 Z')),
    cut([ellipse(40, 44, 4.5, 7), ellipse(60, 44, 4.5, 7), ellipse(50, 62, 5, 7)]),
  ],
};

export const ICON_OPTIONS: { value: DecorationIcon; label: string }[] = [
  { value: 'figure', label: 'Your figure' },
  { value: 'moon', label: 'Moon' },
  { value: 'star', label: 'Star' },
  { value: 'heart', label: 'Heart' },
  { value: 'bat', label: 'Bat' },
  { value: 'pumpkin', label: 'Pumpkin' },
  { value: 'ghost', label: 'Ghost' },
];

export const FONT_OPTIONS: { value: DecorationFont; label: string; family: string }[] = [
  { value: 'bold', label: 'Bold', family: 'Lilita One' },
  { value: 'spooky', label: 'Spooky', family: 'Creepster' },
  { value: 'script', label: 'Script', family: 'Pacifico' },
];

/** Built-in plate shape on a 100 × 100 canvas (`figure` is resolved by the caller). */
export function iconArt(icon: Exclude<DecorationIcon, 'figure'>): SilhouetteData {
  return { shapes: ICONS[icon](), frame: { x: 0, y: 0, w: 100, h: 100 }, invert: false, source: 'vector' };
}

/** Glyph outline commands → SVG path data in a fixed, parser-friendly format. */
function commandsToPathData(p: Path): string {
  const n = (v: number | undefined) => (v ?? 0).toFixed(3);
  return p.commands
    .map((c) => {
      switch (c.type) {
        case 'M':
        case 'L':
          return `${c.type}${n(c.x)} ${n(c.y)}`;
        case 'Q':
          return `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
        case 'C':
          return `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
        default:
          return 'Z';
      }
    })
    .join(' ');
}

/** Lines of text, centred under each other, as glyph outlines (non-zero fill). */
export function textArt(font: Font, text: string): SilhouetteData | null {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3);
  if (!lines.length) return null;
  const size = 100;
  const loops: Loop[] = [];
  lines.forEach((line, i) => {
    const w = font.getAdvanceWidth(line, size);
    const d = commandsToPathData(font.getPath(line, -w / 2, i * size * 1.2, size));
    if (d) loops.push(...path(d));
  });
  if (!loops.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const l of loops)
    for (const [x, y] of l) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  return { shapes: [add(loops)], frame: { x: x0 - 1, y: y0 - 1, w: x1 - x0 + 2, h: y1 - y0 + 2 }, invert: false, source: 'vector' };
}

/** SVG path data for a silhouette's shapes (used for small UI previews). */
export function shapeToPathData(shape: Shape): string {
  return shape.loops.map((l) => `M${l.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}Z`).join('');
}
