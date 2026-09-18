# MUNJU Portfolio

Pinterest 참고 GIF의 폴더 윤곽, 여백, 비대칭 배열을 재해석한 정적 포트폴리오. 원본 GIF 자체를 복제하거나 사이트 자산으로 포함하지 않았습니다.

## 실행

Node.js에서 `npm run build` 후 `npm start`. 미리보기는 http://127.0.0.1:4173 입니다. 외부 npm 패키지는 필요 없습니다. 폰트는 Google Fonts를 사용하며 연결이 없어도 시스템 폰트로 표시됩니다.

## 페이지

- `/`: 파일 4개가 꽂히는 3.3초 인트로 후 Cover 파일을 표시. Cover / Projects / Toolkit / Contact 인덱스 탭으로 화면을 전환합니다. 전체 화면은 고정하고 긴 콘텐츠만 파일 안에서 스크롤합니다.
- `/projects/dai-run/`: 팀 프로젝트 개요, 개인 역할, 배포 흐름, 작업 기록
- `/projects/linux-fileserver/`: NFS 개인 기여, 팀 파일서버 구성, 원본 draw.io
- `/projects/camping/`: CampUs 데이터 통합·모델링·파티셔닝 검증
- `/projects/docker-camping/`: Harbor·Actions·Swarm, 운영 점검, 영상과 배경음 A/B, 팀 앱 화면 PDF

Docker 캠핑 화면은 제출 소스를 기반으로 목데이터를 연결한 포트폴리오 데모입니다. 1280×900 규격의 9컷이며 예측 분석은 2컷으로 나눴습니다. 리뷰 차트는 제출 산출물이고 데모·예측 예시 표기를 유지합니다. 실제 DB는 실행하지 않습니다. 원본 소스·환경 파일·담당 업무 PDF는 게시하지 않고 검토한 증빙만 build.mjs의 명시적 목록으로 복사합니다. 페이지용 합성 배경음은 Web Audio로 생성하며 원본 MP4를 변경하지 않습니다.

인트로는 건너뛰기/Escape/다시 보기를 지원하며, 동작 줄이기 설정에서는 생략됩니다. 탭은 방향키와 Home/End로 이동할 수 있고 URL 해시 및 뒤로 가기를 지원합니다. `#work` 같은 직접 링크는 인트로 없이 해당 파일을 엽니다. JavaScript를 사용할 수 없을 때는 기존 문서 레이아웃으로 내용을 읽을 수 있습니다.

## 배포

`dist` 폴더가 배포 산출물입니다. GitHub Pages 등 정적 호스팅에 올릴 수 있습니다. 모든 내부 경로는 상대 경로입니다. GitHub 저장소의 기존 `dai-run` 아카이브를 보존하고 사이트 파일만 병합해야 합니다.

도메인은 `kimmunju.cloud`이며 `CNAME` 파일에 반영했습니다. 배포 대상 저장소 확인 및 DNS/Pages 설정은 별도로 필요합니다. CNAME 파일 작성만으로 실제 도메인 연결이 완료되는 것은 아닙니다.

## 콘텐츠 확장

프로젝트 추가 시 `projects/<slug>/index.html`을 만들고 메인 프로젝트 영역에 `data-project="personal"` 또는 `data-project="team"` 카드 링크를 추가합니다. 필터 숫자와 전체 개수를 함께 갱신하고 build.mjs의 files 목록에 새 페이지를 추가합니다. 개인 프로젝트의 빈 상태는 실제 작업이 추가되기 전까지 사용합니다.

콘텐츠는 저장소 코드 및 작업 요약을 바탕으로 작성했습니다. 확인되지 않은 팀 규모, 정량 성과, 연락처, 서비스 운영 상태는 기재하지 않았습니다.
# Paw-Data 추가 (2026-09-17)

