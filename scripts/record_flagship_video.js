import { createRequire } from "node:module";
const require = createRequire("/home/getentergram/Documents/GitHub/entergram/apps/viz/package.json");
const { chromium } = require("playwright");
import { mkdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const OUTPUT_DIR = "/home/getentergram/Documents/GitHub/entergram/docs/media";
const RAW_DIR = "/home/getentergram/.gemini/antigravity/brain/0916c832-5f9b-4b3a-981e-98fd8f702792/scratch/raw_flagship_4k";

mkdirSync(OUTPUT_DIR, { recursive: true });
if (existsSync(RAW_DIR)) rmSync(RAW_DIR, { recursive: true, force: true });
mkdirSync(RAW_DIR, { recursive: true });

async function recordFlagship() {
  console.log("🎬 Launching 4K 60fps Playwright Capture for Brain OS Flagship Video...");
  
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
    viewport: { width: 1920, height: 1080 }, // deviceScaleFactor: 2 renders full 3840x2160 raster!
    deviceScaleFactor: 2,
    recordVideo: {
      dir: RAW_DIR,
      size: { width: 1920, height: 1080 },
    },
  });

  const page = await context.newPage();

  console.log("Navigating to http://127.0.0.1:4700/?cinematic=1...");
  await page.goto("http://127.0.0.1:4700/?cinematic=1", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  console.log("════════════════════════════════════════════════════════════════");
  console.log("▶ STARTING 90-SECOND CHOREOGRAPHED MULTIMODAL TIMELINE");
  console.log("════════════════════════════════════════════════════════════════");

  // Helper to sleep precisely
  const wait = (ms) => page.waitForTimeout(ms);

  // --------------------------------------------------------------------------
  // SCENE 1: THE PROBLEM (0.0s – 10.0s)
  // "Every organization stores knowledge. Very few understand how that knowledge is actually connected."
  // --------------------------------------------------------------------------
  console.log("\n[00:00 - 00:10] SCENE 1 — THE PROBLEM");
  await page.evaluate(() => {
    const d = window.brainDirector;
    if (d) {
      d.setScene(1, {
        showSplash: true,
        sceneTitle: "BRAIN OS",
        sceneSubtitle: "The Enterprise Knowledge Connectome",
        subtitleText: "Every organization stores knowledge. Very few understand how that knowledge is actually connected.",
        activeHud: "none",
        activePersona: "architect",
      });
      d.resetCamera(800);
    }
  });
  await wait(3500);

  await page.evaluate(() => {
    const d = window.brainDirector;
    if (d) {
      d.hideTitle();
      d.orbitCamera(0.65, 6000);
    }
  });
  await wait(6500);

  // --------------------------------------------------------------------------
  // SCENE 2: THE BRAIN AWAKENS (10.0s – 25.0s)
  // "Every document becomes a neuron. Every relationship becomes a synapse. Together, they form a living enterprise brain."
  // --------------------------------------------------------------------------
  console.log("\n[00:10 - 00:25] SCENE 2 — THE BRAIN AWAKENS");
  await page.evaluate(() => {
    const d = window.brainDirector;
    if (d) {
      d.setScene(2, {
        showSplash: false,
        categoryChips: true,
        activeHud: "overview",
        subtitleText: "Every document becomes a neuron. Every relationship becomes a synapse. Together, they form a living enterprise brain.",
      });
      d.orbitCamera(1.15, 8000);
    }
  });
  await wait(7500);

  await page.evaluate(() => {
    const d = window.brainDirector;
    if (d) {
      d.orbitCamera(0.85, 6500);
    }
  });
  await wait(7500);

  // --------------------------------------------------------------------------
  // SCENE 3: INTELLIGENCE IN MOTION (25.0s – 45.0s)
  // "Brain OS doesn't just visualize information. It reveals hidden patterns, identifies critical knowledge hubs, and surfaces the shortest path between ideas."
  // --------------------------------------------------------------------------
  console.log("\n[00:25 - 00:45] SCENE 3 — INTELLIGENCE IN MOTION (COGNITIVE CAMERA)");
  await page.evaluate(() => {
    const d = window.brainDirector;
    if (d) {
      d.setScene(3, {
        categoryChips: false,
        activeHud: "hub",
        subtitleText: "Brain OS doesn't just visualize information. It reveals hidden patterns...",
      });
      d.focusNode("B-059");
    }
  });
  await wait(5500);

  console.log("  ↳ Cognitive Camera ignites shortest reasoning path (B-059 -> B-203 -> B-216)...");
  await page.evaluate(() => {
    const d = window.brainDirector;
    if (d) {
      d.setScene(3, {
        activeHud: "path",
        subtitleText: "...identifies critical knowledge hubs, and surfaces the shortest path between ideas.",
      });
      d.highlightPath(["B-059", "B-203", "B-216"]);
      d.orbitCamera(1.35, 6000);
    }
  });
  await wait(7500);

  await page.evaluate(() => {
    const d = window.brainDirector;
    if (d) {
      d.focusNode("B-216");
    }
  });
  await wait(7000);

  // --------------------------------------------------------------------------
  // SCENE 4: MULTI-PERSONA SWITCHING (45.0s – 60.0s)
  // "The same brain. Different perspectives. Executives see strategy. Engineers see architecture. Researchers see evidence."
  // --------------------------------------------------------------------------
  console.log("\n[00:45 - 00:60] SCENE 4 — MULTI-PERSONA SWITCHING");
  
  // Executive Persona
  console.log("  ↳ 1. Executive Persona (Strategy, ROI, Milestones)");
  await page.evaluate(() => {
    const d = window.brainDirector;
    if (d) {
      d.setScene(4, {
        activeHud: "persona",
        subtitleText: "The same brain. Different perspectives. Executives see strategy...",
      });
      d.switchPersona("executive");
      d.resetCamera(1200);
    }
  });
  await wait(5000);

  // Engineer Persona
  console.log("  ↳ 2. Engineer Persona (Architecture, APIs, Gotchas)");
  await page.evaluate(() => {
    const d = window.brainDirector;
    if (d) {
      d.setSubtitle("...Engineers see architecture...");
      d.switchPersona("engineer");
      d.orbitCamera(1.05, 4000);
    }
  });
  await wait(5000);

  // Researcher Persona
  console.log("  ↳ 3. Researcher Persona (Hypotheses, Confidence, Evidence)");
  await page.evaluate(() => {
    const d = window.brainDirector;
    if (d) {
      d.setSubtitle("...Researchers see evidence.");
      d.switchPersona("researcher");
      d.orbitCamera(0.9, 4000);
    }
  });
  await wait(5000);

  // --------------------------------------------------------------------------
  // SCENE 5: TIME TRAVEL (60.0s – 75.0s)
  // "Watch your organization's intelligence evolve over time. Every conversation strengthens the network."
  // --------------------------------------------------------------------------
  console.log("\n[00:60 - 00:75] SCENE 5 — TIME TRAVEL & EVOLUTION");
  await page.evaluate(() => {
    const d = window.brainDirector;
    if (d) {
      d.setScene(5, {
        activeHud: "none",
        subtitleText: "Watch your organization's intelligence evolve over time. Every conversation strengthens the network.",
      });
      d.switchPersona("architect");
      d.switchView("timeline");
    }
  });
  await wait(5000);

  // Scrub timeline in view
  await page.evaluate(() => {
    window.scrollBy({ top: 300, behavior: "smooth" });
  });
  await wait(5000);

  await page.evaluate(() => {
    const d = window.brainDirector;
    if (d) {
      d.switchView("journey");
    }
  });
  await wait(5000);

  // --------------------------------------------------------------------------
  // SCENE 6: CLOSING HERO (75.0s – 90.0s)
  // "This isn't documentation. This is a digital connectome. Brain OS. Think in connections."
  // --------------------------------------------------------------------------
  console.log("\n[00:75 - 00:90] SCENE 6 — CLOSING HERO & GALAXY SILHOUETTE");
  await page.evaluate(() => {
    const d = window.brainDirector;
    if (d) {
      d.setScene(6, {
        activeHud: "none",
        subtitleText: "This isn't documentation. This is a digital connectome. Brain OS. Think in connections.",
      });
      d.switchView("map");
    }
  });
  await wait(2000);

  await page.evaluate(() => {
    const d = window.brainDirector;
    if (d) {
      d.resetCamera(1500);
      d.showTitle("Brain OS", "Think in connections.", 7000);
      d.orbitCamera(0.6, 6000);
    }
  });
  await wait(9500);

  console.log("\n✓ 90-Second Choreographed Sequence Complete. Closing browser to finalize video...");
  await page.close();
  await context.close();
  await browser.close();
}

recordFlagship().catch((err) => {
  console.error("Recording error:", err);
  process.exit(1);
});
