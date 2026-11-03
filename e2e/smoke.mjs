/**
 * Browser smoke test: drives the real app (WebGL, workers, WASM) end to end.
 *
 *   1. Start the app:  npm run dev   (or  npm run build && npm run preview)
 *   2. In another terminal:  CHROMIUM_PATH=/path/to/chrome npm run e2e -- http://localhost:5173/
 *
 * Uses playwright-core with any local Chromium/Chrome binary (no download).
 * Exits non-zero if the page logs errors, the shadow sim cannot toggle, the
 * projection fidelity is low, or the export ZIP is missing a required file.
 */
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:5173/';
const executablePath = process.env.CHROMIUM_PATH;
const out = join(tmpdir(), 'giftieverse-e2e');
mkdirSync(out, { recursive: true });

const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failures.push(msg);
};

const browser = await chromium.launch({ executablePath, args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 960 }, acceptDownloads: true });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(url, { waitUntil: 'networkidle' });
// first visit: the walkthrough opens; walk through it once
check(await page.getByText('Welcome to Shadow Lamp Studio').isVisible(), 'first visit shows the walkthrough');
await page.getByRole('button', { name: /Show me around/ }).click();
for (let i = 0; i < 6; i++) await page.getByRole('dialog').getByRole('button', { name: /Next|Let's start/ }).click();
check((await page.getByRole('dialog').count()) === 0, 'walkthrough closes at the end');

// guided steps: lamp type → picture → silhouette → customise
const next = () => page.getByRole('button', { name: /^Next/ }).last().click();
await next();
check(await page.getByRole('button', { name: /^Next/ }).last().isDisabled(), 'Next waits for a picture');
await page.getByTitle('Cat').click();
await page.getByText(/all meshes valid/).waitFor({ timeout: 30_000 });
const status = await page.getByText(/projection panels · fidelity/).innerText();
const fidelity = parseFloat(status.match(/fidelity\s+([\d.]+)%/)?.[1] ?? '0');
check(fidelity > 95, `projection fidelity ${fidelity}% > 95%`);
await next();
await next();
check(await page.getByText('Sides that show the picture').isVisible(), 'customise step shows the essentials');

// every view is available under All settings
await page.getByRole('button', { name: /All settings/ }).click();
for (const mode of ['Exploded', 'Internal', 'Panels', 'Shadow sim']) {
  await page.locator('[role="radio"]', { hasText: mode }).first().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(out, `${mode.replace(/\s/g, '-').toLowerCase()}.png`) });
}
await page.getByRole('button', { name: /LED ON/ }).click();
check(await page.getByRole('button', { name: /LED OFF/ }).isVisible(), 'LED switches off');
check((await page.getByText(/^0 lx$/).count()) > 0, 'wall illuminance drops to 0 lx with the LED off');
await page.getByRole('button', { name: /LED OFF/ }).click();

await page.getByRole('button', { name: /Export STL/ }).click();
check(await page.getByText('All parts are valid, watertight solids').isVisible(), 'validation report shows all parts valid');
const download = page.waitForEvent('download', { timeout: 30_000 });
await page.getByRole('button', { name: /Download everything/ }).click();
const zipPath = join(out, 'export.zip');
await (await download).saveAs(zipPath);
const files = Object.keys(unzipSync(readFileSync(zipPath)));
for (const f of ['Front_Panel.stl', 'Back_Panel.stl', 'Left_Panel.stl', 'Right_Panel.stl', 'Base_Plate.stl', 'LED_Holder.stl', 'Assembled_Model.stl'])
  check(files.includes(f), `ZIP contains ${f}`);

await page.keyboard.press('Escape');
await page.reload({ waitUntil: 'networkidle' });
check((await page.getByText('Welcome to Shadow Lamp Studio').count()) === 0, 'walkthrough does not show again');

check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(`\nScreenshots and ZIP in ${out}`);
process.exit(failures.length ? 1 : 0);
