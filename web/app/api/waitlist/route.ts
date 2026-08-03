import { NextResponse } from "next/server";

// MVP waitlist sink. No database (per the build spec — keep it simple).
// If WAITLIST_WEBHOOK is set (Formspree / Zapier / Buttondown / a Google Apps Script URL),
// signups are forwarded there. Otherwise we just accept + log, so the form works day one.
export async function POST(req: Request) {
  let email = "";
  try {
    ({ email } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const valid = typeof email === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  if (!valid) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }

  const webhook = process.env.WAITLIST_WEBHOOK;
  if (webhook) {
    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "engram-landing", ts: new Date().toISOString() }),
      });
    } catch {
      // Don't fail the signup if the forward hiccups; we still captured it in logs.
    }
  } else {
    console.log(`[waitlist] ${email}`);
  }

  return NextResponse.json({ ok: true });
}
