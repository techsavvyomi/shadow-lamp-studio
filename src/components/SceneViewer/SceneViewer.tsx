import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { ACESFilmicToneMapping, Matrix4, SRGBColorSpace } from 'three';
import { lampWorldMatrix } from '@/engines/projectionGeometry/mounting';
import { useDesignStore } from '@/stores/designStore';
import { useViewStore, type ViewMode } from '@/stores/viewStore';
import { ShadowSimulator } from '../ShadowSimulator/ShadowSimulator';
import { SimulationControls } from '../ShadowSimulator/SimulationControls';
import { LampModel, LedMarker } from './LampModel';
import { PanelLayout } from './PanelLayout';
import { ViewModeBar } from './ViewModeBar';
import { WorkspaceStatus } from './WorkspaceStatus';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { Button } from '../ui/primitives';

function SceneError({ error, reset }: { error: Error; reset: () => void }) {
  const webgl = /webgl|context/i.test(error.message);
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md rounded-xl border border-bad/40 bg-ink-850 p-5 text-[12.5px] text-ink-200 shadow-2xl">
        <div className="mb-1 text-[14px] font-semibold text-ink-100">The 3D view could not start</div>
        <p className="text-ink-300">
          {webgl
            ? 'This browser could not create a WebGL context. Enable hardware acceleration (or WebGL) in the browser settings, or try a current Chrome, Edge, Firefox or Safari.'
            : 'An error occurred while rendering the scene. Geometry generation and export may still work.'}
        </p>
        <pre className="mt-3 max-h-32 overflow-auto rounded bg-ink-950 p-2 text-[11px] text-bad">{error.message}</pre>
        <Button className="mt-3" size="sm" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}

function CameraRig() {
  const mode = useViewStore((s) => s.mode);
  const token = useViewStore((s) => s.resetToken);
  const room = useViewStore((s) => s.sim.room);
  const wallDistance = useViewStore((s) => s.sim.wallDistance);
  const lamp = useDesignStore((s) => s.design.lamp);
  const mounting = useDesignStore((s) => s.design.mounting);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;

  useEffect(() => {
    const s = Math.max(lamp.width, lamp.depth, lamp.height);
    let pos: [number, number, number];
    let target: [number, number, number];
    const wall = mounting.type === 'wall';
    if (mode === 'simulation' && wall) {
      // Standing in the room facing the wall the lamp hangs on.
      pos = [-420, mounting.height + 240, 2100];
      target = [0, mounting.height, 0];
    } else if (wall && mode !== 'panels') {
      const cy = STUDIO_WALL_LIFT + lamp.depth / 2;
      pos = [s * 1.35, cy + s * 0.7, s * 2.7];
      target = [0, cy, lamp.height * 0.4];
    } else if (mode === 'simulation') {
      // Behind the (back-face-culled) back wall: frames the lamp and the front projection.
      const d = wallDistance + lamp.depth / 2;
      pos = [-d * 0.5, d * 0.9 + 120, -d * 1.9 - 120];
      target = [0, Math.min(360, d * 0.6), d * 0.55];
    } else if (mode === 'panels') {
      // Fit the side-by-side panel row (two widths, two depths, three gaps).
      const row = 2 * lamp.width + 2 * (lamp.depth - 2 * lamp.wallThickness) + 54;
      pos = [0, lamp.height * 0.55, row * 1.6];
      target = [0, lamp.height * 0.55, 0];
    } else {
      pos = [s * 1.9, s * 1.45, s * 2.3];
      target = [0, lamp.height * 0.45, 0];
    }
    camera.position.set(...pos);
    camera.near = 1;
    camera.far = 20000;
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.set(...target);
      controls.update();
    } else camera.lookAt(...target);
  }, [mode, token, room, wallDistance, lamp.width, lamp.depth, lamp.height, mounting.type, mounting.height, camera, controls]);
  return null;
}

