# Enterprise onboarding — architecture and strategy

How Entergram gets installed in an organisation larger than one repo. This is the
answer to the two questions every enterprise buyer asks first: *"what do you need to
connect to?"* and *"does this work with the agents we already run?"*

The short version:

- **Ingest and consumption are different planes.** MCP is the *consumption* plane — how
  agents query memory. It contributes nothing to ingest. Anyone who says "we use MCP" as
  an answer to "how do you get our Jira data" has not understood the question.
- **We do not build 200 connectors.** Decision memory needs *decision-dense* surfaces,
  not *all* surfaces. That is a genuine narrowing, not a gap — see §2.
- **The store graduates; the schema does not.** A cell is the same object at every scope.
  What changes is where cells live: files-in-a-repo for one person, a service once
  multiple teams share them. Git is the individual/team transport, *not* the enterprise one.

---

## 1. The two planes

```
   INGEST PLANE (write)                    CONSUMPTION PLANE (read)
   how decisions get captured              how memory gets used

   Jira · Confluence · Slack               Claude Code · Cursor · Windsurf
   GitHub · Meet · Salesforce      →  [ ENTERGRAM ]  →   Copilot · Codex · Gemini
   ServiceNow · HubSpot · email                        internal agents · humans

   webhooks, APIs, federation              MCP, REST/OpenAPI, A2A
```

Two planes, two integration strategies, two failure modes. Most vendor confusion in this
category comes from treating them as one.

---

## 2. Ingest: the three-tier connector strategy

Glean-class platforms ship 275+ connectors because they are **enterprise search** — they
must index everything, since any document might answer any query. Entergram is **decision
memory**: it needs the surfaces where *rationale is actually stated*. In every organisation
we have looked at, that is a small, predictable set. This is why the connector burden is
structurally smaller for us than for a search product, and it is a point worth making
explicitly to an investor who assumes we need feature parity with Glean's connector count.

### Tier 1 — build natively (~6, decision-dense)

These are where decisions are made and argued, not merely recorded.

| Source | What we extract | Mechanism |
|---|---|---|
| GitHub / GitLab / Bitbucket | PRs, review threads, merge outcome, revert history | webhooks (event-native) |
| Jira / Linear | issue rationale, status transitions, "won't do" reasons | webhooks |
| Slack / Teams | threads where a tradeoff is settled | Events API + explicit capture |
| Confluence / Notion | ADRs, design docs, post-mortems | API + change polling |
| Meeting transcripts (Meet/Zoom) | decisions and action items | transcript API |
| Incident tools (PagerDuty, Statuspage) | what broke, root cause, what changed after | webhooks |

### Tier 2 — federate, don't rebuild

For everything else (Salesforce, ServiceNow, HubSpot, SAP, Workday, SharePoint), we do
**not** write a connector. We read from the platform that already has one:

- **Glean** — query its API as a *source*, inheriting its whole connector estate.
- **Microsoft Graph** — one integration, covers Teams/SharePoint/Outlook/OneDrive.
- **Google Workspace APIs** — Drive/Chat/Meet in one auth boundary.

This inverts the usual competitive framing: the incumbents' connector investment becomes
our ingest layer. It also means the "why won't Glean just add this?" question cuts both
ways — we are complementary to their graph by construction, which is a partnership story
as much as a competitive one.

### Tier 3 — customer-built long tail

A documented ingest contract (webhook endpoint + JSON schema + an SDK) so the customer's
own platform team wires their bespoke systems. Every enterprise has an internal tool that
no vendor will ever connect to; the answer is a stable contract, not a promise to build it.

**Explicit non-goal:** we will not compete on connector count. If a deal is won or lost on
"do you have a Workday connector", we would rather federate or lose it than spend the
company's capital matching a search vendor's integration surface.

---

## 3. Consumption: agent integration

Agents are both **readers** and **writers**. The write direction is the one that compounds —
an agent that records the decision it just helped make is what makes the memory grow
without human data entry.

| Agent | Read path | Write path | Notes |
|---|---|---|---|
| Claude Code, Cursor, Windsurf, Continue | **MCP** (`recall`, `dispatch`) | MCP (`remember`) | Native today; one server, config-line install |
| GitHub Copilot | REST + Copilot Extension | REST | Not MCP-native — needs the HTTP surface |
| OpenAI Codex / ChatGPT | REST + tool/function schema | REST | Same |
| Gemini / Gemini Enterprise | REST + function calling | REST | Same |
| Internal / bespoke agents | REST + OpenAPI, or MCP | either | OpenAPI spec is the contract |
| Humans | CLI, web read-only view | `remember`, review queue | Review queue is where confidence is earned |

**Therefore MCP alone is insufficient**, for two reasons: not every agent speaks it, and it
does nothing for ingest. The required surface is **MCP + a versioned REST/OpenAPI API**,
with MCP as the preferred path where supported. A2A becomes relevant only once
agent-to-agent negotiation matters; it is not needed for v1.

