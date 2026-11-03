import { useEffect, useMemo } from 'react';
import { Edges, Html } from '@react-three/drei';
import { Matrix4, MeshStandardMaterial } from 'three';
import { invertRigid } from '@/engines/math/vec';
import { panelLabel } from '@/engines/projectionGeometry/mounting';
import { panelFrame } from '@/engines/projectionGeometry/frames';
import { useDesignStore } from '@/stores/designStore';
import { useGeometryStore } from '@/stores/geometryStore';
import { MATERIALS, useViewStore } from '@/stores/viewStore';
import { PANEL_IDS } from '@/types';
import { cn } from '@/utils';

/** The four panels laid side by side, outer face towards the viewer. */
export function PanelLayout() {
  const lamp = useDesignStore((s) => s.design.lamp);
  const mounting = useDesignStore((s) => s.design.mounting.type);
  const geometries = useGeometryStore((s) => s.geometries);
  const panels = useGeometryStore((s) => s.result?.panels);
  const preset = useViewStore((s) => MATERIALS[s.material]);
  const selected = useViewStore((s) => s.selectedPanel);
  const gap = 18;

  const layout = useMemo(() => {
    const frames = PANEL_IDS.map((id) => panelFrame(id, lamp));
    const total = frames.reduce((s, f) => s + f.width, 0) + gap * (frames.length - 1);
    let x = -total / 2;
    return frames.map((f) => {
      const m = new Matrix4().fromArray(invertRigid(f.matrix));
      const place = new Matrix4().makeTranslation(x, 20, 0);
      const x0 = x;
      x += f.width + gap;
      return { id: f.id, frame: f, matrix: place.multiply(m), x0 };
    });
  }, [lamp]);

  const material = useMemo(() => new MeshStandardMaterial({ color: preset.color, roughness: preset.roughness, metalness: preset.metalness, flatShading: true }), [preset]);
  const selMaterial = useMemo(
    () => new MeshStandardMaterial({ color: preset.color, roughness: preset.roughness, metalness: preset.metalness, flatShading: true, emissive: '#f7bd52', emissiveIntensity: 0.14 }),
    [preset],
  );
  useEffect(
    () => () => {
      material.dispose();
      selMaterial.dispose();
    },
    [material, selMaterial],
  );

  return (
    <group>
      {layout.map(({ id, frame, matrix, x0 }) => {
        const geo = geometries[id];
        if (!geo) return null;
        const a = panels?.[id];
        return (
          <group key={id}>
            <mesh
              geometry={geo}
              material={id === selected ? selMaterial : material}
              matrixAutoUpdate={false}
              matrix={matrix}
              onClick={(e) => {
                e.stopPropagation();
                useViewStore.getState().selectPanel(id);
                useViewStore.getState().setRightTab('inspect');
              }}
            >
              <Edges threshold={25} color="#0c0d10" transparent opacity={0.6} />
            </mesh>
            <Html position={[x0 + frame.width / 2, 20 - 10, 0]} center zIndexRange={[10, 0]}>
              <button
                onClick={() => useViewStore.getState().selectPanel(id)}
                className={cn(
                  'whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium backdrop-blur',
                  id === selected ? 'border-glow-500 bg-glow-400/15 text-glow-200' : 'border-ink-600 bg-ink-900/80 text-ink-200',
                )}
              >
                {panelLabel(mounting, id)} · {frame.width.toFixed(0)}×{(a?.height ?? frame.height).toFixed(0)} mm{a && !a.active ? ' · solid' : ''}
              </button>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
