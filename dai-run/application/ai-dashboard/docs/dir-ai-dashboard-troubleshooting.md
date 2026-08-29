<!-- title: dir-ai-dashboard 배포 트러블슈팅 기록 -->

# dir-ai-dashboard 배포 막힘 — 원인 분석 및 해결 기록

작성 기준: 2026-08-18 · 대상: CI/CD·Kubernetes 담당자 · 목적: 다음에 새 서비스를 `dir-frontend-ns`(또는 비슷하게 NetworkPolicy/Gateway가 세팅된 다른 네임스페이스)에 온보딩할 때 같은 함정에 안 빠지도록 남기는 기록

관련 문서: [dir-ai-dashboard-onboarding.md](./dir-ai-dashboard-onboarding.md) (배포 자체의 히스토리와 최종 상태)

---

## 요약

`dir-ai-dashboard-secret`을 만들어준 뒤에도 Pod가 `Running`은 되는데 계속 재시작하며 `READY 0/1`에서 못 벗어났고, `https://dashboard.dairun.site`는 TLS 핸드셰이크는 성공하는데 `404`를 반환했다. 둘 다 **이 워크로드 자체의 코드/설정 문제가 아니라, 새 서비스를 온보딩할 때 플랫폼 쪽에서 같이 챙겨야 하는 두 가지를 빠뜨려서** 생긴 문제였다.

| # | 증상 | 원인 | 해결 |
|---|---|---|---|
| 1 | Startup probe가 계속 타임아웃, Pod가 몇 번씩 재시작 | `dir-frontend-ns`는 default-deny 네임스페이스인데 `dir-ai-dashboard`용 예외 NetworkPolicy가 없었음 | `dir-frontend`가 쓰는 것과 동일한 패턴으로 NetworkPolicy 8개 추가 |
| 2 | `curl`은 TLS 성공 + `server: istio-envoy`까지 찍히는데 `404` | HTTPRoute가 `https-wildcard`(443) 섹션에만 붙어 있었는데, 실제 트래픽은 ALB가 TLS를 먼저 풀고 `http`(80) 섹션으로 들어옴 | HTTPRoute에 `http` 섹션 parentRef 추가 |

---

## 문제 1: NetworkPolicy 예외 누락

### 증상

- Pod는 `Running`인데 `READY 0/1`, `RESTARTS`가 계속 올라감
- kubelet 이벤트: `Startup probe failed: Get "http://<파드IP>:3000/api/health": context deadline exceeded`
- 그런데 `kubectl exec <파드> -- wget http://<파드IP>:3000/api/health`로 파드 **내부에서** 직접 찌르면 즉시 `{"status":"ok"}` 정상 응답

즉 **앱 자체는 멀쩡한데, 파드 바깥(kubelet)에서 들어오는 요청만 실패**하는 상황. 이게 핵심 단서였다.

### 진단 과정

1. 먼저 재시작 시점의 kubelet 로그가 "느려서 타임아웃"인지 "아예 안 붙는지" 구분이 안 돼서, kubelet과 똑같은 경로로 직접 테스트해보기로 함. `kubectl exec`는 **파드 자신의 네트워크 네임스페이스 안에서** 도는 거라 kubelet(노드 쪽)이 겪는 경로와 다르다.
2. `kubectl debug node/<노드이름>` 으로 노드의 네트워크 네임스페이스를 직접 빌려서(`hostNetwork`) 같은 파드 IP로 접속을 시도:
   ```bash
   kubectl debug node/<노드> -n kube-system --image=<이미 노드에 있는 이미지> -- \
     wget -T 8 -q -O- http://<파드IP>:3000/api/health
   ```
   > 참고: `dir-frontend-ns` 등 `pod-security.kubernetes.io/enforce: restricted` 네임스페이스에서는 `hostNetwork` 디버그 파드 생성 자체가 거부된다. `kube-system`(privileged) 네임스페이스에 만들어야 한다. 또 이 클러스터는 인터넷 아웃바운드가 막혀 있어서 `busybox` 같은 퍼블릭 이미지는 못 받아오고, ECR에 이미 있는 이미지(예: 방금 만든 서비스 자신의 이미지)를 재사용해야 한다.
