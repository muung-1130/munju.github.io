'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Card, PageTitle } from '@/components/UI';
import { useAuthModal } from '@/components/AuthModalContext';

type MarathonRace = {
  raceId: number;
  raceName: string;
  raceDate: string | null;
  registrationStartDate: string | null;
  registrationEndDate: string | null;
  souvenir: string | null;
  raceDistance: string;
  region: string | null;
  officialWebsite: string;
  isExclusiveCollab: boolean;
};

type ReservationInfo = { status: string; submittedAt: string };
type DistanceBucket = 'KM5' | 'KM10' | 'KM15' | 'HALF' | 'FULL';

const DISTANCE_BUCKET_OPTIONS: { value: DistanceBucket; label: string; range: string }[] = [
  { value: 'KM5', label: '5km', range: '~5km' },
  { value: 'KM10', label: '10km', range: '6~10km' },
  { value: 'KM15', label: '15km', range: '11~19km' },
  { value: 'HALF', label: '하프', range: '20~30km' },
  { value: 'FULL', label: '풀', range: '31km~' }
];

const REG_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  OPEN: { label: '접수중', className: 'marathon-status-open' },
  UPCOMING: { label: '접수 예정', className: 'marathon-status-upcoming' },
  CLOSED: { label: '접수 마감', className: 'marathon-status-closed' },
  UNKNOWN: { label: '접수 정보 없음', className: 'marathon-status-unknown' }
};

function todayKstDateString() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}

function getRegistrationStatus(race: MarathonRace): keyof typeof REG_STATUS_LABEL {
  const today = todayKstDateString();
  if (!race.registrationStartDate && !race.registrationEndDate) return 'UNKNOWN';
  if (race.registrationStartDate && today < race.registrationStartDate) return 'UPCOMING';
  if (race.registrationEndDate && today > race.registrationEndDate) return 'CLOSED';
  return 'OPEN';
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '미정';
  const d = new Date(`${dateStr}T00:00:00Z`);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][d.getUTCDay()];
  return `${dateStr.replaceAll('-', '.')} (${weekday})`;
}

