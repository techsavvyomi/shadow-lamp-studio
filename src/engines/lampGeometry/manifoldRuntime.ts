import Module from 'manifold-3d';
import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';

export type { CrossSection, Manifold, ManifoldToplevel };

let runtime: Promise<ManifoldToplevel> | null = null;

/**
 * Loads the manifold-3d WASM runtime once. In the browser the bundler supplies the
 * wasm URL via `locateFile`; in Node the module resolves the file itself.
 */
export function loadManifold(locateFile?: () => string): Promise<ManifoldToplevel> {
  if (!runtime) {
    runtime = Module(locateFile ? { locateFile } : undefined).then((wasm) => {
      wasm.setup();
      return wasm;
    });
  }
  return runtime;
}

/**
 * Tracks WASM-backed objects so they can be freed deterministically. Embind objects
 * are not garbage collected; forgetting `.delete()` leaks WASM heap memory.
 */
export class Scope {
  private items: { delete(): void }[] = [];

  keep<T extends { delete(): void }>(obj: T): T {
    this.items.push(obj);
    return obj;
  }

  keepAll<T extends { delete(): void }>(objs: T[]): T[] {
    for (const o of objs) this.items.push(o);
    return objs;
  }

  dispose(): void {
    for (const o of this.items) {
      try {
        o.delete();
      } catch {
        // already deleted
      }
    }
    this.items = [];
  }
}
