# Multi-stage production build for Frontdesk monorepo
# Stage 1: Build packages and web assets
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package manifests
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/sla/package.json ./packages/sla/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Install all dependencies including devDependencies for build
RUN npm ci

# Copy full source tree
COPY tsconfig.base.json tsconfig.json ./
COPY packages/shared ./packages/shared
COPY packages/sla ./packages/sla
COPY apps/api ./apps/api
COPY apps/web ./apps/web

# Build shared packages, frontend SPA, then API server
RUN npm run build --workspace=@frontdesk/shared && \
    npm run build --workspace=@frontdesk/sla && \
    npm run build --workspace=@frontdesk/web && \
    npm run build --workspace=@frontdesk/api

# Stage 2: Minimal Production Image
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Install runtime dependencies for health checks
RUN apk add --no-cache curl

# Copy root manifest and workspaces
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/sla/package.json ./packages/sla/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built artifacts from builder stage
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/sla/dist ./packages/sla/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/src/db/schema.sql ./apps/api/src/db/schema.sql
COPY --from=builder /app/apps/web/dist ./apps/web/dist

# Expose single unified service port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start unified Fastify server (serves frontend SPA + API routes + runs scheduler)
CMD ["node", "apps/api/dist/index.js"]
