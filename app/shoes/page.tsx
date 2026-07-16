import { Card, Donut, PageTitle } from '@/components/UI';

const shoes = [
  ['shoe-1.jpg', '나이키 인빈서블 3', '179,000원', ['최고 쿠션', '장거리 훈련']],
  ['shoe-2.jpg', '아식스 젤-카야노 30', '169,000원', ['안정성 최고', '과내전 추천']],
  ['shoe-3.jpg', '뉴발란스 프레쉬폼 X', '160,000원', ['데일리 러닝', '발볼 넓은 러너']]
];

export default function ShoesPage() {
  return (
    <div>
      <PageTitle title="러닝화 추천 & 수명 예측" subtitle="AI가 당신의 러닝 스타일에 맞는 러닝화를 추천하고, 수명을 예측해 드려요." action={<button className="ghost-btn">러닝화 가이드</button>} />
      <div className="tab-line"><button className="active">러닝화 추천</button><button>러닝화 수명 예측</button><button>나의 러닝화 관리</button></div>
      <div className="shoes-layout">
        <Card className="quiz-card"><div className="card-head"><h2>나에게 맞는 러닝화 찾기</h2><button className="text-link">초기화</button></div><p>선호도를 선택하면 AI가 추천해드려요!</p>{[['쿠션감','단단한','푹신한',4],['안정성','낮은','높은',3],['반발력','낮은','높은',4],['접지력','낮은','높은',3],['주행 거리','단거리','장거리',4]].map(([name,left,right,value])=><div className="slider-row" key={name as string}><strong>{name}</strong><div><span>{left}</span><input type="range" min="1" max="5" defaultValue={value as number} /><span>{right}</span></div></div>)}<h3>선호 사용 환경</h3><div className="env-grid">{['로드','트레일','트랙','데일리','레이스'].map((x,i)=><button key={x} className={i===0?'selected':''}>{x}</button>)}</div><button className="primary-outline">✨ AI 추천 결과 보기</button></Card>
        <Card className="recommend-card"><div className="card-head"><h2>AI 추천 러닝화</h2><div className="segmented"><button className="active">추천순</button><button>인기순</button><button>신상품순</button></div></div><div className="shoe-products">{shoes.map((shoe, idx)=><div className="shoe-card" key={shoe[1] as string}><span className={`reco-badge b${idx}`}>추천 {idx+1}</span><img src={`/assets/${shoe[0]}`} alt="" /><h3>{shoe[1]}</h3><b>{shoe[2]}</b><div>{(shoe[3] as string[]).map(tag=><span key={tag}>{tag}</span>)}</div><button>상세 보기</button><button className="heart">♡</button></div>)}</div><h2 className="section-title small">인기 추천 러닝화</h2><div className="popular-shoes">{['아디다스 울트라부스트 5','호카 클리프톤 9','브룩스 고스트 15','SALOMON 펄사 5'].map((name,i)=><div key={name}><img src={`/assets/shoe-${(i%3)+1}.jpg`} alt="" /><strong>{name}</strong><span>{[189,159,159,199][i]},000원</span></div>)}<button className="more-box">더 많은 추천 러닝화 보기 →</button></div></Card>
        <Card className="life-card"><h2>러닝화 수명 예측</h2><p>내 러닝화의 수명을 예측해 보세요.</p><label>신발 사진 업로드</label><div className="upload-box">📷<span>신발 사진을 업로드하세요<br />정면 또는 측면 사진 권장</span></div><label>구매일</label><input value="2024-03-10" readOnly /><label>누적 사용 거리</label><input value="620 km" readOnly /><div className="life-result"><h3>수명 예측 결과</h3><Donut value={62} label="62%" /><div><p>남은 수명 <b>62%</b></p><p>예상 교체 시기 <b>2025년 07월</b></p><p>예상 잔여 거리 <b>약 210km</b></p></div></div><button className="primary-btn full-width">수명 리포트 자세히 보기</button></Card>
      </div>
      <Card className="ai-tip-strip">✨ <b>AI 러닝화 추천 팁</b> 사용자의 러닝 기록, 선호도, 체형 데이터를 종합 분석하여 최적의 러닝화를 추천해드립니다.</Card>
    </div>
  );
}