- 협업 프로젝트 `Paw-Data` / Python × React. 목록의 다섯 번째 민트색 폴더.
- 상세 경로: `/projects/paw-data/`. 공통 스타일과 이미지 확대 컴포넌트 재사용.
- 개인 React 기여, 팀 API·DB 작업, 후속 HTML 원고, 향후 계획 구분. 기술 표는 details로 제공.
- GitHub `muung-1130/pet-map` master의 React 소스를 로컬 재현한 1280×900 화면 3컷 및 PDF.
- 운영 API 미연결. 내장 예시 데이터 사용. 캡처용 복사본의 라벨·높이·경계 배경을 정리하고 위험도 판정을 숨김.
- `Paw_Data_Portfolio.html`은 확인한 첨부 위치에서 찾지 못했으므로 사용하지 않음.
- 원본 Python 파일·환경 파일·작업 지침·소스 ZIP은 빌드 목록에 포함하지 않음.
- 검사 기록: `../audit/paw-data/REVIEW.md`.

## etcd 개인 프로젝트
/projects/etcd-recovery/ — etcd 백업·복구 개인 실습. 버터색 폴더, 실행 이미지 7장, 트러블슈팅 6건과 개념 설명 흐름. 협업 5 / 개인 1 / 전체 6. 기존 프로젝트 및 원본 첨부 파일 유지. Pod 강의 캡처는 증빙에 사용하지 않음. 문서 내 장애·삭제·복원 명령은 실행하지 않음.

## Newdrops 추가

- `/projects/newdrops/`: 26.05.21~26.06.17, 협업 프로젝트 6번째. 파스텔 라임 폴더와 상세 페이지.
- 개인 인프라·CI/CD·Windows Harbor 구축 중심. 제출 Jenkinsfile의 순차 빌드·비차단 검사를 실제 구현으로 구분.
- 제출 ZIP의 CI/CD·인프라 원본 draw.io 2종과 별도 SVG 요약도, 화면 7컷 PDF. 화면은 로컬 예시 데이터이며 실제 운영 결과가 아님.
- 원본 PDF·인증 정보·전체 소스는 배포 대상에 포함하지 않음.

## DAI RUN 최종 자료 반영 (2026-09-18)

- Docker 데이터 모델링·AI, Kubernetes Jenkins/Argo CD, AWS GitLab/Argo Rollouts/ZAP로 담당 범위를 구분했습니다.
- `Delta_설계도.drawio`의 Docker, k8s, AWS, AI 설계도의 복사본 탭을 개별 원본 draw.io와 SVG로 수록했습니다. AI 대표 이미지는 사용자 제공 구성도입니다.
- dairun.site의 공개 서비스 7컷과 AWS 발표의 로그인 챗봇 시연 2컷을 9페이지 PDF에 수록했습니다. 발표 당시 데이터와 현재 공개 접속 결과를 구분합니다.
- 챗봇 DB 우선 응답/Bedrock RAG 분기, PostGIS 주변 코스 조회, AWS 날씨 수집의 Lambda-DynamoDB-PostgreSQL 전환을 최종 소스로 확인했습니다.
- Kubernetes 발표의 Jenkins #22와 Argo CD Healthy/Synced 이미지를 CI/CD 증빙으로 추가했습니다.
- 원본 ZIP/PPTX, 운영 연결정보, 개발 소스는 포트폴리오 자산으로 복사하지 않았습니다. 현재 운영 AWS 설정 자체를 변경하거나 재검증하지 않았습니다.

## 채용 담당자 중심 정보 구조 개편

개편 전 기준 커밋: `340c08a` (직전 콘텐츠 `028b855`).

- Cover: 시스템·인프라 지원 방향과 배포 / 연결·권한 / 복구 역량을 먼저 안내합니다.
- Projects: DAI RUN·NFS·etcd를 대표 사례로, 나머지 4개를 확장 경험으로 구분합니다. 7개 프로젝트와 협업/개인 필터, 스크롤 기억·팝업 선택은 유지합니다.
- Toolkit: 핵심 4영역을 먼저 보여주고 기존 12분야·카드/목록 비교는 전체 목록 펼침에 보존합니다.
- DAI RUN: 개인 역할, GitLab 흐름, 대표 문제 해결 2건, 실제 증빙을 본문에 배치합니다. AI 기여는 별도 요약하며 기존 구성도·PDF·트러블슈팅은 상세 펼침에서 확인합니다.
- `focus.css`는 개편 화면의 배치만 조정합니다. 다른 프로젝트 상세와 원본 증빙 파일은 유지합니다.