3. 결과: `Operation timed out` — **TCP 연결 자체가 안 됨**. HTTP가 느린 게 아니라 커넥션이 아예 안 열렸다. 이건 앱 문제가 아니라 네트워크 경로/방화벽 문제라는 뜻.
4. 같은 노드의 다른 파드(`dir-frontend`)는 문제없이 잘 되고 있었으므로, 노드나 CNI 자체의 문제는 아니고 **이 워크로드에만 해당하는 무언가**로 좁혀짐.
5. `kubectl get networkpolicy -n dir-frontend-ns` 로 전체 정책 목록을 보니:
   - `namespace-default-deny-all` (podSelector 없음 = 네임스페이스 전체에 Ingress+Egress 기본 차단)
   - `dir-frontend-*` 로 시작하는 정책 10여 개가 전부 `podSelector: app.kubernetes.io/name: dir-frontend` 로 딱 그 워크로드만 겨냥
   - `dir-ai-dashboard`를 podSelector로 잡는 정책은 **하나도 없음**
6. 그중 결정적인 게 `dir-frontend-allow-ambient-probe`:
   ```yaml
   spec:
     podSelector:
       matchLabels: { app.kubernetes.io/name: dir-frontend }
     ingress:
       - from: [{ ipBlock: { cidr: 169.254.7.127/32 } }]
         ports: [{ port: 3000, protocol: TCP }]
   ```
   `169.254.7.127`은 이 클러스터의 Istio **ambient mesh**가 kubelet의 헬스체크 트래픽을 프록시(ztunnel)할 때 쓰는 link-local 소스 IP다. 즉 **ambient mesh를 쓰는 네임스페이스에서는 이 IP를 명시적으로 허용하는 NetworkPolicy가 없으면 kubelet probe 자체가 default-deny에 막힌다.**

### 해결

`dir-frontend`가 가진 정책 세트를 그대로 `dir-ai-dashboard`용으로 복제 (podSelector만 교체), 실제 이 서비스가 필요로 하는 의존성 기준으로 구성:

- `dir-ai-dashboard-allow-ambient-probe` — kubelet probe 허용 (`169.254.7.127:3000`) ← **이게 없으면 Ready 자체가 불가능**
- `dir-ai-dashboard-allow-gateway` — Istio Gateway(`dir-istio-ingress` 네임스페이스)에서 들어오는 실제 트래픽 허용
- `dir-ai-dashboard-allow-dns` — DNS(`53`) egress
- `dir-ai-dashboard-allow-otel-egress` — OTel collector(`dir-obsv-ns`, `4317`/`4318`) egress
- `dir-ai-dashboard-loki-egress` — Loki(`dir-obsv-ns`, `3100`) egress *(dir-frontend엔 없던 것 — 이 서비스가 Loki 조회 기능을 쓰기 때문에 추가)*
- `dir-ai-dashboard-postgresql-egress` — CNPG Postgres(`dir-db-ns`, `5432`) egress
- `dir-ai-dashboard-redis-egress` — Redis(`dir-db-ns`, `6379`) egress *(dir-frontend엔 없던 것 — 마찬가지로 이 서비스만의 의존성)*
- `dir-ai-dashboard-allow-public-https` — 퍼블릭 인터넷(`443`) egress, 사설 대역 제외 — AWS Bedrock API 호출용

파일: `gitops` repo `environments/prod/frontend/networkpolicy-dir-ai-dashboard.yaml`

### 다음에 새 서비스 온보딩할 때 체크리스트

`dir-frontend-ns` 같은 default-deny 네임스페이스에 새 워크로드를 넣을 때는 Deployment/Service/HTTPRoute만으로는 안 되고, 반드시:

