<!-- title: Ambient Mesh 외부 Egress 차단 이슈 — 플랫폼팀 인계 -->

# Istio Ambient Mesh — 외부(비-mesh) 목적지 egress 차단 이슈

작성 기준: 2026-08-23 · 대상: 플랫폼/네트워크 담당자 · 작성: Claude(AI) 세션, `dir-ai-dashboard`의 Bedrock 연동 디버깅 중 발견

## 한 줄 요약

`dir-frontend-ns`(ambient mesh 적용 네임스페이스)의 Pod들은 **mesh 밖 목적지로 나가는 HTTPS 트래픽이 전부 막혀있음** — NetworkPolicy를 아무리 열어도 해결 안 됨. 코드/설정 문제 아니라 Istio ambient mesh(ztunnel) 레벨의 문제로 보임.

## 영향

- `dir-ai-dashboard`의 AI 진단/인사이트 기능 — Bedrock(`bedrock-runtime.ap-northeast-2.amazonaws.com`) 호출 전부 실패
- 같은 패턴이 `dir-frontend`에서도 재현됨(구글 접속조차 안 됨) — **`dir-ai-dashboard`만의 문제가 아니라 네임스페이스 전체(어쩌면 ambient mesh 적용된 다른 네임스페이스도) 영향받을 가능성**
- 잠재적으로: 외부 API·서드파티 웹훅·VPC 엔드포인트 없는 AWS 서비스 호출 등 "mesh 밖으로 나가는 모든 트래픽"이 같은 문제를 겪을 것으로 추정

## 재현 방법

```bash
# dir-ai-dashboard 파드
kubectl exec -n dir-frontend-ns <dir-ai-dashboard 파드> -- node -e '
const https = require("https");
const start = Date.now();
const req = https.get({ host: "www.google.com", path: "/", family: 4, timeout: 6000 }, (res) => {
  console.log("OK after", Date.now()-start, "ms, status", res.statusCode);
});
req.on("timeout", () => console.log("TIMEOUT after", Date.now()-start, "ms"));
req.on("error", (e) => console.log("ERROR after", Date.now()-start, "ms:", e.message));
'
# 결과: ERROR after 10165 ms: read ECONNRESET

# dir-frontend 파드 (완전히 다른 워크로드, 동일 증상 재현 확인용)
kubectl exec -n dir-frontend-ns <dir-frontend 파드> -- wget -qO- -T 8 -S https://www.google.com
# 결과: wget: download timed out / ssl_client: SSL_connect
```

- 두 워크로드 모두 IPv4를 명시적으로 강제해도(`family: 4`) 동일하게 실패 — IPv6 우선순위 문제 아님.
- DNS 해석 자체는 정상 동작(`172.20.0.10`, cluster DNS로 정상 응답받음).

## 이미 확인/시도해본 것 (전부 효과 없었음)

1. **NetworkPolicy egress 허용** — `443` 포트로 `0.0.0.0/0`(사설 대역 제외) 허용하는 규칙이 이미 있음(`dir-ai-dashboard-allow-public-https`, `dir-frontend-allow-public-https` 등, 두 워크로드 모두 존재). 효과 없음.
2. **Bedrock 전용 VPC 엔드포인트 IP 명시적 허용** — `bedrock-runtime.ap-northeast-2.amazonaws.com`이 DNS에서 사설 IP(`10.10.5.117`, `10.10.2.77`, 아마 PrivateLink VPC 엔드포인트)로 응답하길래, 이 두 IP를 `/32`로 명시 허용하는 NetworkPolicy를 추가로 넣어봤음(`dir-ai-dashboard-bedrock-vpce-egress`). **이것도 효과 없음** — Postgres/Redis/Loki(전부 클러스터 내부 IP)는 정확히 같은 패턴(명시적 IP/서비스 허용 NetworkPolicy)으로 정상 동작하는데, Bedrock VPC 엔드포인트만 안 됨. NetworkPolicy/CNI 레이어의 문제가 아니라는 뜻으로 해석됨.
3. 참고: **같은 클래스의 문제를 이전에 K8s API 서버(`172.20.0.1`) 접근에서도 겪었음** — 그때도 NetworkPolicy를 열어도 `Connection reset`이 났고, 결국 이 클러스터에서 K8s API를 직접 조회해야 하는 워크로드(KEDA, ArgoCD)는 전부 **ambient mesh 라벨이 없는 네임스페이스**에 떠 있다는 걸 확인해서 우회했음(`docs/dir-ai-dashboard-troubleshooting.md` 참고). 이번 건은 그 문제의 "외부 인터넷" 버전으로 보임 — 즉 ambient mesh가 **mesh 멤버가 아닌 목적지**로 나가는 트래픽 전반을 제대로 못 다루는 것 같음.

## 확인해줬으면 하는 것

- ztunnel의 아웃바운드 트래픽 처리 로직이 mesh 비멤버 목적지(K8s API 서버, 외부 인터넷, VPC 엔드포인트 등)를 어떻게 처리하도록 설정돼 있는지
- Istio ambient mode의 "waypoint" 또는 egress gateway 설정이 이 클러스터에 존재하는지, 외부 트래픽에 대해 명시적으로 설정이 필요한 상태인지 (예: `ServiceEntry` 리소스 필요 여부)
- `dir-frontend-ns`처럼 ambient mesh가 켜진 네임스페이스에서 실제로 외부 HTTPS 호출이 성공하는 사례가 있는지 (있다면 그 워크로드/설정과 우리 쪽 차이점 확인)
- ztunnel/istio-cni 버전에 알려진 관련 이슈가 있는지

## 임시 우회 방법 (참고용)

- **없음** — NetworkPolicy 레벨에서 시도 가능한 옵션은 다 시도했으나 효과 없었음.
- K8s API 서버 케이스처럼 "이 워크로드를 ambient 밖으로 빼기"는 인그레스 mTLS(Gateway → Pod)가 깨질 위험이 있어 검증 없이 진행 안 함.
- 현재 `dir-ai-dashboard`는 이 문제로 인해 AI 진단/인사이트 기능이 "코드·자격증명·IAM 권한은 전부 정상인데 네트워크가 막혀서" 계속 실패하는 상태로 두고 있음(mock 폴백 없이 사용자에게 에러로 노출됨 — 화면 자체는 안 깨짐).

## 관련 커밋/변경 이력 (참고)

- `dir-ai-dashboard-bedrock-vpce-egress` NetworkPolicy — 직접 적용해서 테스트했으나 효과 없어 클러스터에 남아있음(무해하지만 실효 없는 규칙, 문제 해결 후 정리 필요할 수도 있음)
- `docs/dir-ai-dashboard-troubleshooting.md` §K8s API 서버 접근 문제 — 같은 클래스의 이전 사례, 진단 명령어 모음 포함
