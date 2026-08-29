FROM node:20-alpine AS deps
WORKDIR /app
COPY course-recommendation-service/package.json ./
RUN npm install --omit=dev --no-audit --no-fund

FROM node:20-alpine AS shared-deps
WORKDIR /shared
COPY shared/package.json ./
RUN npm install --omit=dev --no-audit --no-fund

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S -g 10001 dairun && adduser -S -D -H -u 10001 -G dairun dairun
RUN npm install -g npm@11
COPY --from=deps --chown=10001:10001 /app/node_modules ./node_modules
COPY --chown=10001:10001 course-recommendation-service/package.json ./
COPY --chown=10001:10001 course-recommendation-service/src ./src
COPY --from=shared-deps --chown=10001:10001 /shared/node_modules /shared/node_modules
COPY --chown=10001:10001 shared/package.json /shared/package.json
COPY --chown=10001:10001 shared/redis.ts /shared/redis.ts
USER 10001:10001
EXPOSE 4000
CMD ["npx", "tsx", "src/index.ts"]
