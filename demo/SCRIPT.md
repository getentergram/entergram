# Engram — 3-minute demo script

The runnable demo is `demo/demo.sh` (deterministic). This is the recording guide to turn it
into the landing-page GIF + the launch video.

## Capture setup
- Terminal at ~100×30, large font, dark theme. Record with **asciinema** then convert to GIF
  (`agg`), or **terminalizer**. Target: a <15s looping GIF for the hero, a ~3-min narrated video for launch.
- Run with a visible typing cadence: `DEMO_PAUSE=1.5 bash demo/demo.sh` (bump pause for pacing).

## The narrative (what each beat says)

| Time | On screen (demo.sh beat) | Voiceover |
|---|---|---|
| 0:00 | `git log` of Acme Billing — 3 decisions + an ADR | "Every codebase records decisions — in commits, PRs, docs. Your AI agent forgets them every session." |
| 0:20 | `get-engram init` + `get-engram learn` | "One command gives it a memory — built from the repo's own history." |
| 0:45 | `get-engram recall "why is auth stateless"` | "Now ask *why*. It knows: JWT, to kill the Redis dependency — pulled from the ADR and the commit." |
| 1:15 | `rm -rf docs auth.ts ledger.ts README.md` | "Now the disaster. Half the project is deleted. A fresh agent would have nothing." |
| 1:40 | `get-engram recall "auth jwt redis"` still returns the decision | "But the memory survived. The *why* is still on tap — independent of the files." |
| 2:20 | `.mcp.json` snippet | "And this is exactly what Claude Code, Cursor, and Windsurf get — every session — through one MCP server." |
| 2:40 | Closing card | "Engram. The why behind your codebase, on tap. engram.dev" |

## The hero GIF (short loop)
Trim to beats **0:45 → 1:40**: ask why → delete everything → recall still answers. That 15-second
"files gone, memory intact" loop is the whole pitch; drop it into the landing `web/` demo slot.

## Notes
- The demo uses `--no-llm` so it runs offline and identically every take. For the *sales* video,
  set `ANTHROPIC_API_KEY` first so recall shows richer extracted {decision, reason, outcome} hooks.
