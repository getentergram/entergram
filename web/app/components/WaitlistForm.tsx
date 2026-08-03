"use client";

import { useState } from "react";

export default function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Something went wrong");
      setState("done");
      setMsg("You're on the list — we'll be in touch.");
      setEmail("");
    } catch (err) {
      setState("error");
      setMsg(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (state === "done") {
    return <p className="text-accent2 font-medium">✓ {msg}</p>;
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        className="flex-1 rounded-lg border border-white/10 bg-panel px-4 py-3 text-sm outline-none placeholder:text-white/30 focus:border-accent"
      />
      <button
        type="submit"
        disabled={state === "loading"}
        className="rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {state === "loading" ? "Joining…" : "Join waitlist"}
      </button>
      {state === "error" && <p className="text-red-400 text-sm sm:hidden">{msg}</p>}
    </form>
  );
}