1. 같은 네임스페이스의 기존 워크로드(`kubectl get networkpolicy -n <ns>`)가 어떤 예외를 갖고 있는지 확인
2. **ambient probe 허용 정책은 무조건 필요** (`169.254.7.127`, 앱 포트) — 이거 빼먹으면 Pod가 영원히 Ready 안 됨
3. Gateway/ingress ingress 허용
4. 그 서비스가 실제로 접근하는 다운스트림(DB, 캐시, 관측 스택, 외부 API)마다 egress 규칙 하나씩

---

## 문제 2: HTTPRoute가 실제 트래픽 경로와 다른 리스너에 붙어 있었음

### 증상

```
$ curl -sk -D - https://dashboard.dairun.site/
HTTP/2 404
server: istio-envoy
content-length: 0
```

TLS 핸드셰이크는 성공하고(`-k`로 인증서 검증만 스킵) 응답 헤더에 `server: istio-envoy`까지 찍히는데 본문 없는 `404`. Pod는 이미 `1/1 Ready`였고 Service endpoint도 정상이었다.

### 진단 과정 (여러 번 잘못 짚었던 것도 그대로 남김 — 같은 순서로 의심하면 시간 아낄 수 있음)

1. **1차 의심: Gateway 리스너 매칭 문제.** `dir-public-gateway`에 `https-root`(hostname 정확히 `dairun.site`)와 `https-wildcard`(hostname `*.dairun.site`) 두 리스너가 있는데, 처음에 HTTPRoute를 `https-root`에 잘못 붙였던 전례가 있어서 그 재발인 줄 알았다. 근데 이번엔 `sectionName: https-wildcard`가 맞게 들어가 있었음 — 아니었다.
2. `kubectl get httproute dir-ai-dashboard -n dir-frontend-ns -o yaml`로 `status.parents[].conditions`를 보니 `Accepted: True`, `ResolvedRefs: True` — Gateway API 레벨에서는 문제가 없다고 나옴. 이게 오히려 헷갈리게 만든 지점.
3. Envoy(Istio Gateway) 파드에 직접 들어가서 실제 로드된 라우트 테이블을 확인 (Envoy 이미지엔 `curl`이 없고 `pilot-agent`는 있음):
   ```bash
   kubectl exec -n dir-istio-ingress <gateway 파드> -- \
     pilot-agent request GET "config_dump?resource=dynamic_route_configs"
   ```
   → `dashboard.dairun.site`에 대한 vhost가 **정확히, 올바른 cluster로** 들어가 있었다. 라우트 자체는 문제없다는 뜻.
4. 여기서 "Envoy 설정은 맞는데 실제 요청은 그 설정을 안 타고 있다"는 쪽으로 방향을 틀었다 → **요청이 애초에 다른 리스너로 들어오고 있는 게 아닐까?**
5. `dashboard.dairun.site`와 `dairun.site`가 Route53에서 **같은 ALB**로 ALIAS돼 있는 걸 확인:
   ```bash
   aws route53 list-resource-record-sets --hosted-zone-id <zone> \
     --query "ResourceRecordSets[?Name=='dashboard.dairun.site.']"
   ```
6. 그 ALB의 리스너/타겟그룹을 직접 조회:
   ```bash
   aws elbv2 describe-listeners --load-balancer-arn <alb-arn>
   aws elbv2 describe-rules --listener-arn <443-listener-arn>
   aws elbv2 describe-target-groups --target-group-arns <tg-arn>
   ```
   - 443 리스너 규칙은 host-header 조건 없이 **default action 하나로 전부 같은 타겟그룹**으로 감 (ALB 레벨 host 라우팅은 안 함 — 그건 Istio 몫)
   - 근데 타겟그룹 프로토콜이 **`HTTP`**, 포트가 **`31466`** — 이게 Gateway Service의 `80:31466/TCP`(평문 HTTP 리스너)였다. `443:31343`(HTTPS 리스너)가 아니었음.
