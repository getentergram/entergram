---
id: B-0035
type: decision
tags: [npm, publish, naming, cli]
scope: packaging
confidence: 1
created: 2026-08-12
hook: npm package renamed entergram → get-entergram; CLI still installs both `get-entergram` and `entergram` commands (dual bin, entergram.js is now a thin shim under get-entergram)
---

# npm package renamed entergram → get-entergram; CLI still installs both `get-entergram` and `entergram` commands (dual bin, entergram.js is now a thin shim under get-entergram)

## What
npm package renamed entergram → get-entergram; CLI still installs both `get-entergram` and `entergram` commands (dual bin, entergram.js is now a thin shim under get-entergram)

## Why
the npm registry name "entergram" was already taken by an unrelated abandoned package (merrihew/entergram, 0.0.1). get-entergram was chosen as available and close to the product name. Kept the `entergram` binary alias so existing muscle-memory/docs referencing `entergram <cmd>` still work.


