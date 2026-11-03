# Architecture & mathematics

Giftieverse Shadow Lamp Studio turns a silhouette into a lamp whose panels cast that silhouette onto the surrounding walls. This document explains how the system is organised, the optics behind it, and the assumptions it makes.

## 1. System overview

```
 ┌─────────────── main thread (React 18) ────────────────┐      ┌──────── Web Workers ────────┐
 │                                                        │      │                             │
 │  ImageUploader ──► imageStore ──► useImageProcessing ──┼─────►│ image.worker                │
 │  (decode, SVG vector extraction)                       │◄─────┤  imageProcessing pipeline   │
 │                                                        │      │  + marching-squares tracing │
 │  designStore (undo/redo) ──► useGeometryGeneration ────┼─────►│ geometry.worker             │
 │                                                        │◄─────┤  manifold-3d (WASM)         │
 │  geometryStore: result + BufferGeometries (owned)      │      │  projection → panels → base │
 │        │                                               │      │  → validation → fidelity    │
 │        ├──► SceneViewer (assembled/exploded/internal/  │      └─────────────────────────────┘
 │        │     panels)                                   │
 │        ├──► ShadowSimulator (GPU projected shadows)    │
 │        └──► STL exporter / ZIP / assembly image        │
 └────────────────────────────────────────────────────────┘
```

* **Engines** (`src/engines/**`) are pure TypeScript with no React dependency. They run in workers and in Node tests unchanged.
* **Workers** use a *latest-wins* client (`src/workers/client.ts`): while a job runs only the newest queued job is kept, so dragging a slider never builds a backlog.
* **One geometry, three consumers.** `geometryStore` converts each generated mesh into a `BufferGeometry` once. The 3D preview, the shadow simulator and the STL exporter all use those exact instances; a test round-trips the exported STL bytes through the shadow engine to prove it.
* **State** lives in Zustand stores: `designStore` (all parameters, with coalesced undo/redo), `imageStore`, `geometryStore` (disposes old GPU buffers when replaced) and `viewStore` (view mode, simulation settings).

| Folder | Responsibility |
|---|---|
| `engines/imageProcessing` | Decode-agnostic raster ops: luminance/alpha, Otsu, blur, components, background estimate, crop/resample, pipeline |
| `engines/silhouetteExtraction` | Marching squares (sub-pixel), Douglas–Peucker, SVG path parser, SVG document walker |
| `engines/projectionGeometry` | Panel/wall frames, central projection, feasible region, convex fitting |
| `engines/lampGeometry` | manifold-3d runtime, silhouette region, panel builder, base/top/holder, orchestrator |
| `engines/shadowProjection` | Shadow matrix, emitter sampling, CPU reference shadow raster, IoU |
| `engines/meshValidation` | Welding, manifold/winding/volume/shell checks, triangle–triangle intersection |
| `engines/stlExporter` | STLExporter wrapper, ZIP, build report, assembly image |
| `engines/printing` | Configurable print recommendations |

## 2. Coordinate conventions

Millimetres everywhere. World origin at the centre of the lamp footprint on the table, **+Y up**, **+X** right when facing the front panel, **+Z** out of the front panel.

Each panel has a local frame `(u, v, n)`: `x ∈ [0, w]` left→right *as seen from outside*, `y ∈ [0, h]` up, `z ∈ [0, t]` from the inner (light-facing) face to the outer face. `u × v = n`, so local→world is a proper rotation and never flips triangle winding. Front and back panels span the full width; left and right fit between them (butt joints).

Each target wall has a frame `(origin, u, v, normal)` with `a` to the right and `b` up as seen by someone standing at the lamp facing the wall, and the normal pointing at the lamp. The origin is on the table line directly in front of the panel centre; yaw rotates about vertical and pitch hinges on the table line.

## 3. Inverse light projection

A point emitter at **L** lights wall point **P** iff the segment L→P passes through an opening. For a planar panel, the map *wall → panel plane along rays through L* is a **central projection**, a planar homography. Homographies map straight lines to straight lines, so a polygon on the wall maps **exactly** to the polygon of its projected vertices, provided all vertices lie in front of the emitter. This holds for any wall orientation (yaw/pitch), not just parallel walls.

