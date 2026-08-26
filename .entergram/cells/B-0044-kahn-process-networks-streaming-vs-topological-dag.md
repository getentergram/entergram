---
id: B-0044
type: convention
tags: [kpn, streaming, gilles-kahn, arthur-kahn, deterministic-fifo, dag-sorting]
scope: global
confidence: 1
created: 2026-08-24
hook: Gilles Kahn Process Networks (KPN 1974) FIFO Streaming vs. Arthur Kahn (1962) Topological DAG Ordering: Disambiguates deterministic multi-core stream ingestion pipelines (KPN) from procedure dependency DAG resolution.
---

# Gilles Kahn Process Networks (KPN) vs. Arthur Kahn Topological Sort

## What
Disambiguated and formalized two distinct mathematical foundations across the Entergram/Pharmagram runtime:
1. **Gilles Kahn Process Networks (KPN 1974)**: Deterministic, asynchronous stream dataflow computation using unidirectional FIFO channels with non-blocking write and blocking read. Guarantees that continuous data ingestion (from Git, LIMS, ChEMBL, ClinicalTrials.gov, EHR streams) produces identical output sequences across distributed threads/FPGAs without race conditions ($Y = F(X)$).
2. **Arthur Kahn (1962) Topological Sort**: In-degree vertex elimination for DAG dependency resolution in procedure cascades and multi-step execution plans (`cli/src/runtime/rlm_cascade.js`).

## Why
Prevents conflating stream ingestion determinism with procedure execution ordering, ensuring scalable, reproducible data processing across both software and biopharmaceutical domains.