7. 즉: **ALB가 443에서 TLS를 자기 인증서로 직접 종료(terminate)하고, 뒷단(Envoy)에는 평문 HTTP로 80번 리스너에 넘기고 있었다.** Envoy 쪽에서 보면 이건 TLS 요청이 아니라 그냥 HTTP 요청이고, `https-wildcard`/`https-root` 리스너가 아니라 **`http` 섹션 리스너**로 들어온다. 우리 HTTPRoute는 `https-wildcard`에만 붙어 있었으니 `http` 리스너의 라우트 테이블엔 애초에 존재하지 않았던 것.
8. 확인: 잘 되고 있던 `dir-frontend-route`를 보니 `parentRefs`에 `https-root`**와** `http` 둘 다 들어가 있었다. 이게 정답 패턴이었다.
   ```bash
   kubectl get httproute dir-frontend-route -n dir-frontend-ns -o yaml
   # parentRefs: [https-root, http]  ← 둘 다
   ```

### 해결

`dir-ai-dashboard` HTTPRoute의 `parentRefs`에 `http` 섹션을 추가:

```yaml
parentRefs:
  - name: dir-public-gateway
    namespace: dir-istio-ingress
    sectionName: https-wildcard
  - name: dir-public-gateway
    namespace: dir-istio-ingress
    sectionName: http      # 추가된 부분 — ALB가 실제로 트래픽을 넘기는 곳
```

### 왜 헷갈리기 쉬운가 / 다음에 새 서비스 온보딩할 때 체크리스트

- **`kubectl get httproute ... Accepted: True`는 "이 라우트가 문법적으로 유효하다"는 뜻이지, "클라이언트가 실제로 이 경로로 도달한다"는 보장이 아니다.** Gateway API 리소스 상태만 보고 "설정 끝났다"고 판단하면 이번처럼 놓친다.
- 이 클러스터는 **ALB가 TLS를 종료하고 뒷단은 평문 HTTP**로 흐르는 구조다. 새 HTTPRoute를 만들 때 `https-*` 섹션에만 붙이면 절대 트래픽을 못 받는다. **`dir-frontend-route`처럼 `http` 섹션도 반드시 같이 붙여야 한다.**
- 이상한 점을 발견하면(`curl`은 TLS 성공 + `server: istio-envoy`인데 `404`) "Envoy까지는 도달했다"는 뜻이므로, Gateway API 리소스가 아니라 **그 앞단(ALB 리스너/타겟그룹)이 실제로 어디로 트래픽을 넘기는지**부터 확인하는 게 빠르다.

---

## 참고 — 이 과정에서 쓴 진단 명령 모음

```bash
# 파드 내부 vs 노드 관점 비교 (NetworkPolicy 문제 잡을 때 핵심)
kubectl exec <파드> -n <ns> -- wget -qO- http://<파드IP>:<포트>/health   # 파드 내부에서
kubectl debug node/<노드> -n kube-system --image=<ECR 이미지> -- \        # 노드(=kubelet) 관점에서
  wget -T 8 -qO- http://<파드IP>:<포트>/health

# 이 네임스페이스에 어떤 NetworkPolicy가 이미 있는지, 뭘 겨냥하는지 한눈에
kubectl get networkpolicy -n <ns> -o custom-columns=\
NAME:.metadata.name,PODSELECTOR:.spec.podSelector.matchLabels,TYPES:.spec.policyTypes

# Envoy(Istio Gateway)가 실제로 로드한 라우트/리스너 확인
kubectl exec -n dir-istio-ingress <gateway 파드> -- \
  pilot-agent request GET "config_dump?resource=dynamic_route_configs"
kubectl exec -n dir-istio-ingress <gateway 파드> -- \
  pilot-agent request GET "config_dump?resource=dynamic_listeners"
kubectl exec -n dir-istio-ingress <gateway 파드> -- \
  pilot-agent request GET "clusters" | grep <서비스이름>

# ALB가 실제로 어디로 트래픽을 넘기는지 (Gateway API 상태만 믿지 말 것)
aws elbv2 describe-listeners --load-balancer-arn <alb-arn>
aws elbv2 describe-rules --listener-arn <443-listener-arn>
aws elbv2 describe-target-groups --target-group-arns <tg-arn>   # Protocol/Port로 어느 k8s 리스너로 가는지 역산
```