---

## 4. Deployment topology — the store graduates

The unit of memory (a cell: what was decided, why, alternatives, outcome, provenance) is
**identical at every scope**. Only its storage and access path change.

| Scope | Store | Transport | Auth | Why this works |
|---|---|---|---|---|
| **Individual** | `.entergram/` files + SQLite index | local FS; git if shared | filesystem | One person, one repo. No service needed. |
| **Team** | same files, committed to the repo | **git** (`sync push/pull`) | repo permissions | Cells review in PRs like code. Git is genuinely the right answer here. |
| **Product** | cell service + object store | HTTPS API | SSO (OIDC) | Multiple repos and non-engineering contributors; git breaks down as a multi-writer store. |
| **Organisation** | event log + cell store + index + graph adapter | HTTPS API, webhooks | SSO + SCIM + permission mirroring | Cross-department, audit, retention, residency. |

**The graduation point is multi-writer, cross-repo scope.** Git is excellent up to one
team sharing one repo, and wrong past it: no row-level permissions, no partial visibility,
no clean multi-tenant story. Enterprise deployment is therefore a **service**, offered as:

- **Single-tenant VPC / on-prem** — the default expectation for decision memory, which is
  more sensitive than the code it describes.
- **Managed multi-tenant** — for smaller orgs, with per-tenant encryption.
- **Local-first retained** — individual and team scopes keep working offline and unchanged.
  Local-first is not abandoned at enterprise scope; it becomes the *edge* of the topology.

---

## 5. Scope interaction — how the four brains relate

Higher scopes are **views plus their own cells**, never copies:

```
  ORG BRAIN        own cells (policy, cross-dept decisions)
      ▲            + filtered view of every product brain
      │  promote (earns wider scope)     ▼ inherit (read-down, permission-gated)
  PRODUCT BRAIN    own cells (roadmap, pricing, architecture)
      ▲            + view of its teams
      │
  TEAM BRAIN       own cells (conventions, gotchas)
      ▲            + view of its members
      │
  INDIVIDUAL       own cells (working notes, personal gotchas)
```

Two rules make this tractable:

1. **Read-down, promote-up.** A team member reads their team's and product's cells; they do
   not read a sibling team's private cells unless promoted. Promotion is explicit — a cell
   earns wider scope when it proves durable, which is the same curation discipline that keeps
   the store authoritative rather than noisy.
2. **Permissions are mirrored, never re-invented.** Visibility derives from the source
   system's ACL (repo access, Slack channel membership, Confluence space permissions). We do
   not ask an enterprise to re-model its access control inside our product — that is both a
   security risk and a deployment blocker.

**Cross-scope effects are the actual product value:** an individual's gotcha promoted to team
scope stops three colleagues repeating it; a team's architecture decision at product scope
stops a sibling team contradicting it; a product decision at org scope is what lets finance
attribute cost and the board see a real record.

---

## 6. Onboarding sequence

| Phase | Duration | What happens | Exit criteria |
|---|---|---|---|
| **0 — Assessment** | ~3 days | Inventory decision-dense sources; pick one repo + one team; agree what "useful recall" means for them | Named pilot team, named success question |
| **1 — Pilot** | 2 weeks | Tier-1 ingest on one repo; backfill history; MCP wired to whatever agent they run; review queue triaged with the team | Their engineers get a *correct* answer to a real "why is it like this" question |
| **2 — Team** | 30 days | Whole team writing back; Slack/Confluence added; conventions promoted to team scope | Cells being written by humans and agents without prompting |
| **3 — Department** | 90 days | Product scope; second team; Tier-2 federation if they run Glean/MS Graph; SSO | Cross-team recall works; permission mirroring verified |
| **4 — Organisation** | 6 months+ | Org scope, non-engineering functions, audit/retention/residency | Decision lineage available to leadership without a status deck |

Deliberately **not** a big-bang rollout. The pilot must produce one genuinely useful recall
against the customer's own history, because that is the only evidence that survives
procurement.

---

## 7. What is honestly not built yet

Stated plainly because an enterprise buyer will find out in week one:

- **RBAC / ABAC, SSO, SCIM, permission mirroring** — designed above, not implemented. This is
  the single largest gap between today's product and an enterprise deployment.
- **The cell service** — today's store is files + SQLite. Product/org scope needs the service
  in §4. `sync push/pull` (git transport, team scope) is in progress.
- **Tier-2 federation adapters** — no Glean or Microsoft Graph reader exists yet.
- **Non-MCP agent surface** — the REST/OpenAPI API for Copilot/Codex/Gemini is specified
  here, not shipped.
- **Audit, retention, residency controls** — required for regulated buyers; absent.

The credible near-term motion is therefore **design partner, not enterprise sale**: pilot at
team scope where the product genuinely works today, and build §4 and §7 against a real
customer's constraints rather than speculatively.
