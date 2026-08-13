# syntax=docker/dockerfile:1
# Entergram landing page — multi-stage build → small Next.js standalone runtime.

# 1. Install deps (cached on lockfile) — pnpm, shared content-addressable store keeps this fast
FROM node:20-alpine AS deps
WORKDIR /app
RUN npm i -g pnpm@10
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 2. Build
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm i -g pnpm@10
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* are inlined at build time — pass them as build args for production.
ARG NEXT_PUBLIC_STRIPE_LINK
ARG NEXT_PUBLIC_UPI_LINK
ARG NEXT_PUBLIC_GITHUB_LINK
ENV NEXT_PUBLIC_STRIPE_LINK=$NEXT_PUBLIC_STRIPE_LINK
ENV NEXT_PUBLIC_UPI_LINK=$NEXT_PUBLIC_UPI_LINK
ENV NEXT_PUBLIC_GITHUB_LINK=$NEXT_PUBLIC_GITHUB_LINK
RUN pnpm run build

# 3. Runtime (non-root, minimal)
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
