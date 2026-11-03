# Giftieverse · Shadow Lamp Studio

Upload a silhouette and get a **printable shadow-projection lamp**. The studio inverse-projects your image through each panel to the surrounding walls, cuts ray-aligned openings, previews the real shadow in a simulated room, and exports validated STL files.

Everything runs in the browser: React 18 + TypeScript, Three.js / React Three Fiber, manifold-3d (WASM) for robust solid geometry, Web Workers for heavy work. No paid APIs.

## Quick start

```bash
npm install
npm run dev
```

Then open http://localhost:5173. Other scripts: `npm test` (69 engine tests), `npm run build` (type-check + production bundle), `npm run preview` (serve the build).

> Paste commands without trailing `# …` notes: zsh passes them to the script as arguments, and Vite would treat `#` as the project root and serve an empty 404 page.

Pick a sample (Cat, Moon & stars, Tree, Figure) or drop a PNG/JPG/SVG. Geometry regenerates automatically as you edit.

## Two lamp types

Pick one in step 1 (**Lamp type**):

* **Table / shelf**: a closed box. Each panel's cut-outs project a silhouette onto the wall that panel faces.
* **Wall-mounted**: an open-front box hung on the wall, with the LED on a post. The four side walls have **shaped edges**, and together they cast **one large silhouette onto the same wall**, around the lamp, inside a bright halo. You set the mounting height and ceiling height. The wall plate gets keyhole screw slots, and the cable groove runs downward. Use an omnidirectional emitter (filament or tube LED): the light has to travel back towards the wall.

### Finger joints

Every panel or side wall has tabs along its foot that drop into notches cut into the edge of the base or wall plate (box-joint style). The parts locate themselves, and a drop of glue makes the joint permanent. Tabs stop 0.3 mm short of the plate's back, so a wall plate always sits flat. They also stay clear of the cable groove. Switch them off under *All settings → Lamp dimensions* (expert options) to get plain butt joints.

### Wall plate decoration

On a wall lamp the LED lights up the plate behind it, and that is the surface you look at inside the lamp. In *Customise* you can leave it **plain** or add a **raised relief**:

* **Silhouette**: your own figure, or a built-in moon, star, heart, bat, pumpkin or ghost;
* **Text**: up to three lines in a bold, spooky or script font.

Place it above, below or behind the LED post, and set its size. The relief keeps clear of the post socket, the side walls' lip and the screw heads. It sits inside the plate's own shadow, so the figure on the wall does not change. For a two-colour plate, print it design-side up and add a filament change at the plate's top layer; the build report gives the layer.

