'use client';

type OutsoleScore = {
  heel_outer: number;
  heel_inner: number;
  forefoot_outer: number;
  forefoot_inner: number;
  outsole_loss: number;
  toe_tip_damage: number;
  outsole_crack: number;
};
type SideScore = { midsole_compression: number; deep_creasing: number; sole_separation: number };
type HeelScore = { left_deformation: number; right_deformation: number };

export type WearAnalysisResponse = {
  status: 'COMPLETED' | 'RETAKE_REQUIRED' | 'SAFETY_BLOCKED' | 'ANALYSIS_REJECTED';
  message?: string;
  required_retake_views?: string[];
  analysis_id?: string;
  storage?: { image_keys?: Record<string, string> };
  wear_analysis?: {
    overall_wear_level: number;
    confidence: number;
    observations: string[];
    quality_reason?: string;
    asymmetry_level?: number;
    crack_detected?: boolean;
    structural_damage_detected?: boolean;
    left_outsole?: OutsoleScore;
    right_outsole?: OutsoleScore;
    heel_view?: HeelScore;
    left_side?: SideScore;
    right_side?: SideScore;
  };
  life_estimation?: {
    condition: string;
    estimated_remaining_life_percent: { min: number; max: number };
    estimated_remaining_days: { min: number; max: number };
    estimated_remaining_distance_km: { min: number; max: number } | null;
    estimation_confidence: { level: string; percent: number };
    purchase_information?: { elapsed_months: number };
    calculation_evidence?: Record<string, string | number | null>;
    cautions: string[];
    notice: string;
  };
};

type Role = 'left_outsole' | 'right_outsole' | 'heels' | 'left_side' | 'right_side';
const ROLE_ORDER: Role[] = ['left_outsole', 'right_outsole', 'heels', 'left_side', 'right_side'];
const ROLE_LABELS: Record<Role, string> = {
  left_outsole: '왼쪽 밑창 전체',
  right_outsole: '오른쪽 밑창 전체',
  heels: '양쪽 뒤꿈치 정면',
  left_side: '왼쪽 바깥쪽 측면',
  right_side: '오른쪽 바깥쪽 측면'
};
// heels 사진의 점수는 wear_analysis.heel_view 키에 들어있어서 role 이름과 다르다.
const ROLE_SCORE_KEY: Record<Role, 'left_outsole' | 'right_outsole' | 'heel_view' | 'left_side' | 'right_side'> = {
  left_outsole: 'left_outsole',
  right_outsole: 'right_outsole',
  heels: 'heel_view',
  left_side: 'left_side',
  right_side: 'right_side'
};

const OUTSOLE_LABELS: Record<keyof OutsoleScore, string> = {
  heel_outer: '뒤꿈치 바깥쪽',
  heel_inner: '뒤꿈치 안쪽',
  forefoot_outer: '앞꿈치 바깥쪽',
  forefoot_inner: '앞꿈치 안쪽',
  outsole_loss: '고무 손실',
  toe_tip_damage: '발끝단 손상',
  outsole_crack: '균열'
};
const SIDE_LABELS: Record<keyof SideScore, string> = {
  midsole_compression: '미드솔 압축',
  deep_creasing: '깊은 주름',
  sole_separation: '접착 분리'
};
const HEEL_LABELS: Record<keyof HeelScore, string> = {
  left_deformation: '왼쪽 변형',
  right_deformation: '오른쪽 변형'
};
const SUB_LABELS: Record<Role, Record<string, string>> = {
  left_outsole: OUTSOLE_LABELS,
  right_outsole: OUTSOLE_LABELS,
  heels: HEEL_LABELS,
  left_side: SIDE_LABELS,
  right_side: SIDE_LABELS
};

const EVIDENCE_LABELS: Record<string, string> = {
  recorded_run_count: '완료 러닝 기록 수',
  recorded_total_distance_km: 'DB 기록 누적거리(km)',
  recent_weekly_distance_km: '최근 주간 평균거리(km)',
  estimated_total_distance_km: '수명 계산 적용 거리(km)'
};
// '구매 후 경과'/'추정 잔여 수명 비율'/'거리 기준 잔여 주행거리(km)'는 위에서 이미 전용 카드로
// (purchase_information, range, estimated_remaining_distance_km) 따로 보여주고 있어서 제외한다.
const EVIDENCE_VISIBLE_KEYS = new Set([
  '신발 분류',
  '사진 기반 마모 단계',
  '사진 분석 신뢰도',
  '왼쪽 앞쪽 끝단 손상',
  '오른쪽 앞쪽 끝단 손상',
  '왼쪽 밑창 균열',
  '오른쪽 밑창 균열',
  '구조 손상 감지',
  'recorded_run_count',
  'recorded_total_distance_km',
  'recent_weekly_distance_km',
  'estimated_total_distance_km'
]);

