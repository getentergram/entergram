<div align="center">

# 🧠 Entergram

### Persistent engineering memory for your AI coding agent.

**The *why* behind your codebase — architecture, decisions, and rationale — on tap in Claude Code, Cursor, and Windsurf. In 5 minutes.**

[![Install](https://img.shields.io/badge/install-npm%20i%20--g%20entergram-black)](#quickstart)
[![MCP](https://img.shields.io/badge/works%20with-MCP-blue)](#connect-your-agent)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

</div>

---

## The problem

Your AI coding agent is brilliant and amnesiac. Every session it re-reads the same files, re-derives the same architecture, and re-asks questions your team answered six months ago. It doesn't know *why* auth moved to JWT, *why* that module is structured the way it is, or *what* broke last time someone touched the payment path.

That re-derivation is the hidden tax on every prompt.

## What Entergram does

Entergram gives your agent a **persistent, local-first engineering memory** built automatically from your repo's own history:

- 📖 **Learns from your codebase** — README, docs, ADRs, and **git history** (commits, PRs, issues) become durable memory of *decisions, reasons, and outcomes*.
- ⚡ **Recalls selectively** — the agent gets only the handful of facts relevant to the current task, never a document dump. A 5,000-fact memory costs the same per query as a 50-fact one.
- 🔌 **Works with any agent** — one MCP server spans Claude Code, Cursor, Windsurf, and Continue. Not a plugin per tool — one protocol.
- 🔒 **Local-first** — your code and memory never leave your machine unless you opt into sync. Bring your own model/key.

> *"I connected Entergram to a 300,000-line codebase in under five minutes. Claude immediately understood the architecture, explained why past decisions were made, and remembered everything across sessions."*

## Install

Installation differs by harness. Pick one — they deliver the same tool.

### Claude Code — plugin (recommended)

```
/plugin marketplace add chandrasaripaka/entergram
/plugin install entergram@entergram
```

The plugin declares the MCP server itself and brings the `recall-before-build` and
`capture-decision` skills with it, plus `/recall` and `/why`. Nothing to install globally and no
config file to edit.

### npm — any agent, or standalone

```bash
npm install -g get-entergram
```

### Homebrew

This repo is not named `homebrew-*`, so tap it by URL:

```bash
brew tap chandrasaripaka/entergram https://github.com/chandrasaripaka/entergram
brew install get-entergram
```

### Then, in your project

```bash
cd your-project
get-entergram init
get-entergram learn     # git history + docs → memory
```

Connect your agent (below) — or skip it entirely if you installed the Claude Code plugin, which
wires itself. Then just code; it remembers.

### Connect your agent

<details open>
<summary><b>Claude Code</b></summary>

Add to `.mcp.json`:
```json
{ "mcpServers": { "get-entergram": { "command": "get-entergram", "args": ["serve"] } } }
```
</details>

<details>
<summary><b>Cursor / Windsurf</b></summary>

Add an MCP server in settings: command `get-entergram`, args `["serve"]`.
</details>

<details>
<summary><b>Continue.dev</b></summary>

Add the same `get-entergram serve` block to your `config.json` `mcpServers`.
</details>

That's it. Your agent now has `recall`, `remember`, and `learn` as tools.

## How it works

Entergram is a small three-layer memory, not a database you babysit:

- **Cells** — one durable fact each (a decision, a gotcha, a convention), stored as plain Markdown you can `git diff`.
- **Index** — a tagged, full-text map; recall greps it and loads only what matches.
- **Discipline** — every write goes through extract → dedup → conflict-resolve, so you get *one authoritative answer*, not five contradicting notes.

Markdown is the source of truth; the local SQLite index is just a rebuildable cache.

## Commands

| Command | Does |
|---|---|
| `get-entergram init` | Scaffold memory in the current repo |
| `get-entergram learn` | Ingest git history + docs into memory (incremental) |
| `get-entergram recall "<q>"` | Test what the agent would retrieve |
| `get-entergram dispatch "<q>"` | Select the strongest-matching procedure (or fall back to recall) |
| `get-entergram remember "<fact>"` | Write a fact by hand |
| `get-entergram review` | Triage auto-extracted facts (accept / edit / reject) |
| `get-entergram doctor` | Health + coverage check |
| `get-entergram serve` | Run the MCP server for your agent |

## Free and open source

Every feature, no tiers, no seat counts. Entergram is MIT-licensed and runs entirely on your
machine — your code and your memory never leave it unless you choose to sync.

## Entergram vs. the alternatives

|  | Entergram | Cursor memories | Claude Projects | mem0 / vector RAG |
|---|---|---|---|---|
| Learns from **git history** | ✅ | ❌ | ❌ | ❌ |
| Stores **decisions + rationale** | ✅ | partial | ❌ | ❌ |
| **Any** agent (MCP) | ✅ | Cursor only | Claude only | SDK-level |
| Local-first / your data | ✅ | ❌ | ❌ | mostly cloud |
| Selective, token-cheap recall | ✅ | — | — | depends |

## Support

⭐ Star this repo · 🐛 Issues & PRs welcome · 💬 [Book a setup call](#)

<div align="center"><sub>Built on a memory architecture dogfooded across 180+ facts, 4 machines, and 500+ commits.</sub></div>