function dDayLabel(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const today = todayKstDateString();
  const diffDays = Math.round((new Date(`${dateStr}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000);
  if (diffDays === 0) return 'D-day';
  if (diffDays > 0) return `D-${diffDays}`;
  return null;
}

export default function MarathonPage() {
  const { data: session } = useSession();
  const { openAuthModal } = useAuthModal();

  const [races, setRaces] = useState<MarathonRace[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [regions, setRegions] = useState<string[]>([]);
  const [myReservations, setMyReservations] = useState<Record<number, ReservationInfo>>({});

  const [keyword, setKeyword] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [region, setRegion] = useState('서울');
  const [distanceBucket, setDistanceBucket] = useState<DistanceBucket | ''>('');
  const [includeClosed, setIncludeClosed] = useState(false);
  const [includePast, setIncludePast] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [busyRaceId, setBusyRaceId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (keyword) params.set('keyword', keyword);
    if (region) params.set('region', region);
    if (distanceBucket) params.set('distanceBucket', distanceBucket);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    params.set('includeClosed', String(includeClosed));
    params.set('includePast', String(includePast));
    params.set('page', String(page));

    const res = await fetch(`/api/marathon?${params.toString()}`);
    if (!res.ok) return;
    const data = await res.json();
    setRaces(data.races);
    setTotal(data.total);
    setPageSize(data.pageSize);
    setRegions(data.regions);
    setMyReservations(data.myReservations ?? {});
  }, [keyword, region, distanceBucket, dateFrom, dateTo, includeClosed, includePast, page]);

  useEffect(() => {
    load();
  }, [load]);

  function submitKeyword(event: React.FormEvent) {
    event.preventDefault();
    setPage(1);
    setKeyword(keywordInput.trim());
  }

  async function applyToRace(raceId: number) {
    if (!session?.user) {
      openAuthModal();
      return;
    }
    setActionError(null);
    setBusyRaceId(raceId);
    try {
      const res = await fetch(`/api/marathon/${raceId}/apply`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setMyReservations((prev) => ({ ...prev, [raceId]: { status: 'PENDING', submittedAt: new Date().toISOString() } }));
      } else {
        setActionError(data.error ?? '신청에 실패했어요.');
      }
    } finally {
      setBusyRaceId(null);
    }
  }

  async function cancelReservation(raceId: number) {
    setActionError(null);
    setBusyRaceId(raceId);
    try {
      const res = await fetch(`/api/marathon/${raceId}/cancel`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setMyReservations((prev) => {
          const next = { ...prev };
          delete next[raceId];
          return next;
        });
      } else {
        setActionError(data.error ?? '취소에 실패했어요.');
      }
    } finally {
      setBusyRaceId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <PageTitle title="마라톤" subtitle="전국 마라톤 대회 일정을 한눈에 확인하고 바로 신청하세요." />

      <Card className="marathon-filter-card">
        <form className="marathon-toolbar" onSubmit={submitKeyword}>
          <label className="marathon-field marathon-field-search">
            <span className="marathon-field-icon">🔍</span>
            <input
              value={keywordInput}
              onChange={(event) => setKeywordInput(event.target.value)}
              placeholder="대회명 또는 지역으로 검색"
            />
          </label>
          <label className="marathon-field marathon-field-select">
            <span className="marathon-field-icon">📍</span>
            <select
              value={region}
              onChange={(event) => {
                setPage(1);
                setRegion(event.target.value);
              }}
            >
              <option value="">전체 지역</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <div className="marathon-field marathon-field-daterange">
            <span className="marathon-field-icon">📅</span>
            <input
              type="date"
              value={dateFrom}
              min="2024-01-01"
              max="2030-12-31"
              onClick={(event) => event.currentTarget.showPicker?.()}
              onChange={(event) => {
                setPage(1);
                setDateFrom(event.target.value);
              }}
            />
            <span className="marathon-date-sep">–</span>
            <input
              type="date"
              value={dateTo}
              min="2024-01-01"
              max="2030-12-31"
              onClick={(event) => event.currentTarget.showPicker?.()}
              onChange={(event) => {
                setPage(1);
                setDateTo(event.target.value);
              }}
            />
          </div>
          <button type="submit" className="primary-btn marathon-search-btn">
            검색
          </button>
        </form>

        <div className="marathon-toolbar-secondary">
          <div className="marathon-distance-buttons">
            <button
              type="button"
              className={distanceBucket === '' ? 'active' : ''}
              onClick={() => {
                setPage(1);
                setDistanceBucket('');
              }}
            >
              <strong>전체 거리</strong>
            </button>
            {DISTANCE_BUCKET_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={distanceBucket === opt.value ? 'active' : ''}
                onClick={() => {
                  setPage(1);
                  setDistanceBucket(opt.value);
                }}
              >
                <strong>{opt.label}</strong>
                <span>{opt.range}</span>
              </button>
            ))}
          </div>
          <div className="marathon-filter-check-stack">
            <label className="marathon-filter-check">
              <input
                type="checkbox"
                checked={includeClosed}
                onChange={(event) => {
                  setPage(1);
                  setIncludeClosed(event.target.checked);
                }}
              />
              마감된 대회 포함
            </label>
            <label className="marathon-filter-check">
              <input
                type="checkbox"
                checked={includePast}
                onChange={(event) => {
                  setPage(1);
                  setIncludePast(event.target.checked);
                }}
              />
              지난 대회 포함
            </label>
          </div>
        </div>
      </Card>

      {actionError && <p className="field-error">{actionError}</p>}

      <Card className="marathon-list-card">
        <div className="card-head">
          <h2>
            대회 목록 <span className="muted">{total}건</span>
          </h2>
        </div>

        {races === null ? (
          <p className="muted">불러오는 중...</p>
        ) : races.length === 0 ? (
          <p className="muted">조건에 맞는 대회가 없어요.</p>
        ) : (
          <div className="marathon-table-wrap">
            <table className="marathon-table">
              <thead>
                <tr>
                  <th>대회명</th>
                  <th>대회일</th>
                  <th>거리</th>
                  <th>지역</th>
                  <th>접수 기간</th>
                  <th>기념품</th>
                  <th>접수 상태</th>
                  <th>신청</th>
                </tr>
              </thead>
              <tbody>
                {races.map((race) => {
                  const status = getRegistrationStatus(race);
                  const statusInfo = REG_STATUS_LABEL[status];
                  const dday = dDayLabel(race.raceDate);
                  const reservation = myReservations[race.raceId];
                  const applied = !!reservation;
                  const busy = busyRaceId === race.raceId;

                  return (
                    <tr key={race.raceId}>
                      <td>
                        <div className="marathon-race-name">
                          <strong>{race.raceName}</strong>
                          {race.isExclusiveCollab && <span className="marathon-collab-badge">DAI RUN 단독</span>}
                          {race.officialWebsite && (
                            <a href={race.officialWebsite} target="_blank" rel="noreferrer" className="marathon-official-link">
                              공식 홈페이지 ↗
                            </a>
                          )}
                        </div>
                      </td>
                      <td>
                        {formatDate(race.raceDate)}
                        {dday && <span className="marathon-dday">{dday}</span>}
                      </td>
                      <td>{race.raceDistance}</td>
                      <td>{race.region || '전국'}</td>
                      <td>
                        {race.registrationStartDate && race.registrationEndDate
                          ? `${race.registrationStartDate} ~ ${race.registrationEndDate}`
                          : '미정'}
                      </td>
                      <td>
                        {race.souvenir ? (
                          <span className="marathon-souvenir-badge" data-tooltip={race.souvenir}>
                            있음
                          </span>
                        ) : (
                          <span className="marathon-souvenir-badge none">없음</span>
                        )}
                      </td>
                      <td>
                        <span className={`marathon-status-badge ${statusInfo.className}`}>{statusInfo.label}</span>
                      </td>
                      <td>
                        {race.isExclusiveCollab ? (
                          <Link href={`/marathon/${race.raceId}`} className="primary-btn small">
                            {applied ? '내 신청 확인' : '상세보기 · 신청하기'}
                          </Link>
                        ) : applied ? (
                          <div className="marathon-apply-cell">
                            <span className="marathon-applied-badge">신청 완료</span>
                            <button className="ghost-btn small" disabled={busy} onClick={() => cancelReservation(race.raceId)}>
                              취소
                            </button>
                          </div>
                        ) : (
                          <button
                            className="primary-btn small"
                            disabled={busy || status === 'CLOSED' || status === 'UPCOMING'}
                            onClick={() => applyToRace(race.raceId)}
                          >
                            {status === 'CLOSED' ? '마감' : status === 'UPCOMING' ? '접수 예정' : busy ? '신청 중...' : '신청하기'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {races !== null && races.length > 0 && (
          <div className="marathon-pagination">
            <button className="ghost-btn small" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              이전
            </button>
            <span className="muted">
              {page} / {totalPages}
            </span>
            <button className="ghost-btn small" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              다음
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
