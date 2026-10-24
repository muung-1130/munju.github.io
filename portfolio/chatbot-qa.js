export const topics = [
    {label:'30초 소개', points:['지원 분야 · 신입 클라우드 시스템 엔지니어','핵심 경험 · AWS 이전 / CI/CD / Linux 공유 권한 / Kubernetes 복구','자격 · CKA 보유 (2026.10.18 취득)'], text:'Linux 서버 구축에서 AWS 이전·배포 자동화까지 경험했습니다. 대표 사례는 DAI-RUN입니다.', links:[['대표 프로젝트 · DAI-RUN','projects/dai-run/'],['기술 전체 보기','index.html#stack']]},
    {label:'CI/CD 경험', points:['Kubernetes 단계 · Jenkins + Argo CD','AWS 단계 · GitLab CI/CD + Argo CD + Argo Rollouts','보안 점검 · OWASP ZAP 적용'], text:'DAI-RUN에서는 Kubernetes 단계의 Jenkins·Argo CD, AWS 단계의 GitLab CI/CD·Argo CD 배포 구성을 담당했습니다. Argo Rollouts와 OWASP ZAP 적용 내용도 확인할 수 있습니다. Newdrops는 Kubernetes 인프라·Jenkins·Windows 환경의 Harbor 구축 경험입니다.', links:[['DAI-RUN 구축 과정','projects/dai-run/'],['Newdrops CI/CD','projects/newdrops/']]},
    {label:'개인 기여·협업', points:['개인 담당 · NFS 서버·권한, React 화면·API 연동, 단계별 CI/CD','공동 참여 · 데이터 조사·통합, 정규화·DB 구축','팀 산출물 · 서비스 전체 개발과 전체 인프라 구성은 개인 담당과 구분'], text:'DAI-RUN은 데이터 모델링·AI 챗봇·단계별 CI/CD와 AWS 이전, NFS는 파일 공유 서버와 접근 권한 구성이 개인 담당입니다. CampUs는 요구사항·모델링, Paw-Data는 자료 조사·DB 작업 참여와 React·API 연동을 맡았습니다. 서비스 전체 개발과 팀 공통 구성은 개인 기여와 구분해 소개합니다.', links:[['DAI-RUN 개인 기여','projects/dai-run/'],['NFS 담당 내용','projects/linux-fileserver/'],['Paw-Data 담당 내용','projects/paw-data/']]},
    {label:'문제 해결 경험', points:['문제 · 화면은 표시되지만 더미 데이터가 노출','조치 · API 주소와 전달 경로를 확인하고 환경변수로 수정','확인 · 강남구 의료시설 표시값을 실데이터 251건으로 대조'], text:'Paw-Data에서는 하드코딩된 API 주소로 더미 데이터가 표시되는 문제를 확인하고 환경변수 기반 연결로 수정했습니다. etcd 개인 실습에서는 백업·복구 후 노드와 제어부 상태를 점검했습니다. 상세 페이지에서 조치 과정과 증빙을 확인해 주세요.', links:[['API 연동 문제 해결','projects/paw-data/'],['etcd 백업·복구 실습','projects/etcd-recovery/']]},
    {label:'추천 열람 순서', points:['1. DAI-RUN · AWS 이전과 GitOps 배포','2. NFS · Linux 공유 경로·계정·접근 권한','3. etcd · 스냅샷 복원과 상태 검증 (개인 실습)'], text:'배포 자동화는 DAI-RUN, Linux 권한 관리는 NFS, 클러스터 복구는 etcd를 추천합니다. 데이터베이스 설계·서비스 연동·컨테이너 배포 경험은 나머지 협업 프로젝트에서 볼 수 있습니다.', links:[['전체 프로젝트','index.html#work'],['데이터베이스 · CampUs','projects/camping/'],['Docker · 낭만노숙','projects/docker-camping/']]},
    {label:'기술 활용 범위', text:'도구 이름보다 실제 수행한 작업을 기준으로 기술을 정리했습니다. 아래 경험은 프로젝트·실습 범위이며, 기업 재직 경력과 구분합니다.', points:['구축·적용 · Linux, Docker, Kubernetes, Jenkins, GitLab CI/CD, Argo CD, Harbor','설계·공동 구축 · SQL·ERD, MariaDB·MongoDB, Python 데이터 처리','구현·연동 · React, REST API, FastAPI 기반 AI 챗봇'], links:[['역할별 기술과 담당 범위','index.html#stack']]},
    {label:'기간·프로젝트 구분', text:'협업 프로젝트 6개와 etcd 개인 실습 1개를 정리했습니다. 기간은 프로젝트 수행 기간이며 재직 기간이 아닙니다.', points:['NFS 26.02.26~03.25 · CampUs 26.03.26~04.13','Paw-Data 26.04.14~04.24 · 낭만노숙 26.04.27~05.15','Newdrops 26.05.21~06.17 · DAI-RUN 26.07~08','etcd 백업·복구 · 26.05 개인 실습'], links:[['전체 프로젝트와 기간','index.html#work']]},
    {label:'CKA·증빙 자료', text:'Certified Kubernetes Administrator(CKA)를 보유하고 있습니다. 자격증에 기재된 취득일은 2026년 10월 18일입니다. 원본 자격증 PDF와 프로젝트별 구성도·작업 화면을 확인할 수 있습니다. 서비스 재현 화면과 실습 결과는 각 페이지의 설명에 구분해 두었습니다.', links:[['CKA 자격증 PDF ↗','assets/certificates/munju-kim-cka.pdf'],['Kubernetes 복구 실습','projects/etcd-recovery/'],['DAI-RUN 구성도·작업 증빙','projects/dai-run/']]},
    {label:'연락하기', text:'프로젝트와 채용에 관한 연락은 k22qqaa@gmail.com으로 부탁드립니다. 이메일에 회사명·모집 직무·회신 방법을 적어주시면 좋습니다. 입사 가능일과 근무 조건은 직접 문의해 주세요.', links:[['이메일 보내기','mailto:k22qqaa@gmail.com'],['Contact 보기','index.html#contact']]}
  ];