function scoreLevel(value: number): 'low' | 'mid' | 'high' {
  if (value <= 1) return 'low';
  if (value <= 3) return 'mid';
  return 'high';
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;
}

function formatKoreanDate(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

// "유통기한"처럼 지금 시점 기준으로 언제까지 신을 수 있는지를 날짜로 계산한다.
function untilDateLabel(minDays: number, maxDays: number): string {
  const now = Date.now();
  const minDate = formatKoreanDate(new Date(now + minDays * 86400000));
  if (minDays === maxDays) return `${minDate}까지`;
  const maxDate = formatKoreanDate(new Date(now + maxDays * 86400000));
  return `${minDate} ~ ${maxDate}`;
}

function RoleBar({ role, value }: { role: Role; value: number | null }) {
  if (value === null) return null;
  return (
    <div className="wear-role-bar-row">
      <span className="wear-role-bar-label">{ROLE_LABELS[role]}</span>
      <div className="wear-role-bar-track">
        <div className={`wear-role-bar-fill level-${scoreLevel(value)}`} style={{ width: `${(value / 5) * 100}%` }} />
      </div>
      <span className="wear-role-bar-value">{value}/5</span>
    </div>
  );
}

function PhotoAnalysisCard({
  role,
  score,
  subScores,
  description,
  photoUrl
}: {
  role: Role;
  score: number | null;
  subScores: [string, number][];
  description: string | null;
  photoUrl: string | null;
}) {
  return (
    <div className="wear-photo-card">
      <div className="wear-photo-frame">
        {photoUrl ? <img src={photoUrl} alt={ROLE_LABELS[role]} /> : <div className="wear-photo-placeholder">사진 없음</div>}
      </div>
      <h4>{ROLE_LABELS[role]}</h4>
      {score !== null && (
        <div className={`wear-photo-score level-${scoreLevel(score)}`}>
          마모 점수 <strong>{score}</strong> / 5
        </div>
      )}
      {subScores.length > 0 && (
        <div className="wear-photo-subscores">
          {subScores.map(([label, value]) => (
            <span key={label} className={`wear-photo-subscore level-${scoreLevel(value)}`}>
              {label} {value}
            </span>
          ))}
        </div>
      )}
      {description && <p className="wear-photo-description">{description}</p>}
    </div>
  );
}

export function WearAnalysisResultView({ result, userShoeId }: { result: WearAnalysisResponse; userShoeId: string }) {
  if (result.status === 'COMPLETED' && result.wear_analysis && result.life_estimation) {
    const wear = result.wear_analysis;
    const life = result.life_estimation;
    const days = life.estimated_remaining_days;
    const range = life.estimated_remaining_life_percent;
    const evidence = life.calculation_evidence
      ? Object.entries(life.calculation_evidence).filter(([key]) => EVIDENCE_VISIBLE_KEYS.has(key))
      : [];

    const roleAverages: Record<Role, number | null> = {
      left_outsole: average(Object.values(wear.left_outsole ?? {})),
      right_outsole: average(Object.values(wear.right_outsole ?? {})),
      heels: average(Object.values(wear.heel_view ?? {})),
      left_side: average(Object.values(wear.left_side ?? {})),
      right_side: average(Object.values(wear.right_side ?? {}))
    };

    return (
      <div className="wear-result">
        {/* 1. 맨 위 — 유통기한처럼 언제까지 신을 수 있는지 + 며칠 남았는지 */}
        <div className="wear-hero">
          <div className="wear-hero-label">이 러닝화, 이때까지 신을 수 있어요</div>
          <div className="wear-hero-date">{untilDateLabel(days.min, days.max)}</div>
          <div className="wear-hero-days">
            <strong>
              {days.min}~{days.max}
            </strong>
            <span>일 남음 (예상)</span>
          </div>
          <div className="wear-hero-meta">
            <span className="wear-hero-condition">{life.condition}</span>
            <span className="wear-hero-confidence">
              추정 신뢰도 {life.estimation_confidence.level} {life.estimation_confidence.percent}%
            </span>
          </div>
        </div>

        {/* 2. 왜 그 점수가 나왔는지 */}
        <div className="wear-section">
          <h3>왜 이런 결과가 나왔을까요?</h3>
          <div className="wear-metrics">
            <div className="wear-metric">
              <span>잔여 수명 비율</span>
              <strong>
                {range.min}~{range.max}%
              </strong>
            </div>
            {life.purchase_information && (
              <div className="wear-metric">
                <span>구매 후 경과</span>
                <strong>{life.purchase_information.elapsed_months}개월</strong>
              </div>
            )}
            {life.estimated_remaining_distance_km && (
              <div className="wear-metric">
                <span>예상 잔여 거리</span>
                <strong>
                  약 {life.estimated_remaining_distance_km.min}~{life.estimated_remaining_distance_km.max}km
                </strong>
              </div>
            )}
            {evidence.map(([key, value]) => (
              <div key={key} className="wear-metric">
                <span>{EVIDENCE_LABELS[key] ?? key}</span>
                <strong>{value === null ? '자료 부족(미산정)' : value}</strong>
              </div>
            ))}
          </div>
          {life.cautions.length > 0 && (
            <ul className="wear-cautions">
              {life.cautions.map((c, idx) => (
                <li key={idx}>⚠ {c}</li>
              ))}
            </ul>
          )}
          {(wear.crack_detected || wear.structural_damage_detected) && (
            <p className="field-error">
              ⚠ {wear.crack_detected && '균열이 감지됐어요. '}
              {wear.structural_damage_detected && '구조적 손상이 감지됐어요.'}
            </p>
          )}
          <p className="wear-notice">{life.notice}</p>
        </div>

        {/* 부위별 평균 마모 점수 그래프 */}
        <div className="wear-section">
          <h3>부위별 평균 마모 점수</h3>
          <div className="wear-role-bars">
            {ROLE_ORDER.map((role) => (
              <RoleBar key={role} role={role} value={roleAverages[role]} />
            ))}
          </div>
          {wear.asymmetry_level !== undefined && (
            <div className="wear-role-bars" style={{ marginTop: 6 }}>
              <div className="wear-role-bar-row">
                <span className="wear-role-bar-label">좌우 비대칭</span>
                <div className="wear-role-bar-track">
                  <div
                    className={`wear-role-bar-fill level-${scoreLevel(wear.asymmetry_level)}`}
                    style={{ width: `${(wear.asymmetry_level / 5) * 100}%` }}
                  />
                </div>
                <span className="wear-role-bar-value">{wear.asymmetry_level}/5</span>
              </div>
            </div>
          )}
        </div>

        {/* 3. 사진별 분석 점수 + 설명 */}
        <div className="wear-section">
          <h3>사진별 상세 분석</h3>
          <div className="wear-photo-grid">
            {ROLE_ORDER.map((role, idx) => {
              const scoreKey = ROLE_SCORE_KEY[role];
              const scoreObj = wear[scoreKey] as Record<string, number> | undefined;
              const subScores = scoreObj
                ? Object.entries(scoreObj).map(([k, v]) => [SUB_LABELS[role][k] ?? k, v] as [string, number])
                : [];
              const imageKey = result.storage?.image_keys?.[role];
              const photoUrl =
                imageKey && result.analysis_id
                  ? `/api/user-shoes/${userShoeId}/wear-analysis/${result.analysis_id}/photo?role=${role}`
                  : null;
              return (
                <PhotoAnalysisCard
                  key={role}
                  role={role}
                  score={roleAverages[role]}
                  subScores={subScores}
                  description={wear.observations?.[idx] ?? null}
                  photoUrl={photoUrl}
                />
              );
            })}
          </div>
        </div>

        {/* 4. 맨 밑 — 시각적 마모단계 점수 (큰 글씨) */}
        <div className="wear-overall-footer">
          <span className="wear-overall-footer-label">시각적 마모단계</span>
          <span className="wear-overall-footer-score">
            {wear.overall_wear_level}
            <small>/5점</small>
          </span>
        </div>
      </div>
    );
  }

  if (result.status === 'RETAKE_REQUIRED') {
    return (
      <div className="field-error wear-retake-notice">
        <p>{result.wear_analysis?.quality_reason ?? '사진 품질을 확인할 수 없어요.'}</p>
        {result.required_retake_views && result.required_retake_views.length > 0 && (
          <p>
            다시 찍어야 할 사진:{' '}
            {result.required_retake_views.map((role) => ROLE_LABELS[role as Role] ?? role).join(', ')}
          </p>
        )}
      </div>
    );
  }

  if (result.status === 'SAFETY_BLOCKED') {
    return <p className="field-error">{result.message ?? '안전 정책에 의해 분석이 차단됐어요.'}</p>;
  }

  return <p className="field-error">{result.message ?? '분석이 일시적으로 불안정해요. 잠시 후 다시 시도해 주세요.'}</p>;
}
