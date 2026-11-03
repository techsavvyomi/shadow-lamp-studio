/**
 * Real-time shadow simulation driven by the actual generated meshes.
 *
 * For each receiver plane (walls, floor) and each emitter sample, every triangle of
 * the lamp is projected onto the plane with the planar shadow matrix and rendered
 * into a coverage mask; the masks are averaged into an occlusion texture (soft
 * shadows from a finite emitter). Receivers are then shaded with physical
 * illuminance. Nothing here is a pre-baked image: move the light, the lamp or the
 * walls and the result is recomputed from the geometry.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  HalfFloatType,
  LinearFilter,
  Matrix4,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import { lampWorldMatrix } from '@/engines/projectionGeometry/mounting';
import { panelFrame, panelToWorld } from '@/engines/projectionGeometry/frames';
import { emitterSamples, shadowMatrix } from '@/engines/shadowProjection/shadowMatrix';
import { useDesignStore } from '@/stores/designStore';
import { useGeometryStore } from '@/stores/geometryStore';
import { useViewStore } from '@/stores/viewStore';
import { PANEL_IDS, type Vec3 } from '@/types';
import { LampModel, LedMarker, useLedBodyGeometry } from '../SceneViewer/LampModel';
import { buildReceivers, type Receiver } from './receivers';
import { createAccumulateMaterial, createProjectionMaterial, createReceiverMaterial } from './shaders';

interface ReceiverGpu {
  receiver: Receiver;
  accum: WebGLRenderTarget;
  mask: WebGLRenderTarget;
  camera: OrthographicCamera;
  material: ReturnType<typeof createReceiverMaterial>;
  matrix: Matrix4;
}

function createReceiverGpu(r: Receiver): ReceiverGpu {
  const [w, h] = r.resolution;
  const accum = new WebGLRenderTarget(w, h, { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false });
  const mask = new WebGLRenderTarget(w, h, { minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false });
  const camera = new OrthographicCamera(-r.width / 2, r.width / 2, r.height / 2, -r.height / 2, 0.1, 100);
  camera.position.set(r.centre[0] + r.normal[0] * 10, r.centre[1] + r.normal[1] * 10, r.centre[2] + r.normal[2] * 10);
  camera.up.set(r.v[0], r.v[1], r.v[2]);
  camera.lookAt(r.centre[0], r.centre[1], r.centre[2]);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const matrix = new Matrix4()
    .makeBasis(new Vector3(...r.u), new Vector3(...r.v), new Vector3(...r.normal))
    .setPosition(r.centre[0], r.centre[1] - (r.kind === 'floor' ? 0.05 : 0), r.centre[2]);
  return { receiver: r, accum, mask, camera, material: createReceiverMaterial(accum.texture), matrix };
}

const quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

export function ShadowSimulator() {
  const gl = useThree((s) => s.gl);
  const lamp = useDesignStore((s) => s.design.lamp);
  const lightCfg = useDesignStore((s) => s.design.light);
  const mounting = useDesignStore((s) => s.design.mounting);
  const geometries = useGeometryStore((s) => s.geometries);
  const resolved = useGeometryStore((s) => s.result?.light);
  const visible = useViewStore((s) => s.visible);
  const sim = useViewStore((s) => s.sim);
  const ledBody = useLedBodyGeometry();
  useEffect(() => () => ledBody.dispose(), [ledBody]);
  // A wall lamp's emitter (filament / tube) shines backwards onto the wall, so no
  // opaque LED package sits behind it; a table lamp's 5 mm LED body does block light.
  const ledOccludes = mounting.type !== 'wall';

  // ---- receivers + GPU resources ---------------------------------------------------
  const receivers = useMemo(() => buildReceivers(lamp, sim, mounting), [lamp, sim.room, sim.wallDistance, sim.wallYaw, mounting]); // eslint-disable-line react-hooks/exhaustive-deps
  const gpu = useMemo(() => receivers.map(createReceiverGpu), [receivers]);
  useEffect(
    () => () =>
      gpu.forEach((g) => {
        g.accum.dispose();
        g.mask.dispose();
        g.material.dispose();
      }),
    [gpu],
  );
  const planes = useMemo(() => receivers.map((r) => new PlaneGeometry(r.width, r.height)), [receivers]);
  useEffect(() => () => planes.forEach((p) => p.dispose()), [planes]);

  // ---- occluder scene (same BufferGeometry instances as the preview/export) ---------
  const projMaterial = useMemo(createProjectionMaterial, []);
  const accMaterial = useMemo(createAccumulateMaterial, []);
  const quadScene = useMemo(() => {
    const s = new Scene();
    const m = new Mesh(new PlaneGeometry(2, 2), accMaterial);
    m.frustumCulled = false;
    s.add(m);
    return s;
  }, [accMaterial]);
  const occ = useMemo(() => ({ scene: new Scene(), group: new Group() }), []);
  useEffect(() => {
    occ.scene.add(occ.group);
    return () => {
      projMaterial.dispose();
      accMaterial.dispose();
      (quadScene.children[0] as Mesh).geometry.dispose();
    };
  }, [occ, projMaterial, accMaterial, quadScene]);
  useEffect(() => {
    occ.group.clear();
    for (const [id, g] of Object.entries(geometries)) {
      if (!g || !visible[id as keyof typeof visible]) continue;
      const m = new Mesh(g, projMaterial);
      m.frustumCulled = false;
      occ.group.add(m);
    }
    if (ledOccludes) {
      const led = new Mesh(ledBody, projMaterial);
      led.frustumCulled = false;
      occ.group.add(led);
    }
  }, [geometries, visible, ledBody, ledOccludes, occ, projMaterial]);

  // ---- light & lamp pose --------------------------------------------------------------
  const base = resolved ?? lightCfg.position;
  const lightLocal: Vec3 = [base[0] + sim.lightOffset[0], base[1] + sim.lightOffset[1], base[2] + sim.lightOffset[2]];
  // lamp → room: yaw on a table, roll on a wall (about the lamp's own axis)
  const lampMatrix = useMemo(() => new Matrix4().fromArray(lampWorldMatrix(mounting.type, mounting.height, sim.lampYaw)), [mounting.type, mounting.height, sim.lampYaw]);
  const lightWorld = useMemo(() => new Vector3(...lightLocal).applyMatrix4(lampMatrix), [lightLocal[0], lightLocal[1], lightLocal[2], lampMatrix]); // eslint-disable-line react-hooks/exhaustive-deps
  const emitter = sim.linked ? lightCfg.emitterSize : sim.emitterSize;
  const samples = emitter > 0.05 ? sim.quality : 1;

  const dirty = useRef(true);
  useEffect(() => {
    dirty.current = true;
  }, [gpu, geometries, visible, lightWorld, lampMatrix, emitter, samples, ledBody, ledOccludes]);

  useFrame(() => {
    // live uniforms
    const flux = sim.linked ? lightCfg.flux : sim.flux;
    const intensity = flux / (4 * Math.PI);
    for (const g of gpu) {
      const u = g.material.uniforms;
      u.uLight.value.copy(lightWorld);
      u.uIntensity.value = intensity;
      u.uOn.value = sim.ledOn ? 1 : 0;
      u.uPattern.value = lightCfg.pattern === 'lambertian-up' ? 1 : 0;
      // the LED's "up" is the lamp's +y axis (into the room for a wall lamp)
      (u.uLampUp.value as Vector3).set(0, 1, 0).transformDirection(lampMatrix);
      u.uAmbient.value = sim.ambient;
      u.uExposure.value = sim.exposure;
      (u.uColor.value as Color).set(g.receiver.kind === 'floor' ? sim.floorColor : sim.wallColor);
    }
    if (!dirty.current) return;
    dirty.current = false;

    occ.group.matrixAutoUpdate = false;
    occ.group.matrix.copy(lampMatrix);
    occ.group.updateMatrixWorld(true);
    const prevTarget = gl.getRenderTarget();
    const prevAutoClear = gl.autoClear;
    const prevColor = new Color();
    gl.getClearColor(prevColor);
    const prevAlpha = gl.getClearAlpha();
    gl.autoClear = false;
    gl.setClearColor(0x000000, 0);
    const L: Vec3 = [lightWorld.x, lightWorld.y, lightWorld.z];
    for (const g of gpu) {
      const r = g.receiver;
      gl.setRenderTarget(g.accum);
      gl.clear(true, false, false);
      const pts = emitterSamples(L, emitter, samples, r.u, r.v);
      accMaterial.uniforms.uMap.value = g.mask.texture;
      accMaterial.uniforms.uWeight.value = 1 / pts.length;
      for (const p of pts) {
        projMaterial.uniforms.uShadow.value.fromArray(shadowMatrix(p, r.normal, r.origin));
        gl.setRenderTarget(g.mask);
        gl.clear(true, false, false);
        gl.render(occ.scene, g.camera);
        gl.setRenderTarget(g.accum);
        gl.render(quadScene, quadCamera);
      }
    }
    gl.setRenderTarget(prevTarget);
    gl.autoClear = prevAutoClear;
    gl.setClearColor(prevColor, prevAlpha);
  });

  const pointIntensity = sim.ledOn ? ((sim.linked ? lightCfg.flux : sim.flux) / (4 * Math.PI)) * 9 * sim.exposure : 0;

  return (
    <group>
      {gpu.map((g, i) => (
        <mesh key={g.receiver.id} geometry={planes[i]} material={g.material} matrixAutoUpdate={false} matrix={g.matrix} />
      ))}
      <group matrixAutoUpdate={false} matrix={lampMatrix}>
        <LampModel mode="simulation" />
        <group position={sim.lightOffset}>
          <LedMarker glow={sim.ledOn} />
        </group>
        <pointLight position={lightLocal} intensity={pointIntensity} decay={2} distance={0} color="#fff1d6" />
      </group>
      {sim.showRays && <LightRays light={lightWorld} lampMatrix={lampMatrix} receivers={receivers} />}
    </group>
  );
}

/** Rays from the LED through the cut-out edges of each active panel to the wall. */
function LightRays({ light, lampMatrix, receivers }: { light: Vector3; lampMatrix: Matrix4; receivers: Receiver[] }) {
  const lamp = useDesignStore((s) => s.design.lamp);
  const drawings = useGeometryStore((s) => s.result?.drawings);
  const panels = useGeometryStore((s) => s.result?.panels);
  const geometry = useMemo(() => {
    const pos: number[] = [];
    if (!drawings || !panels) return new BufferGeometry();
    for (const id of PANEL_IDS) {
      if (!panels[id].active) continue;
      const f = panelFrame(id, lamp);
      const loops = drawings[id].holesOuter;
      const total = loops.reduce((s, l) => s + l.length, 0);
      const stride = Math.max(1, Math.floor(total / 90));
      let k = 0;
      for (const loop of loops)
        for (const [x, y] of loop) {
          if (k++ % stride) continue;
          const q = new Vector3(...panelToWorld(f, [x, y, f.thickness])).applyMatrix4(lampMatrix);
          const d = q.clone().sub(light).normalize();
          // nearest receiver hit
          let best = 4000;
          for (const r of receivers) {
            const n = new Vector3(...r.normal);
            const denom = n.dot(d);
            if (denom >= -1e-6) continue;
            const t = n.dot(new Vector3(...r.origin).sub(light)) / denom;
            if (t > 0 && t < best) best = t;
          }
          const end = light.clone().addScaledVector(d, best);
          pos.push(light.x, light.y, light.z, end.x, end.y, end.z);
        }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    return g;
  }, [drawings, panels, lamp, light, lampMatrix, receivers]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#ffd27a" transparent opacity={0.28} depthWrite={false} toneMapped={false} />
    </lineSegments>
  );
}
