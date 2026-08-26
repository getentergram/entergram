// Plugin loader for the viz server.
//
// A plugin is a plain ES module in `.entergram/plugins/*.js`. It can decorate the graph
// before it reaches the UI, serve its own API routes, and declare panels the UI renders
// in the inspector. Plugins are local files the store owner wrote, loaded from their own
// repo — the same trust level as the cells themselves.
//
// Shape:
//   export const manifest = { name, title, description?, panels?: [{id,title,slot}] };
//   export function decorateGraph(graph) { return graph; }          // optional
//   export async function handle({ path, method, url, body, root }) // optional
//
// A plugin that throws on load is skipped with a warning rather than taking the server
// down; a broken extension should not cost you the whole visualizer.

import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { paths } from "../lib.js";

export function pluginDir(root) {
  return join(paths(root).base, "plugins");
}

export async function loadPlugins(root) {
  const dir = pluginDir(root);
  if (!existsSync(dir)) return [];

  let files;
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".js") || f.endsWith(".mjs"));
  } catch {
    return [];
  }

  const loaded = [];
  for (const file of files.sort()) {
    try {
      // Cache-bust so `entergram viz` restarts pick up edits without a stale module.
      const url = `${pathToFileURL(join(dir, file)).href}?t=${Date.now()}`;
      const mod = await import(url);
      const manifest = mod.manifest || {};
      const name = manifest.name || file.replace(/\.m?js$/, "");
      loaded.push({
        name,
        manifest: {
          name,
          title: manifest.title || name,
          description: manifest.description || "",
          panels: manifest.panels || [],
        },
        decorateGraph: typeof mod.decorateGraph === "function" ? mod.decorateGraph : null,
        handle: typeof mod.handle === "function" ? mod.handle : null,
      });
    } catch (err) {
      console.warn(`  ! plugin ${file} failed to load: ${err.message}`);
    }
  }
  return loaded;
}
