import WaitlistForm from "./components/WaitlistForm";

const GITHUB_LINK = process.env.NEXT_PUBLIC_GITHUB_LINK || "#";

const features = [
  {
    title: "Learns from your git history",
    body: "Commits, PRs, issues, docs and ADRs become durable memory of decisions, reasons, and outcomes — not just embeddings of chat.",
    icon: "📖",
  },
  {
    title: "Recalls selectively",
    body: "Your agent gets only the handful of facts relevant to the task, never a document dump. A 5,000-fact memory costs the same per query as 50.",
    icon: "⚡",
  },
  {
    title: "Works with any agent",
    body: "One MCP server spans Claude Code, Cursor, Windsurf, and Continue. Not a plugin per tool — one protocol.",
    icon: "🔌",
  },
  {
    title: "Local-first",
    body: "Your code and memory never leave your machine unless you opt into sync. Bring your own model or key.",
    icon: "🔒",
  },
];

const steps = [
  { cmd: "npm install -g get-entergram", label: "Install" },
  { cmd: "get-entergram init && get-entergram learn", label: "Learn your repo (git history + docs → memory)" },
  { cmd: "get-entergram serve  # add to your agent as an MCP server", label: "Connect your agent — then just code" },
];

// Claude Code users can skip the manual MCP wiring above: the plugin declares the
// server itself, and ships the recall/capture skills alongside it.
const pluginSteps = [
  { cmd: "/plugin marketplace add chandrasaripaka/entergram", label: "Add the marketplace" },
  { cmd: "/plugin install entergram@entergram", label: "Install — MCP server and skills wire themselves" },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6">
      {/* Nav */}
      <nav className="flex items-center justify-between py-6">
        <span className="text-lg font-bold tracking-tight">🧠 Entergram</span>
        <div className="flex items-center gap-6 text-sm text-white/70">
          <a href="#features" className="hidden hover:text-white sm:inline">Features</a>
          <a href="#free" className="hidden hover:text-white sm:inline">Free</a>
          <a href={GITHUB_LINK} className="hover:text-white">GitHub</a>
          <a href="#waitlist" className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20">Early access</a>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-20 text-center">
        <p className="mb-4 inline-block rounded-full border border-white/10 px-3 py-1 text-xs text-white/60">
          Works with Claude Code · Cursor · Windsurf · Continue
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
          Persistent engineering memory for your{" "}
          <span className="bg-gradient-to-r from-accent to-accent2 bg-clip-text text-transparent">AI coding agent</span>.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-white/70">
          The <em>why</em> behind your codebase — architecture, decisions, and rationale — on tap in your agent. Built automatically from your own git history. In 5 minutes.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4">
          <div id="waitlist" className="flex w-full justify-center scroll-mt-24">
            <WaitlistForm />
          </div>
          <a href={GITHUB_LINK} className="text-sm text-white/50 hover:text-white">★ Star on GitHub</a>
        </div>
      </section>

      {/* Demo slot */}
      <section className="pb-16">
        <div className="flex aspect-video w-full items-center justify-center rounded-2xl border border-white/10 bg-panel">
          <span className="text-white/30">▶ Demo — “I deleted half my project. The agent rebuilt it because Entergram remembered.”</span>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-24 py-16">
        <div className="grid gap-6 sm:grid-cols-2">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-white/10 bg-panel p-6">
              <div className="mb-3 text-2xl">{f.icon}</div>
              <h3 className="mb-2 text-lg font-semibold">{f.title}</h3>
              <p className="text-sm text-white/60">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="py-16">
        <h2 className="mb-8 text-center text-2xl font-bold">Five minutes, three commands</h2>
        <div className="space-y-4">
          {steps.map((s, i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-panel p-4">
              <p className="mb-2 text-xs uppercase tracking-wide text-white/40">Step {i + 1} — {s.label}</p>
              <pre className="overflow-x-auto font-mono text-sm text-accent2">{s.cmd}</pre>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-xl border border-accent2/20 bg-accent2/[0.04] p-5">
          <p className="mb-1 text-sm font-semibold">Using Claude Code? Two commands.</p>
          <p className="mb-4 text-xs text-white/50">
            The plugin declares the MCP server itself — no global install, no config file to edit —
            and brings the recall and capture skills with it.
          </p>
          <div className="space-y-3">
            {pluginSteps.map((s, i) => (
              <div key={i} className="rounded-lg border border-white/10 bg-panel p-3">
                <p className="mb-1.5 text-xs uppercase tracking-wide text-white/40">{s.label}</p>
                <pre className="overflow-x-auto font-mono text-sm text-accent2">{s.cmd}</pre>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Free & open source */}
      <section id="free" className="scroll-mt-24 py-16">
        <div className="rounded-2xl border border-accent/20 bg-accent/[0.06] p-8 text-center">
          <h2 className="text-2xl font-bold">Free, and open source</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-white/60">
            Every feature, no tiers, no seat counts. Entergram is MIT-licensed and runs entirely on
            your machine — your code and your memory never leave it unless you choose to sync.
          </p>
          <a
            href={GITHUB_LINK}
            className="mt-6 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Get it on GitHub
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="flex flex-col items-center justify-between gap-4 border-t border-white/10 py-10 text-sm text-white/40 sm:flex-row">
        <span>🧠 Entergram — persistent memory for AI coding agents.</span>
        <div className="flex gap-6">
          <a href={GITHUB_LINK} className="hover:text-white">GitHub</a>
          <a href="#free" className="hover:text-white">Free</a>
          <a href="#waitlist" className="hover:text-white">Waitlist</a>
        </div>
      </footer>
    </main>
  );
}
