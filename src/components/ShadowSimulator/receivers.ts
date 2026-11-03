import { madd } from '@/engines/math/vec';
import { panelFrame, wallFrameForPanel } from '@/engines/projectionGeometry/frames';
import type { SimulationSettings } from '@/stores/viewStore';
import type { LampDimensions, MountingConfig, PanelId, Vec3 } from '@/types';

/** A planar light receiver (wall or floor) with an orthonormal frame u × v = normal. */
export interface Receiver {
  id: string;
  origin: Vec3;
  u: Vec3;
  v: Vec3;
  normal: Vec3;
  centre: Vec3;
  width: number;
  height: number;
  resolution: [number, number];
  kind: 'wall' | 'floor';
}

export const ROOM_HEIGHT = 1600;
const TEX = 1024;

function res(w: number, h: number): [number, number] {
  const k = TEX / Math.max(w, h);
  return [Math.max(64, Math.round(w * k)), Math.max(64, Math.round(h * k))];
}

const mk = (id: string, kind: Receiver['kind'], origin: Vec3, u: Vec3, v: Vec3, normal: Vec3, centre: Vec3, width: number, height: number, tex = TEX): Receiver => {
  const k = tex / Math.max(width, height);
  return { id, kind, origin, u, v, normal, centre, width, height, resolution: [Math.max(64, Math.round(width * k)), Math.max(64, Math.round(height * k))] };
};

/**
 * Wall lamp room (world coordinates): the mounting wall is z = 0 facing +z, with
 * floor, ceiling and side walls around a 2.5 m deep room. The mounting wall gets a
 * finer texture because the figure's edges are sharp right next to the lamp.
 */
function wallRoom(m: MountingConfig): Receiver[] {
  const W = 2600;
  const C = m.ceilingHeight;
  const depth = 2500;
  return [
    mk('mount', 'wall', [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [0, C / 2, 0], W, C, 2048),
    mk('floor', 'floor', [0, 0, 0], [1, 0, 0], [0, 0, -1], [0, 1, 0], [0, 0, depth / 2], W, depth),
    mk('ceiling', 'wall', [0, C, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0], [0, C, depth / 2], W, depth),
    mk('left', 'wall', [-W / 2, 0, 0], [0, 0, -1], [0, 1, 0], [1, 0, 0], [-W / 2, C / 2, depth / 2], depth, C),
    mk('right', 'wall', [W / 2, 0, 0], [0, 0, 1], [0, 1, 0], [-1, 0, 0], [W / 2, C / 2, depth / 2], depth, C),
  ];
}

export function buildReceivers(
  lamp: LampDimensions,
  sim: Pick<SimulationSettings, 'room' | 'wallDistance' | 'wallYaw'>,
  mounting?: MountingConfig,
): Receiver[] {
  if (mounting?.type === 'wall') return wallRoom(mounting);
  const d = sim.wallDistance;
  const out: Receiver[] = [];
  const ids: PanelId[] = sim.room === 'room' ? ['front', 'right', 'back', 'left'] : ['front'];
  for (const id of ids) {
    const f = panelFrame(id, lamp);
    const w = wallFrameForPanel(f, { distance: d, yaw: sim.room === 'single' ? sim.wallYaw : 0, pitch: 0 });
    const width =
      sim.room === 'single' ? Math.max(1400, 2 * (d + lamp.width) + 600) : id === 'front' || id === 'back' ? lamp.width + 2 * d : lamp.depth + 2 * d;
    out.push({
      id,
      origin: w.origin,
      u: w.u,
      v: w.v,
      normal: w.normal,
      centre: madd(w.origin, w.v, ROOM_HEIGHT / 2),
      width,
      height: ROOM_HEIGHT,
      resolution: res(width, ROOM_HEIGHT),
      kind: 'wall',
    });
  }
  const fw = lamp.width + 2 * d;
  const fd = lamp.depth + 2 * d;
  out.push({
    id: 'floor',
    origin: [0, 0, 0],
    u: [1, 0, 0],
    v: [0, 0, -1],
    normal: [0, 1, 0],
    centre: [0, 0, 0],
    width: fw,
    height: fd,
    resolution: res(fw, fd),
    kind: 'floor',
  });
  return out;
}
