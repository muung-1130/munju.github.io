'use client';

import { Donut } from '@/components/UI';
import { WEAR_ROLE_LABELS } from '@/components/WearPhotoUploadGrid';

export type WearAnalysisResponse = {
  status: 'COMPLETED' | 'RETAKE_REQUIRED' | 'SAFETY_BLOCKED' | 'ANALYSIS_REJECTED';
  message?: string;
  required_retake_views?: string[];
  wear_analysis?: {
    overall_wear_level: number;
    confidence: number;
    observations: string[];
    quality_reason?: string;
  };
  life_estimation?: {
    condition: string;
    estimated_remaining_life_percent: { min: number; max: number };
    estimated_remaining_days: { min: number; max: number };
    estimated_remaining_distance_km: { min: number; max: number } | null;
    estimation_confidence: { level: string; percent: number };
    cautions: string[];
    notice: string;
  };
};

export function WearAnalysisResultView({ result }: { result: WearAnalysisResponse }) {
  if (result.status === 'COMPLETED' && result.wear_analysis && result.life_estimation) {
    const { wear_analysis, life_estimation } = result;
    return (
      <div className="life-result">
        <h3>수명 예측 결과</h3>
        <Donut
          value={life_estimation.estimated_remaining_life_percent.max}
          label={`${life_estimation.estimated_remaining_life_percent.min}~${life_estimation.estimated_remaining_life_percent.max}%`}
        />
        <div>
          <p>
            상태 <b>{life_estimation.condition}</b>
          </p>
          <p>
            마모 단계 <b>{wear_analysis.overall_wear_level} / 5</b>
          </p>
          <p>
            예상 잔여일 <b>{life_estimation.estimated_remaining_days.min}~{life_estimation.estimated_remaining_days.max}일</b>
          </p>
          {life_estimation.estimated_remaining_distance_km && (
            <p>
              예상 잔여 거리{' '}
              <b>
                약 {life_estimation.estimated_remaining_distance_km.min}~
                {life_estimation.estimated_remaining_distance_km.max}km
              </b>
            </p>
          )}
          <p>
            예측 신뢰도 <b>{life_estimation.estimation_confidence.level} ({life_estimation.estimation_confidence.percent}%)</b>
          </p>
        </div>
        {wear_analysis.observations.length > 0 && (
          <ul className="wear-observations">
            {wear_analysis.observations.map((obs, idx) => (
              <li key={idx}>{obs}</li>
            ))}
          </ul>
        )}
        {life_estimation.cautions.length > 0 && (
          <ul className="wear-cautions">
            {life_estimation.cautions.map((c, idx) => (
              <li key={idx}>⚠ {c}</li>
            ))}
          </ul>
        )}
        <p className="muted" style={{ marginTop: 8 }}>{life_estimation.notice}</p>
      </div>
    );
  }

  if (result.status === 'RETAKE_REQUIRED') {
    return (
      <div className="field-error wear-retake-notice">
        <p>{result.wear_analysis?.quality_reason ?? '사진 품질을 확인할 수 없어요.'}</p>
        {result.required_retake_views && result.required_retake_views.length > 0 && (
          <p>
            다시 찍어야 할 사진: {result.required_retake_views.map((role) => WEAR_ROLE_LABELS[role] ?? role).join(', ')}
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
