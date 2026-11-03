/**
 * Resolves the wall plate decoration to artwork for the geometry worker: the lamp's
 * own silhouette, a built-in shape, or text set in one of the bundled fonts.
 */
import { useEffect, useMemo, useState } from 'react';
import { parse, type Font } from 'opentype.js';
import boldUrl from '@fontsource/lilita-one/files/lilita-one-latin-400-normal.woff?url';
import spookyUrl from '@fontsource/creepster/files/creepster-latin-400-normal.woff?url';
import scriptUrl from '@fontsource/pacifico/files/pacifico-latin-400-normal.woff?url';
import { iconArt, textArt } from '@/engines/decoration/plateArt';
import { useDesignStore } from '@/stores/designStore';
import type { DecorationFont, SilhouetteData } from '@/types';

export const FONT_URLS: Record<DecorationFont, string> = { bold: boldUrl, spooky: spookyUrl, script: scriptUrl };

const fonts = new Map<DecorationFont, Promise<Font>>();

export function loadDecorationFont(f: DecorationFont): Promise<Font> {
  let p = fonts.get(f);
  if (!p) {
    p = fetch(FONT_URLS[f])
      .then((r) => {
        if (!r.ok) throw new Error(`Font download failed (${r.status})`);
        return r.arrayBuffer();
      })
      .then(parse);
    p.catch(() => fonts.delete(f));
    fonts.set(f, p);
  }
  return p;
}

/** `pending` while a font is still loading, so geometry is not built without the text. */
export function usePlateArt(silhouette: SilhouetteData | null): { art: SilhouetteData | null; pending: boolean; error: string | null } {
  const deco = useDesignStore((s) => s.design.decoration);
  const wall = useDesignStore((s) => s.design.mounting.type === 'wall');
  const [loaded, setLoaded] = useState<{ key: DecorationFont; font: Font } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wantsFont = wall && deco.kind === 'text';

  useEffect(() => {
    if (!wantsFont) return;
    let live = true;
    setError(null);
    loadDecorationFont(deco.font)
      .then((font) => live && setLoaded({ key: deco.font, font }))
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [wantsFont, deco.font]);

  return useMemo(() => {
    if (!wall || deco.kind === 'none') return { art: null, pending: false, error: null };
    if (deco.kind === 'silhouette') return { art: deco.icon === 'figure' ? silhouette : iconArt(deco.icon), pending: false, error: null };
    if (error) return { art: null, pending: false, error };
    if (!loaded || loaded.key !== deco.font) return { art: null, pending: true, error: null };
    return { art: textArt(loaded.font, deco.text), pending: false, error: null };
  }, [wall, deco.kind, deco.icon, deco.font, deco.text, silhouette, loaded, error]);
}
