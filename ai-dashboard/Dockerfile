# syntax=docker/dockerfile:1
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S -g 10001 dairun \
    && adduser -S -D -H -u 10001 -G dairun dairun \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx
COPY --from=builder /app/public ./public
COPY --from=builder --chown=10001:10001 /app/.next/standalone ./
COPY --from=builder --chown=10001:10001 /app/.next/static ./.next/static
USER 10001:10001
CMD ["node", "server.js"]
