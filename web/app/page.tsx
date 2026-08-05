import WaitlistForm from "./components/WaitlistForm";

const STRIPE_LINK = process.env.NEXT_PUBLIC_STRIPE_LINK || "#";
const UPI_LINK = process.env.NEXT_PUBLIC_UPI_LINK || "";
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
  { cmd: "npm install -g get-engram", label: "Install" },
  { cmd: "get-engram init && get-engram learn", label: "Learn your repo (git history + docs → memory)" },
  { cmd: "get-engram serve  # add to your agent as an MCP server", label: "Connect your agent — then just code" },
];

const tiers = [
  { name: "Install", price: "$500", unit: "one-off", cta: "Get set up", href: STRIPE_LINK, blurb: "We install Engram on your repo, tune it, and wire your agent in an hour.", highlight: true },
  { name: "Starter", price: "$19", unit: "/mo", cta: "Join waitlist", href: "#waitlist", blurb: "Solo, one repo." },
  { name: "Pro", price: "$49", unit: "/mo", cta: "Join waitlist", href: "#waitlist", blurb: "Private sync, PR/issue learning, priority." },
  { name: "Teams", price: "$199", unit: "/mo per repo", cta: "Join waitlist", href: "#waitlist", blurb: "Shared engineering memory for the whole team." },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6">
      {/* Nav */}
      <nav className="flex items-center justify-between py-6">
        <span className="text-lg font-bold tracking-tight">🧠 Engram</span>
        <div className="flex items-center gap-6 text-sm text-white/70">
          <a href="#features" className="hidden hover:text-white sm:inline">Features</a>
          <a href="#pricing" className="hidden hover:text-white sm:inline">Pricing</a>
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
          <span className="text-white/30">▶ Demo — “I deleted half my project. The agent rebuilt it because Engram remembered.”</span>
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
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-24 py-16">
        <h2 className="mb-2 text-center text-2xl font-bold">Pricing</h2>
        <p className="mb-10 text-center text-sm text-white/50">Start with a done-for-you install. Subscriptions when you want them.</p>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`flex flex-col rounded-2xl border p-6 ${t.highlight ? "border-accent bg-accent/10" : "border-white/10 bg-panel"}`}
            >
              <h3 className="text-sm font-semibold text-white/70">{t.name}</h3>
              <p className="mt-2">
                <span className="text-3xl font-bold">{t.price}</span>
                <span className="text-sm text-white/50"> {t.unit}</span>
              </p>
              <p className="mt-3 flex-1 text-sm text-white/60">{t.blurb}</p>
              <a
                href={t.href}
                className={`mt-6 rounded-lg px-4 py-2 text-center text-sm font-semibold transition ${t.highlight ? "bg-accent text-white hover:opacity-90" : "bg-white/10 hover:bg-white/20"}`}
              >
                {t.cta}
              </a>
              {t.name === "Install" && UPI_LINK && (
                <a href={UPI_LINK} className="mt-2 text-center text-xs text-white/50 hover:text-white hover:underline">
                  or pay via UPI →
                </a>
              )}
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-white/40">
          Need on-prem / local-first at scale? <a href="#waitlist" className="text-accent2 hover:underline">Book a demo →</a>
        </p>
      </section>

      {/* Footer */}
      <footer className="flex flex-col items-center justify-between gap-4 border-t border-white/10 py-10 text-sm text-white/40 sm:flex-row">
        <span>🧠 Engram — persistent memory for AI coding agents.</span>
        <div className="flex gap-6">
          <a href={GITHUB_LINK} className="hover:text-white">GitHub</a>
          <a href="#pricing" className="hover:text-white">Pricing</a>
          <a href="#waitlist" className="hover:text-white">Waitlist</a>
        </div>
      </footer>
    </main>
  );
}
