# syntax=docker/dockerfile:1
# Engram landing page — multi-stage build → small Next.js standalone runtime.

# 1. Install deps (cached on lockfile)
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 2. Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* are inlined at build time — pass them as build args for production.
ARG NEXT_PUBLIC_STRIPE_LINK
ARG NEXT_PUBLIC_GITHUB_LINK
ENV NEXT_PUBLIC_STRIPE_LINK=$NEXT_PUBLIC_STRIPE_LINK
ENV NEXT_PUBLIC_GITHUB_LINK=$NEXT_PUBLIC_GITHUB_LINK
RUN npm run build

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
