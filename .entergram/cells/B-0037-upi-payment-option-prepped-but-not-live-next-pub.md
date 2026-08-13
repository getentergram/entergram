---
id: B-0037
type: decision
tags: [payments, upi, pricing, pending]
scope: web
confidence: 1
created: 2026-08-12
hook: UPI payment option prepped but not live: NEXT_PUBLIC_UPI_LINK env var wired into page.tsx (shows "or pay via UPI →" under the $500 Install tier, hidden when unset), plumbed through .env.example/Dockerfile/docker-compose. User still needs to create a Razorpay Payment Link (UPI-enabled) themselves — requires their own KYC/business account, not something an agent can do
---

# UPI payment option prepped but not live: NEXT_PUBLIC_UPI_LINK env var wired into page.tsx (shows "or pay via UPI →" under the $500 Install tier, hidden when unset), plumbed through .env.example/Dockerfile/docker-compose. User still needs to create a Razorpay Payment Link (UPI-enabled) themselves — requires their own KYC/business account, not something an agent can do

## What
UPI payment option prepped but not live: NEXT_PUBLIC_UPI_LINK env var wired into page.tsx (shows "or pay via UPI →" under the $500 Install tier, hidden when unset), plumbed through .env.example/Dockerfile/docker-compose. User still needs to create a Razorpay Payment Link (UPI-enabled) themselves — requires their own KYC/business account, not something an agent can do

## Why
user asked to "connect to UPI" for the pricing CTA; Razorpay recommended over PhonePe Business because Payment Links + Subscriptions cover both the one-off $500 install AND the recurring $19/$49/$199 tiers with one provider


