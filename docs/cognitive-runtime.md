# The cognitive runtime (architecture rationale, not a roadmap slide)

Entergram v1 ships two layers: **memory** and **recall**. This document is the architecture
rationale for the layers after that — written so the next two build phases have a real design to
implement against instead of a marketing phrase ("skills/orchestration") with no shape. Say
*memory* in the market; this is what stays in the architecture.

## Where this comes from

The cell/index/recall/gate-loop design didn't start as a spec — it started as a personal
engineering-memory practice (`~/.claude/brain`) that the author ran by hand for months before
Entergram existed (see `BUILD_SPEC.md §1`). That practice's own design rationale is a reframing of
Frank Rosenblatt's *Principles of Neurodynamics* (1961) — the original perceptron paper — read as
three unit types:

- **S-units** (sensory) — the router that loads every session; holds no facts itself.
- **A-units** (association) — the addressable memory: an index register plus fact-bodies, wired by
  tags (excitatory coupling) and links (lateral coupling).
- **R-units** (response/motor) — procedures that *cite* facts and drive an effector: retained,
  runnable code, not prose.

Entergram v1 productizes the S/A pair (memory + recall). The R-unit layer — the part that turns
"recall a fact" into "run the fix" — is the part still owed. Mapping it to neuroanatomy, structure
by structure, is what makes it buildable instead of aspirational.

## The map

| Structure | Function | Entergram v1 (shipped) | Entergram v2 (owed) |
|---|---|---|---|
| Hippocampus | Indexing / addressing | `.entergram/index.db` — SQLite FTS5 | — |
| Association cortex | Fact storage + lateral links | `.entergram/cells/B-NNNN-*.md` + `[[links]]` | — |
| Amygdala | High-salience memory | `type: gotcha` cells — a mistake caught once | — |
| Occipital lobe | Signal classification | `recall()`'s query → tag/FTS routing | — |
| Cerebellum | Fine-tune + verify executed action | `entergram doctor` (health, staleness, coverage) | — |
| Corpus callosum | Cross-hemisphere sync | *(phase 2)* `entergram sync push/pull` | — |
| Prefrontal cortex | Executive / governing doctrine | `entergram.toml` scope + a repo's own conventions | — |
| Primary motor cortex | Motor program | `type: procedure` cells — a citable procedure bound to this repo's own cells via `[[B-NNNN]]` (the repo-specific analogue of a `SKILL.md`) — formally an **RLM** (recursive language model): `dispatch()`'s `citedProcedures` surfaces the other procedure cells a winning procedure cites, one call's decomposition into sub-calls of itself | orchestrating/auto-following that citation chain |
| Basal ganglia | Action *selection* (winner-take-all) | `dispatch(query)` — decides *which* procedure a query should surface, not just which fact to return: it ranks the candidate-procedure pool against the fact pool by bm25 and picks whichever is the stronger match, gated on the procedure's `effector` actually existing on disk (never a dangling path) — formally a **MARL** (multi-agent reinforcement learning) action-selection problem over many candidate procedures and one shared action space | training/learning which procedure to prefer over time |
| Peripheral nervous system | The effector itself | the `effector:` path a procedure cell declares — a script `dispatch()` resolves and reports on, e.g. `entergram dispatch "foo is broken"` → the cell + its resolved effector path | *running* the effector — `dispatch()` is a selector only, never an executor; that decision stays with the human/agent reading the result |

Everything in the "shipped" column already exists because it only had to solve *storage and
retrieval* — a solved problem once you commit to cells + FTS. Everything in the "owed" column is
harder because it requires *action*: deciding which of a repo's known-good procedures applies right
now, and actually running it, not just describing it in a returned fact.

## Design consequence: recall vs. dispatch (shipped: selection, not execution)

`recall(query)` returns facts for an agent to read. `dispatch(query)` (`cli/src/db.js`) sits next to
it and answers a narrower question: is there a `type: procedure` cell that is a *stronger* match
for this query than any fact, and does its declared `effector:` script actually exist on disk right
now? If both hold, `dispatch` returns `{ winner: "procedure", cell, effectorPath, why,
citedProcedures }` — "this failure mode has a known fix cell with an attached script; here it is,
already scoped to this repo, resolved to a real path." If either fails to hold — no procedure beats
the best fact, or the winning procedure's effector is missing from disk — `dispatch` falls back to
the exact shape `recall`/`search()` already returns (`{ winner: "recall", hits, tokens, total,
synthesis }`), so a dangling effector path is never surfaced as a "the procedure that would fire".

That gate — a procedure only wins if its effector is *real*, checked with `fs.existsSync` at
call time — is the same effector-gate discipline the precursor practice enforces on its own skills
(every procedure must declare real, runnable code or be explicitly marked exempt/pending — no
procedure gets to be prose-only forever), applied to a customer's repo instead of the author's own
machine.

The RLM framing is the `citedProcedures` field: if the winning procedure's body cites other
`type: procedure` cells via the existing `[[B-NNNN]]` link syntax (parsed into the `edges` table
`reindex()` already builds), those are surfaced as candidate sub-calls — id + hook, nothing more.
`dispatch` does not follow that citation chain itself; it reports it for whoever's holding the
result to decide what to do next.

What has **not** shipped, and is explicitly out of scope here: `dispatch` never runs, spawns, or
shells out to an effector — it is a selector, not an executor, and that boundary is enforced in
code, not just by convention. There is also no MARL *training* loop; action selection today is a
single deterministic bm25-rank comparison with an existence gate, not a learned policy over
outcomes. Both remain real "owed" items, not just words softened for a roadmap slide.

## Local-first doesn't relax for this layer

`BUILD_SPEC.md §0`'s first design principle — nothing leaves the machine unless the user opts in —
is not a v1-only promise. Both the RLM motor program and the MARL dispatcher run against a local
model or the user's own API key, exactly like today's extraction step (§4 of `BUILD_SPEC.md`).
Adding orchestration means the CLI does more locally; it does not open a new place where a repo's
code or a customer's decision history leaves the machine. If a future revision of this layer ever
needs a hosted model to be useful, that is a distinct, explicitly-opt-in mode — never the default —
same as `entergram sync` is opt-in today.

## What this doc is not

Not a v1 commitment, not a public feature promise, not a reason to slow down memory + recall. It
exists so that when `learn/consolidate` (built) is solid enough to fund the next layer, the next
layer has a shape someone can implement in a sprint instead of a paragraph someone has to
re-invent from scratch.
