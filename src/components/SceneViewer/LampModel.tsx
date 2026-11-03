import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import { CylinderGeometry, type Group, MeshStandardMaterial } from 'three';
import { HOLDER, holderRimY } from '@/engines/lampGeometry/structure';
import { useDesignStore } from '@/stores/designStore';
import { useGeometryStore } from '@/stores/geometryStore';
import { MATERIALS, useViewStore, type ViewMode } from '@/stores/viewStore';
import { PANEL_IDS, type PanelId, type PartId } from '@/types';

const EXPLODE_MM = 60;
const GHOST: Partial<Record<PartId, boolean>> = { front: true, right: true, top: true };

function PartMesh({ id, mode, selected }: { id: PartId; mode: ViewMode; selected: boolean }) {
  const geometry = useGeometryStore((s) => s.geometries[id]);
  const part = useGeometryStore((s) => s.result?.parts.find((p) => p.id === id));
  const preset = useViewStore((s) => MATERIALS[s.material]);
  const group = useRef<Group>(null);
  const ghost = mode === 'internal' && GHOST[id];
  const isPanel = PANEL_IDS.includes(id as PanelId);

  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        color: id === 'ledHolder' ? '#9a9da6' : preset.color,
        roughness: preset.roughness,
        metalness: preset.metalness,
        flatShading: true,
        transparent: !!ghost,
        opacity: ghost ? 0.14 : 1,
        depthWrite: !ghost,
        emissive: selected && mode !== 'simulation' ? '#f7bd52' : '#000000',
        emissiveIntensity: selected ? 0.12 : 0,
      }),
    [preset, ghost, selected, mode, id],
  );
  useEffect(() => () => material.dispose(), [material]);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g || !part) return;
    const k = mode === 'exploded' ? EXPLODE_MM : 0;
    const t = 1 - Math.exp(-dt * 9);
    g.position.x += (part.explodeDir[0] * k - g.position.x) * t;
    g.position.y += (part.explodeDir[1] * k - g.position.y) * t;
    g.position.z += (part.explodeDir[2] * k - g.position.z) * t;
  });

  if (!geometry) return null;
  const onClick = isPanel
    ? (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        useViewStore.getState().selectPanel(id as PanelId);
        useViewStore.getState().setRightTab('inspect');
      }
    : undefined;
  return (
    <group ref={group}>
      <mesh geometry={geometry} material={material} onClick={onClick} castShadow={false} receiveShadow={false}>
        {mode !== 'simulation' && <Edges threshold={25} color={ghost ? '#7c8496' : '#0c0d10'} transparent opacity={ghost ? 0.5 : 0.55} />}
      </mesh>
    </group>
  );
}

/** Opaque lower body of the LED package (the dome above the die is clear). */
export function useLedBodyGeometry() {
  const light = useDesignStore((s) => s.design.light);
  const resolved = useGeometryStore((s) => s.result?.light);
  return useMemo(() => {
    const p = resolved ?? light.position;
    const lightAt = { ...light, position: p };
    const bottom = holderRimY(lightAt) - HOLDER.seatDepth;
    const top = p[1] - 0.8;
    const h = Math.max(0.5, top - bottom);
    const g = new CylinderGeometry(light.ledDiameter / 2, light.ledDiameter / 2, h, 24);
    g.translate(p[0], bottom + h / 2, p[2]);
    return g;
  }, [light, resolved]);
}

export function LedMarker({ glow }: { glow: boolean }) {
  const resolved = useGeometryStore((s) => s.result?.light);
  const design = useDesignStore((s) => s.design.light.position);
  const wall = useDesignStore((s) => s.design.mounting.type === 'wall');
  const body = useLedBodyGeometry();
  useEffect(() => () => body.dispose(), [body]);
  const p = resolved ?? design;
  return (
    <group>
      {/* table: opaque 5 mm LED package; wall: a short filament tube glowing all round */}
      <mesh geometry={body}>
        {wall ? (
          <meshBasicMaterial color={glow ? '#fff1cc' : '#8a8d96'} transparent opacity={glow ? 0.9 : 0.6} toneMapped={false} />
        ) : (
          <meshStandardMaterial color="#d9d5c8" roughness={0.4} transparent opacity={0.85} />
        )}
      </mesh>
      <mesh position={p}>
        <sphereGeometry args={[1.4, 20, 14]} />
        <meshBasicMaterial color={glow ? '#fff6dc' : '#6b6e78'} toneMapped={false} />
      </mesh>
      {glow && (
        <mesh position={p}>
          <sphereGeometry args={[4.5, 20, 14]} />
          <meshBasicMaterial color="#ffd27a" transparent opacity={0.22} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

export function LampModel({ mode }: { mode: ViewMode }) {
  const parts = useGeometryStore((s) => s.result?.parts);
  const visible = useViewStore((s) => s.visible);
  const selected = useViewStore((s) => s.selectedPanel);
  return (
    <group>
      {parts?.map((p) =>
        visible[p.id] ? <PartMesh key={p.id} id={p.id} mode={mode} selected={mode !== 'simulation' && p.id === selected} /> : null,
      )}
    </group>
  );
}
