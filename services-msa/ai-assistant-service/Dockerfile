FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM deps AS test
COPY src ./src
COPY tests ./tests
RUN npm run test:sqs

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S -g 10001 dairun && adduser -S -D -H -u 10001 -G dairun dairun
RUN npm install -g npm@11
COPY --from=deps --chown=10001:10001 /app/node_modules ./node_modules
COPY --chown=10001:10001 package.json package-lock.json ./
COPY --chown=10001:10001 src ./src
USER 10001:10001
EXPOSE 4000
CMD ["npx", "tsx", "src/index.ts"]
