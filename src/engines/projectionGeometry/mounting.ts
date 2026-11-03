/**
 * Mounting geometry. All parts are generated in *lamp coordinates*: the base / wall
 * plate lies on the plane y = 0 and the side walls rise along +y. A table lamp
 * keeps that orientation in the room; a wall lamp is rotated so lamp +y points out
 * of the wall into the room and lamp +z points down:
 *
 *   world = T(0, mountHeight, 0) · Rx(90°) · Ry(rotation) · lamp
 *
 * so lamp (x, y, z) ↦ world (x, mountHeight − z, y) for zero rotation, with the
 * wall itself being the plane world z = 0.
 */
import type { Mat4, MountingConfig, PanelId, PartId } from '@/types';
import { deg2rad, multiply, rotationX, translation } from '../math/vec';
import type { WallFrame } from './frames';

export function rotationY(angle: number): Mat4 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}

/** Lamp → room transform. `rotationDeg` spins the lamp about its own axis (yaw on a table, roll on a wall). */
export function lampWorldMatrix(type: MountingConfig['type'], mountHeight: number, rotationDeg = 0): Mat4 {
  const spin = rotationY(deg2rad(rotationDeg));
  if (type === 'table') return spin;
  return multiply(translation([0, mountHeight, 0]), multiply(rotationX(Math.PI / 2), spin));
}

/**
 * Wall lamp receiver: the mounting wall, i.e. the lamp plane y = 0, seen from the
 * room. a → right (lamp +x), b → up (lamp −z), normal → into the room (lamp +y).
 * The lamp centre is at (a, b) = (0, 0); world height = mountHeight + b.
 */
export function mountingWallFrame(): WallFrame {
  return { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 0, -1], normal: [0, 1, 0] };
}

const TABLE_NAMES: Record<PartId, { name: string; file: string }> = {
  front: { name: 'Front panel', file: 'Front_Panel.stl' },
  back: { name: 'Back panel', file: 'Back_Panel.stl' },
  left: { name: 'Left panel', file: 'Left_Panel.stl' },
  right: { name: 'Right panel', file: 'Right_Panel.stl' },
  base: { name: 'Base plate', file: 'Base_Plate.stl' },
  top: { name: 'Top cover', file: 'Top_Cover.stl' },
  ledHolder: { name: 'LED holder', file: 'LED_Holder.stl' },
};

/** On a wall lamp, lamp +z points down: the "front" wall is the lower side wall. */
const WALL_NAMES: Record<PartId, { name: string; file: string }> = {
  front: { name: 'Lower side wall', file: 'Lower_Wall.stl' },
  back: { name: 'Upper side wall', file: 'Upper_Wall.stl' },
  left: { name: 'Left side wall', file: 'Left_Wall.stl' },
  right: { name: 'Right side wall', file: 'Right_Wall.stl' },
  base: { name: 'Wall plate', file: 'Wall_Plate.stl' },
  top: { name: 'Front cover', file: 'Front_Cover.stl' },
  ledHolder: { name: 'LED post', file: 'LED_Post.stl' },
};

export const partNames = (type: MountingConfig['type']) => (type === 'wall' ? WALL_NAMES : TABLE_NAMES);

export const panelLabel = (type: MountingConfig['type'], id: PanelId) =>
  type === 'wall' ? { front: 'Lower', back: 'Upper', left: 'Left', right: 'Right' }[id] : { front: 'Front', back: 'Back', left: 'Left', right: 'Right' }[id];
