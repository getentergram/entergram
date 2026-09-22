---
id: B-0038
type: gotcha
tags: [docker, dockerhub, blocked, gotcha]
scope: web
confidence: 1
created: 2026-08-12
hook: Docker Hub push of getentergram/entergram-web is NOT done — blocked on `docker login` (interactive, needs the user). Do not assume the image exists on Docker Hub; the only live deployment is the Cloud Run one
---

# Docker Hub push of getentergram/entergram-web is NOT done — blocked on `docker login` (interactive, needs the user). Do not assume the image exists on Docker Hub; the only live deployment is the Cloud Run one

## What
Docker Hub push of getentergram/entergram-web is NOT done — blocked on `docker login` (interactive, needs the user). Do not assume the image exists on Docker Hub; the only live deployment is the Cloud Run one

## Why
a prior stuck build attempt plus a host disk-full event left Docker Desktop's daemon wedged for days; after restarting Docker Desktop the build succeeded locally but the push failed with insufficient_scope (not authenticated) — user chose to hold off rather than log in immediately