// Curated answers and explicit aliases: no fabricated training history or generative replies.
const aliases = [
 ['자기소개','소개해','누구','신입','경력','지원분야','지원직무','강점','장점','채용해야','뽑아야','어떤사람'],
 ['cicd','배포','자동화','젠킨스','jenkins','깃랩','gitlab','argocd','아르고','gitops','rollout','zap'],
 ['담당','역할','기여','협업','팀워크','직접','본인','혼자','팀프로젝트'],
 ['트러블슈팅','문제해결','오류','에러','장애','어려웠','어려운','실패','해결','디버깅'],
 ['추천','먼저','대표프로젝트','볼까요','어디부터','열람'],
 ['기술스택','사용기술','다룰','할줄','숙련','리눅스','linux','도커','docker','파이썬','python','react','fastapi'],
 ['기간','언제','몇개','프로젝트수','시작일','종료일'],
 ['cka','자격','취득','인증','증빙','certificate'],
 ['연락','이메일','메일','email','면접','연락처']
];
topics.forEach((topic,index)=>topic.keys=aliases[index]);
function entry(label,keys,text,path,points){const item={label,keys,text,links:path ? [['관련 프로젝트와 증빙 보기',path]] : [],points};topics.push(item);return item;}
const projects=[
 entry('DAI-RUN에서 맡은 일',['데이런','dairun'], 'Docker에서 데이터 모델링·AI 챗봇을 작업하고, Kubernetes에서는 Jenkins + Argo CD CI/CD를, AWS 이전 단계에서는 GitLab CI/CD + Argo CD·Argo Rollouts·OWASP ZAP 구성을 담당했습니다. 서비스 전체 개발과 구분한 개인 담당 범위입니다.','projects/dai-run/',['Docker · 마라톤 코스·일정 정형 데이터, ERD와 개념·논리·물리 모델링','Kubernetes · Jenkins와 Argo CD 배포 연결','AWS · Kubernetes 환경 이전과 GitLab 기반 배포 흐름 구성']),
 entry('Newdrops 인프라·CI/CD',['newdrops','뉴드롭','뉴드랍'], '협업 프로젝트에서 인프라와 CI/CD, Windows 환경의 Harbor 설치를 담당했습니다. Jenkins와 Kubernetes 배포 구성, 조사 기록과 구성도는 상세 페이지에서 확인할 수 있습니다.','projects/newdrops/'),
 entry('NFS 파일 공유와 접근 권한',['nfs','파일서버','파일공유','공유폴더','uid','gid','acl'], 'Linux NFS 서버와 클라이언트의 공유 경로를 연결하고 UID/GID·ACL을 기반으로 접근 권한을 구성했습니다. 연결 문제와 권한 문제를 나누어 확인한 작업을 정리했습니다.','projects/linux-fileserver/'),
 entry('etcd 백업·복구 실습',['etcd','백업','복원','복구','스냅샷'], 'etcd 스냅샷을 통한 백업·복구를 개인 실습으로 수행했습니다. 복원 이후 멤버 구성과 노드·제어부 상태를 함께 점검했습니다. 기업 운영 환경의 장애 대응 경력과는 구분되는 실습 경험입니다.','projects/etcd-recovery/'),
 entry('Paw-Data 데이터·화면 연동',['pawdata','paw','포데이터','동물','더미','251'], '자료 조사·DB 작업에 참여하고 React 화면과 API 연동을 담당했습니다. 하드코딩된 API 주소 때문에 더미 데이터가 보이는 문제를 환경변수 기반 연결로 수정하고, 강남구 의료시설 실데이터 251건과 표시값을 대조했습니다.','projects/paw-data/'),
 entry('CampUs 데이터베이스 설계',['campus','캠퍼스','캠프어스'], '요구사항과 데이터 모델링 작업을 맡았습니다. 데이터베이스 설계와 조회 관련 작업 자료는 프로젝트 상세 페이지에서 확인할 수 있습니다.','projects/camping/'),
 entry('낭만노숙 컨테이너 프로젝트',['낭만노숙','낭만','노숙'], '캠핑 서비스를 주제로 한 Docker 기반 협업 프로젝트입니다. 구성도, 서비스 화면, 컨테이너 배포 자료를 정리했습니다. 구체적인 개인 기여는 상세 페이지의 담당 내용과 함께 확인해 주세요.','projects/docker-camping/')
];
const ai=entry('러닝 AI 챗봇은 어떻게 구성했나요?',['챗봇','rag','llm','bedrock','러닝코스','날씨','인공지능'], 'DAI-RUN 챗봇은 러닝 사이트·SNS에서 수집한 코스 자료와 사용자 위치를 바탕으로 코스를 추천하고, Kafka로 저장되는 날씨 정보와 러닝·부상 관련 RAG 자료를 활용하도록 구성했습니다. Docker 단계의 AI 챗봇 작업을 담당했습니다. 공개 비로그인 화면에서 날씨 조회가 되지 않았던 확인 결과도 구분해 두었습니다.','projects/dai-run/#ai');
const aws=entry('AWS 이전과 배포 자동화',['aws','클라우드','eks','ecr','아마존'], 'DAI-RUN은 Docker와 Kubernetes 환경에서 테스트한 뒤 AWS 환경으로 이전하는 과정입니다. AWS 단계에서는 Kubernetes 환경 이전과 GitLab CI/CD·Argo CD·Argo Rollouts·OWASP ZAP 작업을 담당했습니다. 구성도와 실제 작업 기록에서 범위를 확인할 수 있습니다.','projects/dai-run/');
const kube=entry('Kubernetes 경험과 검증',['쿠버','kubernetes','k8s'], '협업 프로젝트에서는 Kubernetes 인프라와 CI/CD를 구성했고, 개인 실습에서는 etcd 백업·복구 후 상태를 점검했습니다. CKA 자격증도 보유하고 있습니다. 실습 경험과 자격 증빙을 함께 확인하실 수 있습니다.','projects/etcd-recovery/');
const harbor=entry('Harbor는 어디서 사용했나요?',['harbor','하버','레지스트리','윈도우','windows'], 'Newdrops에서 Windows 환경에 Harbor를 설치하는 역할을 맡았습니다. 인프라·CI/CD 구성과 설치 조사 기록을 함께 정리했습니다.','projects/newdrops/');
const learning=entry('작업하면서 배운 점',['배운','배웠','개선','성장','회고','아쉬운'], 'DAI-RUN에서는 CI Job 성공만으로 배포 완료를 판단하지 않고 Argo CD 동기화, 워크로드 Ready 상태와 실제 HTTP 응답까지 확인하는 관점을 정리했습니다. 배포 전후 검증과 자동 rollback 조건 명시는 다음 개선 과제로 구분했습니다.','projects/dai-run/#learning');
const privateAnswer={label:'직접 확인이 필요한 내용이에요',text:'입사 가능일·희망 연봉·근무 조건, 학력·이전 재직 이력 등은 이 안내에 확인된 정보가 없습니다. 임의로 답변하지 않고 이메일 문의로 안내드릴게요.',links:[['김문주에게 문의하기','mailto:k22qqaa@gmail.com']]};
const normalize=text=>text.normalize('NFKC').toLowerCase().replace(/[^a-z0-9가-힣]/g,'');
export function searchQuestions(question){
 const q=normalize(question);
 if(!q)return [];
 if(['연봉','급여','입사가능','출근가능','언제입사','근무지','거주','주소','나이','생년','학력','대학교','졸업','전직장','재직','전화번호','휴대폰','비밀번호'].some(key=>q.includes(key)))return [privateAnswer];
 if(/^(안녕|안녕하세요|반가워|hello|hi|고마워|감사합니다)$/.test(q))return [topics[0]];
 const projectMatches=projects.filter(p=>p.keys.some(key=>q.includes(normalize(key))));
 // A named project takes priority over generic technology hits, avoiding cross-project claims.
 if(projectMatches.length){
   if(projectMatches.length===1 && projectMatches[0]===projects[0]){
     if(ai.keys.some(k=>q.includes(normalize(k))))return [ai,projects[0]];
     if(aliases[1].some(k=>q.includes(normalize(k))))return [projects[0],topics[1]];
     if(learning.keys.some(k=>q.includes(normalize(k))))return [learning,projects[0]];
   }
   return [...projectMatches,...(aliases[6].some(k=>q.includes(normalize(k)))?[topics[6]]:[])];
 }
 return topics.map((topic,index)=>({topic,index,score:topic.keys.reduce((sum,key)=>sum+(q.includes(normalize(key))?Math.min(normalize(key).length,7):0),0)}))
   .filter(r=>r.score>=2).sort((a,b)=>b.score-a.score || a.index-b.index).slice(0,4).map(r=>r.topic);
}
