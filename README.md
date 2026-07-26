# DAI RUN Web Full Mockup

TypeScript + Next.js 기반 DAI RUN 웹 페이지 목업입니다.
상단 네비게이션은 모든 페이지에서 동일하게 표시됩니다.

## 포함 페이지

- `/` 홈
- `/courses` 코스 탐색
- `/crew` 러닝크루
- `/challenges` 챌린지
- `/marathon` 마라톤
- `/shoes` 러닝화 추천 & 수명 예측
- `/mypage` 마이페이지

## 로컬 실행

```bash
npm install
npm run dev
```

접속:

```text
http://localhost:3000
```

## Docker + Nginx 실행

```bash
docker compose down --remove-orphans
docker rm -f dai-run-nginx dai-run-frontend dai-run-backend 2>/dev/null || true
docker compose up -d --build --force-recreate
```

접속:

```text
http://localhost:8080
```

서버 외부 PC에서 접속하는 경우 `localhost`가 아니라 서버 IP를 사용하세요.

```text
http://서버IP:8080
```

## 확인 명령어

```bash
docker compose ps
docker logs dai-run-frontend --tail=50
docker logs dai-run-backend --tail=50
docker logs dai-run-nginx --tail=50
curl -I http://localhost:8080
curl -I http://localhost:8080/api/health
```