```
wall point P ──ray to L──► crosses inner plane z=0 at  q = l + s(p − l),  s = −l_z / (p_z − l_z)
```

### Ray-aligned cut-outs (why thickness matters)

A real panel has thickness *t*. Between its inner face (distance *a* from the emitter) and its outer face (*a + t*), the same central projection is a **homothety** about the foot of the perpendicular from L, with ratio *(a + t)/a*. The generator therefore extrudes every opening *along the light rays*:

```
manifold: holes.translate(−foot).scale(k0).extrude(t + 2ε, …, scaleTop = [s1/s0, s1/s0]).translate(foot)
```

`extrude`'s linear top scaling about the origin is exactly that homothety. **Prototype result** (ray-cast ground truth through the real mesh):

| Case | IoU vs target |
|---|---|
| Ray-aligned openings, centred light | 1.0000 |
| Straight (naive) extrusion, 1.5 mm panel | **0.688** |
| Off-centre light / 25° yawed wall / 1 m wall | 1.0000 |

> Note: manifold-3d's JS binding interprets a *scalar* `scaleTop` as `[s, 0]`. Always pass a `Vec2`.

### Feasibility: what the lamp can and cannot do

The generator never pretends. For each panel it computes the **feasible wall region**:

1. **Window**: panel minus the frame margin, further limited by
   * the LED holder's shadow cone: rays steeper than `atan(emitterAboveRim / rimRadius)` below horizontal hit the holder; and
   * the homothety: an opening on the inner face grows by *(a+t)/a* on the outer face, so the window is intersected with its own scaled copy so cut-outs never break through the frame.
2. **Rays must reach the wall**: rays nearly parallel to an oblique wall are clipped with a linear half-plane in panel coordinates, which bounds the hit distance.
3. **The table**: a ray aimed below the table line hits the table first. The feasible region is clipped to `world y ≥ 0` (optional).

The silhouette's convex hull is then fitted into this convex region. For a fixed centre, every (hull vertex, region edge) pair bounds the scale linearly, so `s_max(c)` is a minimum of linear functions, which is **concave**. A refining grid search finds the global optimum. The user's *size %*, offset, rotation and mirror are applied on top. Anything that falls outside the reachable region is **clipped and reported** (`clipped`), not silently distorted.

### Openings by style

* **Shadow figure:** openings = window − silhouette. A dark figure appears in a lit field; the figure is a floating island.
* **Light figure:** openings = silhouette ∩ window. A lit figure appears on a dark wall; enclosed details such as eyes are islands.

### Manufacturability (closest feasible geometry)

With *m* = minimum printable feature:

* **Thin material** (narrower than *m*) is found by morphological opening (`offset(−m/2).offset(+m/2)`) and either **thickened** (default) or removed.
* **Gaps** narrower than *m* are closed by opening the openings.
* **Floating islands** are detected by decomposing the material region. Each island gets one bridge (width ≥ *m*) from an extreme vertex to the panel edge, choosing the direction (up/down/left/right) that covers the least open area. The loop repeats until the material is a single piece. Unprintably small specks are dropped.

Every adjustment is quantified in the panel's findings (area changed %, bridge count, the bridge's width on the wall).

### Wall lamp (open front, profiled side walls)

The emitter L sits on a post at distance y_L from the wall, in front of an open box whose side walls stand h off the wall. Seen from L, each side wall's inner plane maps onto the wall (lamp plane y = 0) by a central projection:
* a horizontal line at height y lands at distance R = r · y_L / (y_L − y) from the lamp axis, where r is the wall's distance from the axis;
* a vertical line lands on a ray from the axis.

So each side wall reaches a trapezoidal sector of the wall, and the four sectors tile the **reachable region**: the box outline scaled by y_L / (y_L − h).

The silhouette is placed with the lamp at its **deepest point** (bisected erosion) and scaled to fit the reachable region (clipped at the floor and ceiling). It is split into the four sectors, and each sector is back-projected onto its side wall. A wall's material is that back-projection plus a solid base strip that seats it on the plate. Detached pieces get struts down to the strip. The edges are cut along the light rays as before.

The material is built a few millimetres past the slab's edges, so the ray-aligned cutter crosses the end faces transversally instead of grazing them, which would leave zero-area slivers.

Sensitivities (cat sample, measured by re-projecting the real mesh with a displaced emitter):

