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


