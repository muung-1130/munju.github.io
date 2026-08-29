# syntax=docker/dockerfile:1

ARG ALPINE_VERSION=3.23


# --------------------------------------------------
# 1단계: 운영 의존성 설치
# --------------------------------------------------
FROM node:20-alpine${ALPINE_VERSION} AS deps

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./

RUN npm ci \
    --omit=dev \
    --no-audit \
    --no-fund


# --------------------------------------------------
# 테스트
# --------------------------------------------------
FROM deps AS test
COPY --chown=10001:10001 *.mjs ./
RUN npm test

# --------------------------------------------------
# 2단계: 최소 실행 이미지
# --------------------------------------------------
FROM alpine:${ALPINE_VERSION} AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache \
      libstdc++ \
      ca-certificates \
    && addgroup -S -g 10001 dairun \
    && adduser -S -D -H -u 10001 -G dairun dairun

# npm 없이 Node 실행 파일만 복사
COPY --from=deps \
    /usr/local/bin/node \
    /usr/local/bin/node

# 운영 의존성만 복사
COPY --from=deps --chown=10001:10001 \
    /app/node_modules \
    ./node_modules

# 서비스 실행에 필요한 파일만 복사
COPY --chown=10001:10001 package.json ./
COPY --chown=10001:10001 *.mjs ./

USER 10001:10001

CMD ["node", "index.mjs"]