Fonts: [Lilita One](https://fonts.google.com/specimen/Lilita+One), [Creepster](https://fonts.google.com/specimen/Creepster) and [Pacifico](https://fonts.google.com/specimen/Pacifico), bundled from Fontsource under the SIL Open Font License 1.1.

## Workflow

The studio opens in **guided mode**: six steps, each showing only the controls it needs, with *Back* / *Next* at the bottom of the left panel. First-time visitors get a one-minute walkthrough; the **?** button in the top bar replays it. **All settings** (top of the guide panel) shows every section. Its **Expert options** switch reveals the fine-tuning controls (tolerances, lip and holder sizes, wall angles, clean-up filters, simulation exposure), which stay hidden by default.

1. **Lamp type**: table / shelf, or wall-mounted.
2. **Picture**: PNG, JPG or SVG (drag-and-drop; large images are downscaled on decode).
3. **Silhouette**:
   * **Automatic** mode picks alpha, background-colour distance or luminance segmentation.
   * **Manual** mode exposes threshold, contrast, background removal, noise/hole filtering, smoothing and crop.
   * SVGs can use their **exact vector paths**: transforms, `<use>`, CSS classes and fill rules are honoured, and light fills painted over dark ones cut holes.
4. **Customise**: shadow size; which sides project (table) or the wall plate decoration (wall). Under *All settings*: lamp dimensions, projection style, target wall, offset, rotation and mirror, LED position, emitter, flux and holder. The geometry rebuilds automatically in a worker after every change.
5. **Preview**: assembled, exploded, internal and panel-by-panel views, plus the **shadow simulation**. The simulation is a room lit through the actual mesh. You can toggle the LED, change intensity, emitter size, wall distance and orientation, move the light, rotate the lamp, and show light rays.
6. **Export**: print tips and a one-click ZIP. *Review parts & checks* shows the validation report is shown first. Then download individual STLs (`Front_Panel`, `Back_Panel`, `Left_Panel`, `Right_Panel`, `Base_Plate`, `LED_Holder`, `Top_Cover`) in print-ready orientation, `Assembled_Model.stl`, an assembly reference PNG, or a ZIP of everything with a build report and `design.json`.

Shortcuts: `⌘/Ctrl+Z` undo, `⇧⌘Z` / `Ctrl+Y` redo, `F` reset camera.

## How it works

The geometry is inverse light projection, not image extrusion. Each wall point is traced back along its ray to the emitter. Where that ray crosses a panel decides whether the panel is open or solid there. The openings are extruded along the rays through the panel thickness, which a naive straight extrusion gets 31% wrong on a 1.5 mm panel. When something is physically impossible (rays that miss the wall, hit the table or are blocked by the holder; features too thin to print; floating islands), the generator produces the closest feasible geometry and says what it changed.

The simulator renders every triangle of the generated lamp through a planar shadow matrix, averages emitter samples for soft penumbrae, and shades walls with photometric illuminance in lux.

Details, derivations and the physical assumptions are in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## Deploying to GitHub Pages

The app is fully static (no server; workers, WASM and samples load by relative URL). `.github/workflows/deploy-pages.yml` tests, builds and publishes it:

1. Push this project to a GitHub repository (branch `main`).
2. In the repository open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Every push to `main` deploys to `https://<user>.github.io/<repo>/`.

The workflow builds with `VITE_BASE=/<repo>/`. To check a subpath build locally:

```bash
VITE_BASE=/lamp-gen/ npm run build
VITE_BASE=/lamp-gen/ npm run preview
```

Then open http://localhost:4173/lamp-gen/.

## Verification

* `npm test` runs 69 tests:
  * silhouette extraction on synthetic basic, human, animal, complex, transparent-PNG and multi-path SVG inputs with known ground truth;
  * projection maths round trips and feasibility;
  * lamp generation across dimensions, light positions, oblique walls and islands;
  * shadow raster vs. exact ray casting through the mesh (≥ 99% agreement);
  * mesh-validator negative cases;
  * STL export round trip, print transforms and ZIP;
  * a **reference test**: exported STL bytes → shadow engine → same fidelity as the preview.
* `npm run e2e -- <url>` drives the running app in Chromium (`CHROMIUM_PATH=/path/to/chrome`). It checks fidelity, the LED on/off behaviour, the validation report, the ZIP contents and that there are no console errors.

Every generated part is checked for watertightness, consistent outward winding, a single shell, no self-intersections and positive volume. Each panel reports a projection-fidelity IoU from a ray-traced shadow of the exported mesh (≈ 97–99.6% on the samples; bridges account for most of the remainder).

## Project layout

```
src/
  components/   ImageUploader, SilhouetteEditor, LampConfigurator, SceneViewer,
                ShadowSimulator, GeometryInspector, ExportPanel, layout, ui (shadcn-style)
  engines/      imageProcessing, silhouetteExtraction, projectionGeometry, lampGeometry,
                shadowProjection, meshValidation, stlExporter, printing   ← pure, tested
  workers/      image + geometry workers, latest-wins RPC client
  stores/       design (undo/redo), image, geometry, view
  hooks/ pages/ types/ utils/
e2e/smoke.mjs   browser smoke test
docs/           architecture and mathematics
```

## Printing notes

Defaults target FDM PLA with a 0.4 mm nozzle: walls 1.5–1.6 mm (the advice flags anything under 1 mm), and no feature, gap or bridge under 1.2 mm (three extrusion lines). The *Print* tab adapts minimum feature size, clearance and orientation to your printer, and explains light-leak, ventilation and overhang trade-offs. Treat its guidance as a starting point, not a guarantee for any particular machine. For crisp shadows, print panels in **dark filament** and use a **small, wide-angle LED**.
