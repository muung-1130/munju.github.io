# syntax=docker/dockerfile:1

ARG ALPINE_VERSION=3.23


# --------------------------------------------------
# 1단계: 빌드 의존성 설치
# --------------------------------------------------
FROM node:20-alpine${ALPINE_VERSION} AS deps

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci \
    --no-audit \
    --no-fund


# --------------------------------------------------
# 2단계: Next.js 빌드
# --------------------------------------------------
FROM node:20-alpine${ALPINE_VERSION} AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build


# --------------------------------------------------
# 3단계: 최소 운영 이미지
# --------------------------------------------------
FROM alpine:${ALPINE_VERSION} AS runner

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# Node 실행에 필요한 최소 라이브러리와 인증서만 설치
RUN apk add --no-cache \
      libstdc++ \
      ca-certificates \
    && addgroup -S -g 10001 dairun \
    && adduser -S -D -H -u 10001 -G dairun dairun

# npm, npx, Corepack을 제외하고 Node 실행 파일만 복사
COPY --from=builder \
    /usr/local/bin/node \
    /usr/local/bin/node

# Next.js standalone 결과만 복사
COPY --from=builder --chown=10001:10001 \
    /app/.next/standalone ./

COPY --from=builder --chown=10001:10001 \
    /app/.next/static ./.next/static

COPY --from=builder --chown=10001:10001 \
    /app/public ./public

USER 10001:10001

EXPOSE 3000

CMD ["node", "server.js"]