function StudioLights() {
  return (
    <>
      <hemisphereLight args={['#dfe6ff', '#1a1612', 1.1]} />
      <directionalLight position={[300, 500, 400]} intensity={2.2} color="#fff4e6" />
      <directionalLight position={[-400, 200, -300]} intensity={0.8} color="#9db5ff" />
      <directionalLight position={[0, -200, 300]} intensity={0.25} />
    </>
  );
}

function SimLights() {
  const ambient = useViewStore((s) => s.sim.ambient);
  const exposure = useViewStore((s) => s.sim.exposure);
  const k = Math.min(1.5, (ambient / 60) * exposure * 3 + 0.04);
  return (
    <>
      <hemisphereLight args={['#c9d3ff', '#2a2018', k]} />
    </>
  );
}

const STUDIO_WALL_LIFT = 40;

/** Studio pose: a wall lamp is shown hanging on a backdrop wall, plate on z = 0. */
function useStudioPose() {
  const type = useDesignStore((s) => s.design.mounting.type);
  const depth = useDesignStore((s) => s.design.lamp.depth);
  return useMemo(() => new Matrix4().fromArray(lampWorldMatrix(type, STUDIO_WALL_LIFT + depth / 2)), [type, depth]);
}

function Backdrop() {
  const lamp = useDesignStore((s) => s.design.lamp);
  const w = lamp.width + 320;
  const h = lamp.depth + 320;
  return (
    <mesh position={[0, STUDIO_WALL_LIFT + lamp.depth / 2, -0.4]}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial color="#20252f" roughness={0.95} />
    </mesh>
  );
}

function Scene({ mode }: { mode: ViewMode }) {
  const lampH = useDesignStore((s) => s.design.lamp.height);
  const wall = useDesignStore((s) => s.design.mounting.type === 'wall');
  const pose = useStudioPose();
  if (mode === 'simulation')
    return (
      <>
        <SimLights />
        <ShadowSimulator />
      </>
    );
  return (
    <>
      <StudioLights />
      {mode === 'panels' ? (
        <PanelLayout />
      ) : (
        <>
          <group matrixAutoUpdate={false} matrix={pose}>
            <LampModel mode={mode} />
            <LedMarker glow={mode === 'internal'} />
            {mode === 'internal' && <pointLight position={[0, wall ? lampH * 0.8 : lampH * 0.3, 0]} intensity={2500} decay={2} color="#ffd9a0" />}
          </group>
          {wall && mode !== 'exploded' && <Backdrop />}
        </>
      )}
      <Grid
        args={[2000, 2000]}
        position={[0, -0.2, 0]}
        cellSize={10}
        cellThickness={0.6}
        cellColor="#1d222c"
        sectionSize={50}
        sectionThickness={1}
        sectionColor="#2b3242"
        fadeDistance={1400}
        fadeStrength={1.5}
        infiniteGrid
      />
    </>
  );
}

export function SceneViewer() {
  const mode = useViewStore((s) => s.mode);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  return (
    <div className="relative h-full w-full overflow-hidden bg-[radial-gradient(ellipse_at_50%_35%,#161b25_0%,#0b0d12_70%)]" data-tour="viewer">
      <ErrorBoundary fallback={(error, reset) => <SceneError error={error} reset={reset} />}>
      <Canvas
        dpr={[1, 2]}
        camera={{ fov: 38, near: 1, far: 20000, position: [200, 160, 240] }}
        gl={{ antialias: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.outputColorSpace = SRGBColorSpace;
        }}
        onPointerMissed={() => undefined}
      >
        <Suspense fallback={null}>
          <Scene mode={mode} />
        </Suspense>
        <OrbitControls ref={controlsRef} makeDefault enableDamping dampingFactor={0.12} minDistance={40} maxDistance={6000} />
        <CameraRig />
      </Canvas>
      </ErrorBoundary>
      <ViewModeBar />
      <WorkspaceStatus />
      {mode === 'simulation' && <SimulationControls />}
    </div>
  );
}
