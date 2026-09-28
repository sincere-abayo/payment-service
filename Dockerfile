# Multi-stage build for NestJS payment service
# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files (lockfile is required for reproducible npm ci)
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (incl. dev) for the build
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Verify dist directory was created
RUN ls -laR dist/ || (echo "Build failed - dist directory not found" && exit 1)

# Stage 2: Production
FROM node:22-alpine AS production

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copy package files
COPY package*.json ./

# Install production dependencies only
# (prisma CLI is a runtime dependency: entrypoint runs generate + migrate deploy)
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copy built application from builder
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma
COPY --chown=nestjs:nodejs docker-entrypoint.sh /app/

# Change ownership of node_modules to nestjs user
RUN chown -R nestjs:nodejs node_modules

# Switch to non-root user
USER nestjs

# Expose port (PORT env drives the app; defaults to 4040)
EXPOSE 4040

# Health check — uses PORT from environment (fallback 4040)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||4040)+'/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--", "/app/docker-entrypoint.sh"]
