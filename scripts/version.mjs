#!/usr/bin/env node
// Keeps the three manifests that carry a version in lockstep:
//
//   cli/package.json                  what npm publishes
//   .claude-plugin/plugin.json        what the plugin reports
//   .claude-plugin/marketplace.json   what the marketplace lists
//
// They have to agree: a plugin pinned to a version the CLI no longer ships
// installs an MCP server that does not match the skills beside it, and
// validate-plugin fails the PR. Bumping them by hand is how they drift, so
// this is the single place that writes a version.
//
//   node scripts/version.mjs current          -> print the current version
//   node scripts/version.mjs next patch|minor|major
//   node scripts/version.mjs set <version>    -> write it to all three
//
// Exits non-zero if the three disagree, rather than silently picking one.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const TARGETS = [
  { file: "cli/package.json", read: (d) => d.version, write: (d, v) => (d.version = v) },
  { file: ".claude-plugin/plugin.json", read: (d) => d.version, write: (d, v) => (d.version = v) },
  {
    file: ".claude-plugin/marketplace.json",
    read: (d) => d.plugins?.[0]?.version,
    write: (d, v) => d.plugins.forEach((p) => (p.version = v)),
  },
];

const load = (f) => JSON.parse(readFileSync(join(REPO, f), "utf8"));

function current() {
  const seen = TARGETS.map((t) => ({ file: t.file, version: t.read(load(t.file)) }));
  const distinct = [...new Set(seen.map((s) => s.version))];
  if (distinct.length !== 1) {
    console.error("manifests disagree on version:");
    for (const s of seen) console.error(`  ${s.file}: ${s.version}`);
    process.exit(1);
  }
  return distinct[0];
}

function next(kind) {
  const [maj, min, pat] = current().split(".").map(Number);
  if (kind === "major") return `${maj + 1}.0.0`;
  if (kind === "minor") return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

function set(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`not a semver version: ${version}`);
    process.exit(1);
  }
  for (const t of TARGETS) {
    const path = join(REPO, t.file);
    const raw = readFileSync(path, "utf8");
    // Rewrite the version string in place rather than re-serialising the JSON.
    // A round-trip reformats untouched fields -- it expanded an inline keywords
    // array and mangled an em-dash in this repo before -- turning a one-line
    // change into reviewer noise.
    const next = raw.replace(/("version"\s*:\s*")\d+\.\d+\.\d+(")/g, `$1${version}$2`);
    if (next === raw) {
      console.error(`no version field rewritten in ${t.file}`);
      process.exit(1);
    }
    writeFileSync(path, next);
    // Re-read through the parser so a malformed write fails here, not in CI.
    if (t.read(JSON.parse(readFileSync(path, "utf8"))) !== version) {
      console.error(`version did not take effect in ${t.file}`);
      process.exit(1);
    }
  }
  return version;
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "current") console.log(current());
else if (cmd === "next") console.log(next(arg || "patch"));
else if (cmd === "set") console.log(set(arg));
else {
  console.error("usage: version.mjs current | next [patch|minor|major] | set <version>");
  process.exit(1);
}
