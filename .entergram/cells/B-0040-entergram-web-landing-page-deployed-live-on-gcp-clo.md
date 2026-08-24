---
id: B-0040
type: architecture
tags: [gcp, cloud-run, deploy, live]
scope: web
confidence: 1
created: 2026-08-12
hook: entergram-web landing page deployed live on GCP Cloud Run: project project-fd1da402-505c-4d41-a14, region asia-south1, service name entergram-web, URL https://entergram-web-584262195098.asia-south1.run.app — deployed via `gcloud run deploy entergram-web --source web/ --port 3000` (Cloud Build + Artifact Registry), not Docker Hub. Verified live with curl (HTTP 200, correct page title)
---

# entergram-web landing page deployed live on GCP Cloud Run: project project-fd1da402-505c-4d41-a14, region asia-south1, service name entergram-web, URL https://entergram-web-584262195098.asia-south1.run.app — deployed via `gcloud run deploy entergram-web --source web/ --port 3000` (Cloud Build + Artifact Registry), not Docker Hub. Verified live with curl (HTTP 200, correct page title)

## What
entergram-web landing page deployed live on GCP Cloud Run: project project-fd1da402-505c-4d41-a14, region asia-south1, service name entergram-web, URL https://entergram-web-584262195098.asia-south1.run.app — deployed via `gcloud run deploy entergram-web --source web/ --port 3000` (Cloud Build + Artifact Registry), not Docker Hub. Verified live with curl (HTTP 200, correct page title)

## Why
chose the existing gcloud-authenticated project (same one hosting the user's other services: hygieia-*, streamhub) after explicit user confirmation, rather than provisioning a new project. Cloud Build source-deploy was simplest given the repo already had a working standalone-output Dockerfile.

## Update 2026-08-19 — service had vanished, now redeployed + hosts the pitch deck
The `entergram-web` service did NOT exist when checked on 2026-08-19: the recorded URL returned **404**,
and `gcloud run services list` showed only `engram-web` (the pre-rename name) plus the hygieia-*/streamhub
services. So this cell's URL was correct in *form* but pointed at nothing — a stale-liveness trap. It had
also leaked into the pitch deck's traction slide as proof of a live deployment, i.e. a 404 was being shown
to investors.

Redeployed with the same command shape (`gcloud run deploy entergram-web --source web/ --port 3000
--region asia-south1 --allow-unauthenticated`). **Cloud Run URLs are deterministic** per
project+service+region, so the recreated service came back on the *identical* URL
`https://entergram-web-584262195098.asia-south1.run.app` — verified HTTP 200.

Now also serves the pitch deck as a static file: **`/pitch.html`** (25 slides, HTTP 200 verified), placed
in `web/public/`. It carries `<meta name="robots" content="noindex,nofollow">` and a matching
`Disallow: /pitch.html` in `web/public/robots.txt` — share-by-link, deliberately not search-indexed.

**Gotcha to carry forward:** don't trust a recorded Cloud Run URL as evidence the service is live — curl
it before citing it anywhere external. The old `engram-web` service (both asia-south1 and us-central1)
is still running and is now a duplicate; not deleted, pending user decision.


