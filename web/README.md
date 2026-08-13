# Entergram — Landing page

Next.js (App Router) + Tailwind. Vercel-ready.

## Local dev
```bash
cd web
npm install
cp .env.example .env.local   # fill in Stripe link etc. (all optional for local)
npm run dev                   # http://localhost:3000
```

## Deploy to Vercel
1. Push the repo (already private on GitHub).
2. Import into Vercel, set **Root Directory = `web`**.
3. Add env vars from `.env.example` (`NEXT_PUBLIC_STRIPE_LINK`, `NEXT_PUBLIC_GITHUB_LINK`, optional `WAITLIST_WEBHOOK`).
4. Deploy. Point your domain (e.g. entergram.dev) at it.

## What's here
- `app/page.tsx` — the single landing page (hero, demo slot, features, how-it-works, pricing, footer).
- `app/components/WaitlistForm.tsx` — client form → `POST /api/waitlist`.
- `app/api/waitlist/route.ts` — signup sink; forwards to `WAITLIST_WEBHOOK` if set, else logs.

## TODO (next passes)
- Drop the real demo GIF into the demo slot (Day 7).
- Wire `WAITLIST_WEBHOOK` to a real list (Buttondown/Formspree) so signups persist.
- Create the Stripe Payment Link and set `NEXT_PUBLIC_STRIPE_LINK`.