| Emitter error | Table lamp IoU | Wall lamp, reach ×6.8 | Wall lamp, reach ×3.7 |
|---|---|---|---|
| none | 99.7% | 99.8% | 98.5% |
| 1 mm along the post / up | 93% | 91% | 95% |
| 2 mm along the post / up | 86% | 84% | 92% |
| 2 mm sideways | 84% | 94% | 95% |

Along the post, an error mostly **scales** the figure (about 7% per mm for the large-reach design) rather than distorting it. The more the side walls approach the emitter's height, the bigger, softer and more placement-sensitive the figure becomes.

## 4. Shadow simulation

The simulator computes shadows **from the generated mesh**. No image is baked or overlaid.

For each receiver plane (room walls, floor) with plane π and a point light L, the **planar shadow matrix** `S = (π·L)·I − L·πᵀ` (Blinn 1988) maps every vertex to where its shadow lands. Its homogeneous *w* is `n·(L − X)`, which is positive exactly for geometry between the light's parallel plane and the receiver. Geometry behind the light gets *w ≤ 0* and is clipped by the GPU. Rendering all lamp triangles through *S* into a mask gives the **exact hard shadow**, with no shadow-map resolution, acne or bias problems.

Finite emitters: the emitter disc is sampled with a Vogel spiral (8/24/64 samples). Each sample's mask is accumulated into a half-float occlusion texture, giving a Monte-Carlo soft shadow whose penumbra scales correctly with emitter size and distances.

Receivers are shaded with photometric illuminance:

```
E = I(ω) · cos θ / r² · V        I = Φ / 4π (isotropic) or 4·I_iso·cos(angle from up) (Lambertian SMD)
```

E is in lux (the UI reports wall-centre illuminance) and V is the visible fraction of the emitter. The **CPU reference** (`cpuShadow.ts`) uses the same matrix with explicit clipping and scan conversion. It powers the *fidelity* metric (IoU of simulated figure vs. target over the reachable area). A test checks it against manifold's exact ray caster through the mesh: ≥ 99% agreement.

## 5. Validation

`validateMesh` re-welds vertices and checks, independently of the generator:

* closed, 2-manifold edges (every edge used exactly twice);
* consistent winding (each directed edge used once);
* positive signed volume (outward normals);
* degenerate triangles and non-finite vertices;
* connected shells (floating geometry);
* triangle–triangle self-intersections (uniform-grid broad phase, exact segment/triangle narrow phase).

Panels, base, top and holder each export as a single watertight shell. `Assembled_Model.stl` is a multi-body *reference* model.

## 6. Physical assumptions and limits

| Assumption | Consequence / mitigation |
|---|---|
| Geometry uses rays from the emitter **centre** | Finite emitters blur edges. The penumbra (`e·(d_wall − d_panel)/d_panel`) is reported and simulated, not compensated. Use a small bare emitter for crisp shadows. |
| Panels are **opaque** | Light PLA at 1.5 mm glows. The print recommendations suggest dark filament or painting the inner faces. |
| **Direct light only** | Inter-reflections inside the lamp and from walls are ignored. A dark/matte interior matches this best. |
| LED emits from a point at the configured position | 5 mm epoxy-dome LEDs refract (the effective source moves and grows) and have narrow beams (15–30°), which starve the side panels. Prefer wide-angle, COB or filament LEDs. The *Lambertian (up)* pattern shows SMD fall-off in the simulator. |
| Walls and table are ideal planes; the table is at the lamp's base | The projection is kept above the table line by default. |
| Geometric optics | Features are ≫ wavelength, so diffraction is negligible. |
| Lamp body glow in the simulator uses an unshadowed point light | Visual only. Wall and floor lighting is the computed part. |

## 7. Known gaps (next phases)

* Background removal is classical segmentation (alpha / border-colour distance / luminance Otsu). Photos with busy backgrounds need manual tuning; ML segmentation could slot into `imageProcessing`.
* One silhouette is shared by all panels (each still computed for its own wall). Per-panel images and panoramic scenes spanning walls are natural extensions of `PanelBuildInput`.
* Panels use butt joints with locating lips and glue; finger joints or snap-fits would remove the glue step.
* The assembled STL is multi-body (reference only); a boolean union would be needed for a single printable assembly.
