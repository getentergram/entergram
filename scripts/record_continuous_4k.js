import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
// Resolve playwright out of apps/viz, which is where it is installed.
const require = createRequire(resolve(REPO, "apps/viz/package.json"));
const { chromium } = require("playwright");
import { mkdirSync, existsSync, rmSync } from "node:fs";

const RAW_DIR = process.env.ENTERGRAM_RAW_DIR ?? resolve(REPO, "docs/media/raw_flagship_4k");

if (existsSync(RAW_DIR)) rmSync(RAW_DIR, { recursive: true, force: true });
mkdirSync(RAW_DIR, { recursive: true });

async function recordContinuous() {
  console.log("🎬 Launching 4K 60fps Playwright Capture for Continuous Brain OS Presentation...");
  
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--force-device-scale-factor=2",
      "--enable-gpu-rasterization",
      "--enable-zero-copy",
      "--ignore-gpu-blocklist",
      "--use-gl=angle",
      "--hide-scrollbars",
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }, // deviceScaleFactor: 2 creates 3840x2160 raster
    deviceScaleFactor: 2,
    recordVideo: {
      dir: RAW_DIR,
      size: { width: 1920, height: 1080 },
    },
  });

  const page = await context.newPage();

  console.log("Connecting to http://127.0.0.1:4700/?cinematic=1...");
  await page.goto("http://127.0.0.1:4700/?cinematic=1", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  const wait = (ms) => page.waitForTimeout(ms);

  // --------------------------------------------------------------------------
  // SEGMENT 1 (0.0s – 5.2s): "Knowledge isn't static. It's alive."
  // --------------------------------------------------------------------------
  console.log("[00:00 - 00:05] SEGMENT 1: Introduction & Vitality");
  await page.evaluate(() => {
    const d = window.brainDirector;
    if (d) {
      d.setScene(1, {
        showSplash: true,
        sceneTitle: "BRAIN OS",
        sceneSubtitle: "The Enterprise Knowledge Connectome",
        subtitleText: "Knowledge isn't static. It's alive.",
        activeHud: "none",
        activePersona: "architect",
      });
      d.resetCamera(800);
    }
  });
  await wait(3500);

  await page.evaluate(() => {
    const d = window.brainDirector;
    if (d) d.hideTitle();
  });
  await wait(1700);

  // --------------------------------------------------------------------------
  // SEGMENT 2 (5.2s – 14.2s): "Every document. Every conversation. Every decision leaves behind a connection."
  // --------------------------------------------------------------------------
  console.log("[00:05 - 00:14] SEGMENT 2: Enterprise Connections");
  await page.evaluate(() => {
    const d = window.brainDirector;
    if (d) {
      d.setScene(2, {
        categoryChips: true,
        activeHud: "overview",
        subtitleText: "Every document. Every conversation. Every decision leaves behind a connection.",
      });
      d.orbitCamera(0.85, 8000);
    }
  });
  await wait(9000);

  // --------------------------------------------------------------------------
  // SEGMENT 3 (14.2s – 23.2s): "Brain OS transforms those connections into a living knowledge graph."
  // --------------------------------------------------------------------------
  console.log("[00:14 - 00:23] SEGMENT 3: Living Knowledge Graph");
  await page.evaluate(() => {
    const d = window.brainDirector;
    if (d) {
      d.setScene(2, {
        categoryChips: false,
        subtitleText: "Brain OS transforms those connections into a living knowledge graph.",
      });
      d.orbitCamera(1.15, 8000);
    }
  });
  await wait(9000);

  // --------------------------------------------------------------------------
  // SEGMENT 4 (23.2s – 32.5s): "Every file becomes a neuron. Every relationship becomes a synapse."
  // --------------------------------------------------------------------------
  console.log("[00:23 - 00:32] SEGMENT 4: Neurons and Synapses");
  await page.evaluate(() => {
    const d = window.brainDirector;
    if (d) {
      d.setScene(2, {
        subtitleText: "Every file becomes a neuron. Every relationship becomes a synapse.",
      });
      d.orbitCamera(0.95, 8000);
    }
  });
  await wait(9300);

  // --------------------------------------------------------------------------
  // SEGMENT 5 (32.5s – 45.0s): "Hidden patterns become visible. Critical knowledge hubs emerge. Missing links are discovered automatically."
  // --------------------------------------------------------------------------
  console.log("[00:32 - 00:45] SEGMENT 5: Knowledge Hubs & Shortest Path (Cognitive Camera)");
  await page.evaluate(() => {
    const d = window.brainDirector;
    if (d) {
      d.setScene(3, {
        activeHud: "hub",
        subtitleText: "Hidden patterns become visible. Critical knowledge hubs emerge...",
      });
      d.focusNode("B-059");
    }
  });
  await wait(5500);

  await page.evaluate(() => {
    const d = window.brainDirector;
    if (d) {
      d.setScene(3, {
        activeHud: "path",
        subtitleText: "...Missing links are discovered automatically.",
      });
      d.highlightPath(["B-059", "B-203", "B-216"]);
      d.orbitCamera(1.3, 6000);
    }
  });
  await wait(7000);

  // --------------------------------------------------------------------------
  // SEGMENT 6 (45.0s – 51.5s): "Switch perspectives instantly."
  // --------------------------------------------------------------------------
  console.log("[00:45 - 00:51] SEGMENT 6: Perspective Switching");
  await page.evaluate(() => {
    const d = window.brainDirector;
    if (d) {
      d.setScene(4, {
        activeHud: "persona",
        subtitleText: "Switch perspectives instantly.",
      });
      d.resetCamera(1000);
    }
  });
  await wait(6500);

  // --------------------------------------------------------------------------
  // SEGMENT 7 (51.5s – 62.0s): "Executives see strategy. Engineers see architecture. Researchers see evidence."
  // --------------------------------------------------------------------------
  console.log("[00:51 - 00:62] SEGMENT 7: Multi-Persona Morphing");
  // 1. Executive
  await page.evaluate(() => {
    const d = window.brainDirector;
    if (d) {
      d.setSubtitle("Executives see strategy...");
      d.switchPersona("executive");
    }
  });
  await wait(3500);

  // 2. Engineer
  await page.evaluate(() => {
    const d = window.brainDirector;
    if (d) {
      d.setSubtitle("...Engineers see architecture...");
      d.switchPersona("engineer");
      d.orbitCamera(1.05, 3000);
    }
  });
  await wait(3500);

  // 3. Researcher
  await page.evaluate(() => {
    const d = window.brainDirector;
    if (d) {
      d.setSubtitle("...Researchers see evidence.");
      d.switchPersona("researcher");
      d.orbitCamera(0.9, 3000);
    }
  });
  await wait(3500);

  // --------------------------------------------------------------------------
  // SEGMENT 8 (62.0s – 75.5s): "Replay how intelligence evolved. Explore the shortest path between ideas. Watch your enterprise brain grow with every interaction."
  // --------------------------------------------------------------------------
  console.log("[00:62 - 00:75] SEGMENT 8: Timeline Evolution");
  await page.evaluate(() => {
    const d = window.brainDirector;
    if (d) {
      d.setScene(5, {
        activeHud: "timeline",
        subtitleText: "Replay how intelligence evolved. Explore the shortest path between ideas. Watch your enterprise brain grow with every interaction.",
      });
      d.switchPersona("architect");
      d.orbitCamera(0.85, 12000);
    }
  });
  await wait(13500);

  // --------------------------------------------------------------------------
  // SEGMENT 9 (75.5s – 82.5s): "This isn't documentation. This is a digital connectome."
  // --------------------------------------------------------------------------
  console.log("[00:75 - 00:82] SEGMENT 9: Digital Connectome");
  await page.evaluate(() => {
    const d = window.brainDirector;
    if (d) {
      d.setScene(6, {
        activeHud: "none",
        subtitleText: "This isn't documentation. This is a digital connectome.",
      });
      d.resetCamera(1200);
    }
  });
  await wait(7000);

  // --------------------------------------------------------------------------
  // SEGMENT 10 (82.5s – 90.0s): "Brain OS. Think in connections."
  // --------------------------------------------------------------------------
  console.log("[00:82 - 00:90] SEGMENT 10: Hero Finale");
  await page.evaluate(() => {
    const d = window.brainDirector;
    if (d) {
      d.showTitle("Brain OS", "Think in connections.", 7000);
      d.setSubtitle("Brain OS. Think in connections.");
      d.orbitCamera(0.65, 7000);
    }
  });
  await wait(7500);

  console.log("✓ Live capture complete. Closing browser...");
  await page.close();
  await context.close();
  await browser.close();
}

recordContinuous().catch((err) => {
  console.error("Recording error:", err);
  process.exit(1);
});
