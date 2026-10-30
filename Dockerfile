# Multi-stage Dockerfile for AI Mystery Room
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root and package manifests
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install all dependencies including devDependencies for build
RUN npm ci

# Copy full repository source
COPY client/ ./client/
COPY server/ ./server/
COPY eslint.config.mjs ./

# Build both client and server
RUN npm run build

# Production runtime stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Copy root package definitions
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install only production dependencies
RUN npm ci --omit=dev

# Copy compiled frontend and backend from builder stage
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/server/dist ./server/dist

EXPOSE 5000

CMD ["npm", "start"]
