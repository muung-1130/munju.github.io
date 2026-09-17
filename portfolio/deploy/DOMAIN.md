# kimmunju.cloud 배포 설정

사이트 파일은 준비됐으며 실제 GitHub/DNS 변경은 아직 수행하지 않았습니다.

1. 정확한 배포 저장소를 확인합니다. 현재 접근 가능한 저장소는 `muung-1130/munju.github.io`이며 `muung-1130/munju.io`는 API에서 404가 반환되었습니다.
2. 기존 `dai-run` 아카이브를 보존하면서 `portfolio` 소스를 추가합니다. `dist`는 빌드 산출물로 커밋하지 않아도 됩니다.
3. 이 폴더의 `github-pages.yml`을 저장소의 `.github/workflows/portfolio-pages.yml`로 배치합니다.
4. 저장소 Settings → Pages → Source를 GitHub Actions로 설정합니다.
5. Pages의 Custom domain에 `kimmunju.cloud`를 설정합니다. Actions 배포에서는 CNAME 파일만으로 이 설정을 대신할 수 없습니다.
6. DNS 관리자에서 아래 레코드를 설정합니다. 기존 레코드를 먼저 확인하고 홈페이지에 해당하는 항목만 조정합니다.

| 유형 | 이름 | 값 |
|---|---|---|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | muung-1130.github.io |

7. Pages DNS 검사와 인증서 발급 상태를 확인하고 Enforce HTTPS를 활성화합니다. 전파와 인증서 준비에는 시간이 필요할 수 있습니다.
8. 실제 도메인에서 메인, `/projects/dai-run/`, 스타일 및 링크를 확인합니다.

근거: [GitHub 공식 커스텀 도메인 안내](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site), [Pages 워크플로 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
