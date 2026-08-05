# Payments setup (Day 9)

The landing page takes money through **Stripe Payment Links** (no backend needed), with an optional
**UPI / Razorpay** link for India. Creating the links is a dashboard task; wiring them is just env vars.

## 1. Stripe — the $500 install (one-off)

1. dashboard.stripe.com → **Payment Links** → New → one-time, $500, name "Engram Install".
2. Copy the link (`https://buy.stripe.com/…`).
3. Set `NEXT_PUBLIC_STRIPE_LINK` to it.

## 2. Stripe — the monthly tiers (optional, makes them chargeable)

Create a recurring Payment Link per tier and set the matching env var. When set, the tier's button
becomes **Subscribe**; when unset it falls back to the waitlist (safe default for launch).

| Tier | Amount | Env var |
|---|---|---|
| Starter | $19 / mo | `NEXT_PUBLIC_STRIPE_STARTER` |
| Pro | $49 / mo | `NEXT_PUBLIC_STRIPE_PRO` |
| Teams | $199 / mo (per repo) | `NEXT_PUBLIC_STRIPE_TEAMS` |

Teams is priced **per repo** — either one link with adjustable quantity, or bill per repo on setup.

## 3. UPI / India (optional)

Razorpay → **Payment Links** with UPI enabled (dashboard.razorpay.com → Payment Links), $500 equivalent.
Set `NEXT_PUBLIC_UPI_LINK`. It shows as a secondary "or pay via UPI →" under the Install tier; leave unset to hide.

## 4. Set the env vars (Vercel)

Project → Settings → Environment Variables. `NEXT_PUBLIC_*` are **build-time** — redeploy after changing them.

```
NEXT_PUBLIC_STRIPE_LINK=https://buy.stripe.com/...
NEXT_PUBLIC_STRIPE_STARTER=            # optional
NEXT_PUBLIC_STRIPE_PRO=                # optional
NEXT_PUBLIC_STRIPE_TEAMS=              # optional
NEXT_PUBLIC_UPI_LINK=                  # optional
WAITLIST_WEBHOOK=                      # optional (server-side; no rebuild needed)
```

For Docker builds, pass the `NEXT_PUBLIC_*` as `--build-arg` (see `docker-compose.yml`).

## 5. Test

- Load the page → Install button → Stripe test-mode checkout completes.
- Any tier with a link set shows **Subscribe** and reaches Stripe; tiers without a link show **Join waitlist**.
- (India) the UPI link opens a UPI-enabled checkout.

## Revenue sequencing (from the plan)

Lead with the **$500 done-for-you install** for immediate cash and design-partner intimacy; turn on the
$19/$49/$199 subscriptions once a few installs validate the workflow. Enterprise stays "book a demo"
(local-first / on-prem is the wedge).
