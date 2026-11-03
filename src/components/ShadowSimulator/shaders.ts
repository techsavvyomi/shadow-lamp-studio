import { Color, CustomBlending, DoubleSide, Matrix4, OneFactor, AddEquation, ShaderMaterial, Texture, Vector3 } from 'three';

/**
 * Projects every occluder triangle onto the receiver plane with the planar shadow
 * matrix (see engines/shadowProjection/shadowMatrix.ts) and writes coverage = 1.
 * Geometry behind the light gets w ≤ 0 and is clipped by the GPU.
 */
export function createProjectionMaterial() {
  return new ShaderMaterial({
    uniforms: { uShadow: { value: new Matrix4() } },
    vertexShader: /* glsl */ `
      uniform mat4 uShadow;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewMatrix * (uShadow * world);
      }`,
    fragmentShader: /* glsl */ `
      void main() { gl_FragColor = vec4(1.0); }`,
    side: DoubleSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}

/** Adds a weighted copy of the per-sample coverage mask into the accumulator. */
export function createAccumulateMaterial() {
  return new ShaderMaterial({
    uniforms: { uMap: { value: null as Texture | null }, uWeight: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform float uWeight; varying vec2 vUv;
      void main() { gl_FragColor = vec4(texture2D(uMap, vUv).r * uWeight); }`,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneFactor,
    blendEquation: AddEquation,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneFactor,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}

/**
 * Receiver shading from first principles: illuminance E = I(ω)·cosθ / r² · V (lux),
 * where I is the emitter's luminous intensity (cd) in direction ω, r the distance in
 * metres and V ∈ [0, 1] the fraction of the emitter visible from the point (from the
 * accumulated occlusion map). Diffuse reflected radiance ∝ albedo · (E + ambient).
 */
export function createReceiverMaterial(occlusion: Texture) {
  return new ShaderMaterial({
    uniforms: {
      uOcclusion: { value: occlusion },
      uLight: { value: new Vector3() },
      uIntensity: { value: 10 },
      uOn: { value: 1 },
      uPattern: { value: 0 },
      uLampUp: { value: new Vector3(0, 1, 0) },
      uAmbient: { value: 2 },
      uExposure: { value: 1 },
      uColor: { value: new Color('#e9e4da') },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vWorld; varying vec3 vNormal;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uOcclusion; uniform vec3 uLight; uniform float uIntensity; uniform float uOn;
      uniform int uPattern; uniform vec3 uLampUp; uniform float uAmbient; uniform float uExposure; uniform vec3 uColor;
      varying vec2 vUv; varying vec3 vWorld; varying vec3 vNormal;
      void main() {
        vec3 L = uLight - vWorld;
        float r2 = max(dot(L, L), 1.0) * 1e-6;           // mm² → m²
        vec3 l = normalize(L);
        float cosT = max(dot(normalize(vNormal), l), 0.0);
        float pattern = uPattern == 1 ? 4.0 * max(dot(-l, uLampUp), 0.0) : 1.0; // Lambertian I(θ)=4·I_iso·cosθ
        float vis = clamp(1.0 - texture2D(uOcclusion, vUv).r, 0.0, 1.0);
        float E = uOn * uIntensity * pattern * cosT / r2 * vis; // lux
        // exposure maps ~60 lux to mid-grey; reflected radiance ∝ albedo × illuminance
        vec3 col = uColor * (E + uAmbient) * (uExposure / 60.0);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
