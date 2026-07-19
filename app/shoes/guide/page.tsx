import Link from 'next/link';
import { Card, PageTitle } from '@/components/UI';

type GuideCategory = { name: string; desc: string };
type GuideGroup = { name: string; desc: string; categories: GuideCategory[] };

const GROUPS: GuideGroup[] = [
  {
    name: '데일리 러닝화',
    desc: '매일 부담 없이 편안하게 달릴 수 있는 기본 러닝화',
    categories: [
      { name: '입문화', desc: '달리기를 처음 시작하는 초보 러너에게 부담 없는 기본템이에요.' },
      { name: '맥스쿠션화', desc: '두툼하고 부드러운 쿠션감으로 편안한 착화감을 제공해요.' },
      { name: '안정화', desc: '회내·평발·아치무너짐·발목불안정 등을 보정해주는 기능성 모델이에요.' },
      { name: '올라운더', desc: '전반적인 기능이 고루 상향 평준화된 다재다능 모델이에요.' },
      { name: '경량 트레이너', desc: '가볍고 반발력이 좋아 인터벌 러닝 등 훈련에 적합해요.' }
    ]
  },
  {
    name: '슈퍼 트레이너',
    desc: '조깅부터 대회까지, 모든 종류의 달리기를 우월한 성능과 함께',
    categories: [
      { name: '논 플레이트', desc: '플레이트 없이도 브랜드별 최고급 미드솔 기술이 적용된 상위 모델이에요.' },
      { name: '라이트 플레이트', desc: '유리섬유·나일론 등 가벼운 플레이트로 반발력을 더한 모델이에요.' },
      { name: '카본 플레이트', desc: '카본으로 강력한 반발력을 제공하며 데일리부터 레이싱까지 소화해요.' }
    ]
  },
  {
    name: '레이싱 러닝화',
    desc: '목표 레이스를 위해 최상의 선택',
    categories: [
      { name: '중거리 (5~21.1km)', desc: '속도를 극대화하기 위해 가볍고 반응성이 뛰어난 레이싱화예요.' },
      { name: '장거리 (10~42.2km)', desc: '브랜드별 최고 성능과 기술력이 집약된 플래그십 레이싱화예요.' }
    ]
  }
];

const FAQ = [
  {
    q: '입문 러너에게 어떤 러닝화가 좋나요?',
    a: '데일리 그룹의 입문화·맥스쿠션화·안정화 카테고리에서 시작하는 것을 권장해요. 부담 없는 가격대와 부드러운 착화감으로 부상 위험이 낮아요.'
  },
  {
    q: '카본 플레이트 러닝화는 누구에게 필요한가요?',
    a: '레이스 페이스를 노리는 중·상급 러너에게 적합해요. 슈퍼 트레이너 카본 또는 레이싱 카테고리에서 선택할 수 있고, 충분히 빠른 페이스(보통 5분/km 이하)에서 반발력 효과가 극대화돼요.'
  },
  {
    q: '풀마라톤 레이싱화는 어떤 걸 골라야 하나요?',
    a: '레이싱 그룹의 장거리 카테고리에 속한 모델들이 풀마라톤(42.195km)에 최적화돼 있어요. 각 브랜드의 플래그십 카본 플레이트 모델이 여기에 해당해요.'
  },
  {
    q: '평발·회내(과내전)에는 어떤 러닝화를 신어야 하나요?',
    a: '데일리 그룹의 안정화 카테고리를 추천해요. 아치를 받쳐주고 발목 안정성을 잡아주는 구조가 들어 있어요.'
  }
];

export default function ShoesGuidePage() {
  return (
    <div>
      <PageTitle
        title="러닝화 가이드"
        subtitle="용도와 기술 수준에 따라 러닝화를 데일리 · 슈퍼 트레이너 · 레이싱 세 그룹으로 나눠서 안내해드려요."
        action={
          <Link href="/shoes" className="ghost-btn">
            ← 러닝화 추천으로
          </Link>
        }
      />

      {GROUPS.map((group) => (
        <Card key={group.name} className="shoe-guide-group">
          <div className="card-head">
            <h2>{group.name}</h2>
          </div>
          <p className="muted">{group.desc}</p>
          <div className="shoe-guide-category-grid">
            {group.categories.map((c) => (
              <div key={c.name} className="shoe-guide-category">
                <strong>{c.name}</strong>
                <p>{c.desc}</p>
              </div>
            ))}
          </div>
        </Card>
      ))}

      <Card className="shoe-guide-faq">
        <div className="card-head">
          <h2>자주 묻는 질문</h2>
        </div>
        <div className="shoe-guide-faq-list">
          {FAQ.map((item) => (
            <div key={item.q} className="shoe-guide-faq-item">
              <strong>Q. {item.q}</strong>
              <p>{item.a}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
