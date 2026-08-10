'use client';

import { useEffect, useState } from 'react';

type CrewBattleInfo = {
  crewName: string;
  memberCount: number;
  rank: number | null;
  rankTotal: number;
  statValue: number | null;
  winCount: number;
};

function formatStat(metricType: 'DISTANCE' | 'PACE', value: number | null): string {
  if (value === null) return '기록 없음';
  return metricType === 'DISTANCE' ? `${value.toFixed(2)}km` : `${value.toFixed(2)}분/km`;
}

function CrewColumn({ crewId, fallbackName, metricType }: { crewId: string; fallbackName: string; metricType: 'DISTANCE' | 'PACE' }) {
  const [info, setInfo] = useState<CrewBattleInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/crew/${crewId}/battle/info?metric=${metricType}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setInfo(data.info);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [crewId, metricType]);

  return (
    <div className="crew-vs-column">
      <strong>{info?.crewName ?? fallbackName}</strong>
      <span className="muted">랭킹 {info ? (info.rank ? `${info.rank}/${info.rankTotal}위` : '집계 전') : '...'}</span>
      <span className="muted">인원 {info ? `${info.memberCount}명` : '...'}</span>
      <span className="muted">오늘 {info ? formatStat(metricType, info.statValue) : '...'}</span>
      <span className="muted">배틀 우승 {info ? `${info.winCount}회` : '...'}</span>
    </div>
  );
}

// 상대 크루 이름에 마우스를 올려야만 잠깐 보이던 팝업(스크롤에 가려 안 보이는 버그가 있었다)을
// 대신해서, 우리 크루와 상대 크루 정보를 나란히 항상 보여주는 2열 비교 패널. 가운데 불꽃으로
// 대결 느낌을 준다.
export function CrewVsPanel({
  myCrewId,
  myCrewName,
  opponentCrewId,
  opponentCrewName,
  metricType
}: {
  myCrewId: string;
  myCrewName: string;
  opponentCrewId: string;
  opponentCrewName: string;
  metricType: 'DISTANCE' | 'PACE';
}) {
  return (
    <div className="crew-vs-panel">
      <CrewColumn crewId={myCrewId} fallbackName={myCrewName} metricType={metricType} />
      <span className="crew-vs-flame">🔥</span>
      <CrewColumn crewId={opponentCrewId} fallbackName={opponentCrewName} metricType={metricType} />
    </div>
  );
}
