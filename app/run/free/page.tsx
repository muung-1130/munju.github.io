'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { CourseMapView } from '@/components/CourseMapView';
import type { CourseRoute } from '@/components/CourseMapView';
import { haversineMeters, formatStopwatch, formatPace } from '@/lib/geoRoute';

type Phase = 'ready' | 'countdown' | 'running' | 'finished' | 'error';

const SAMPLE_FLUSH_MS = 30000;
// GPS 오차가 큰(신호가 약한) 위치는 거리 누적에서 빼서 자유 달리기 특유의 "튀는" 거리 급증을 줄인다.
// 코스 트래킹(snapToRoute)은 알고 있는 경로에 스냅해서 노이즈를 걸러내지만, 자유 달리기는 기준
// 경로가 없어서 이 정확도 컷오프가 유일한 방어선이다.
const MAX_ACCEPTABLE_ACCURACY_M = 30;

type RunSample = { lat: number; lng: number; recordedAt: string; paceSecPerKm: number | null; accuracyM: number | null; speedMps: number | null };

export default function FreeRunTrackingPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();

  const [phase, setPhase] = useState<Phase>('ready');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [countdownValue, setCountdownValue] = useState(3);

  const [runId, setRunId] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [distanceM, setDistanceM] = useState(0);
  const [trail, setTrail] = useState<[number, number][]>([]);
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [locationAvailable, setLocationAvailable] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [starting, setStarting] = useState(false);

  const [finishResult, setFinishResult] = useState<{ status: 'COMPLETED' | 'CANCELLED'; distanceM: number; durationSec: number; avgPaceSecPerKm: number | null } | null>(null);
  const [finishedTrail, setFinishedTrail] = useState<[number, number][]>([]);

  const [shoeSelectOpen, setShoeSelectOpen] = useState(false);
  const [shoeOptions, setShoeOptions] = useState<{ userShoeId: string; shoeName: string; brandName: string; nickname: string | null }[] | null>(null);
  const pendingFinishRef = useRef<{ status: 'COMPLETED' | 'CANCELLED' } | null>(null);

  const [courseName, setCourseName] = useState('');
  const [recommending, setRecommending] = useState(false);
  const [recommendResult, setRecommendResult] = useState<{ courseId: string } | 'error' | null>(null);

  const trailRef = useRef<[number, number][]>([]);
  const distanceRef = useRef(0);
  const watchIdRef = useRef<number | null>(null);
  const timerIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const trackingStartMsRef = useRef<number | null>(null);
  const sampleBufferRef = useRef<RunSample[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runIdRef = useRef<string | null>(null);
  const locationAvailableRef = useRef(false);

  const clearAllTimers = useCallback(() => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    if (timerIdRef.current) clearInterval(timerIdRef.current);
    if (flushTimerRef.current) clearInterval(flushTimerRef.current);
    watchIdRef.current = null;
    timerIdRef.current = null;
    flushTimerRef.current = null;
  }, []);

  useEffect(() => clearAllTimers, [clearAllTimers]);

  async function flushSamples() {
    const id = runIdRef.current;
    if (!id || sampleBufferRef.current.length === 0) return;
    const batch = sampleBufferRef.current;
    sampleBufferRef.current = [];
    fetch(`/api/runs/${id}/samples`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ samples: batch })
    }).catch(() => {
      // 네트워크 실패는 조용히 무시 — 다음 30초 배치에서 이어서 쌓인다(유실은 감수).
    });
  }

  function handlePosition(position: GeolocationPosition) {
    locationAvailableRef.current = true;
    setLocationAvailable(true);
    setLocationError(null);

    const accuracyM = position.coords.accuracy ?? null;
    const raw: [number, number] = [position.coords.latitude, position.coords.longitude];

    if (accuracyM === null || accuracyM <= MAX_ACCEPTABLE_ACCURACY_M) {
      const prev = trailRef.current[trailRef.current.length - 1];
      if (prev) distanceRef.current += haversineMeters(prev, raw);
      trailRef.current = [...trailRef.current, raw];
      setTrail(trailRef.current);
      setDistanceM(distanceRef.current);
      setRecenterSignal((v) => v + 1);
    }

    sampleBufferRef.current.push({
      lat: raw[0],
      lng: raw[1],
      recordedAt: new Date().toISOString(),
      paceSecPerKm: null,
      accuracyM,
      speedMps: position.coords.speed ?? null
    });
  }

  function handlePositionError(error: GeolocationPositionError) {
    if (locationAvailableRef.current) return;
    setLocationError(
      error.code === error.PERMISSION_DENIED ? '위치 권한이 거부됐어요. 브라우저 설정에서 허용해주세요.' : '위치 정보를 가져올 수 없어요.'
    );
  }

  function startLocationWatch() {
    if (!navigator.geolocation) {
      setLocationError('이 브라우저에서는 위치 정보를 사용할 수 없어요.');
      return;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(handlePosition, handlePositionError, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000
    });
  }

  function beginTracking(id: string) {
    runIdRef.current = id;
    trackingStartMsRef.current = Date.now();
    setElapsedSec(0);
    setPhase('running');
    timerIdRef.current = setInterval(() => {
      if (trackingStartMsRef.current) setElapsedSec(Math.floor((Date.now() - trackingStartMsRef.current) / 1000));
    }, 1000);
    flushTimerRef.current = setInterval(flushSamples, SAMPLE_FLUSH_MS);
  }

  async function handleStart() {
    if (!session?.user) {
      router.push('/');
      return;
    }
    setStarting(true);
    try {
      const res = await fetch('/api/runs/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? '시작할 수 없어요.');
        setPhase('error');
        return;
      }
      setRunId(data.runId);
      setPhase('countdown');
      setCountdownValue(3);
      startLocationWatch();
    } finally {
      setStarting(false);
    }
  }

  useEffect(() => {
    if (phase !== 'countdown') return;
    if (countdownValue <= 0) {
      if (runId) beginTracking(runId);
      return;
    }
    const t = setTimeout(() => setCountdownValue((v) => v - 1), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, countdownValue]);

  function computePaceMetrics(finishDistanceM: number, durationSec: number) {
    if (finishDistanceM <= 0 || durationSec <= 0) return { avgPaceSecPerKm: null as number | null };
    return { avgPaceSecPerKm: Math.round(durationSec / (finishDistanceM / 1000)) };
  }

  async function submitFinish(status: 'COMPLETED' | 'CANCELLED', myShoeId: string | null) {
    if (!runIdRef.current) return;
    clearAllTimers();

    if (status === 'CANCELLED') {
      await fetch(`/api/runs/${runIdRef.current}/cancel`, { method: 'POST' }).catch(() => {});
      setFinishResult({ status: 'CANCELLED', distanceM: 0, durationSec: elapsedSec, avgPaceSecPerKm: null });
      setPhase('finished');
      return;
    }

    await flushSamples();
    const finalDistanceM = Math.round(distanceRef.current);
    const { avgPaceSecPerKm } = computePaceMetrics(finalDistanceM, elapsedSec);
    const res = await fetch(`/api/runs/${runIdRef.current}/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'COMPLETED',
        sourceType: 'APP',
        distanceM: finalDistanceM,
        durationSec: elapsedSec,
        movingDurationSec: elapsedSec,
        avgPaceSecPerKm,
        bestPaceSecPerKm: avgPaceSecPerKm,
        routePositions: trailRef.current,
        myShoeId
      })
    });
    if (res.ok) {
      setFinishedTrail(trailRef.current);
      setFinishResult({ status: 'COMPLETED', distanceM: finalDistanceM, durationSec: elapsedSec, avgPaceSecPerKm });
      setPhase('finished');
    } else {
      setErrorMsg('기록 저장에 실패했어요.');
      setPhase('error');
    }
  }

  function requestFinish(status: 'COMPLETED' | 'CANCELLED') {
    if (status === 'CANCELLED') {
      submitFinish('CANCELLED', null);
      return;
    }
    if (distanceRef.current <= 0) {
      // 이동 거리가 0m면 저장할 의미가 없는 빈 기록이라 취소로 처리한다(코스 트래킹과 동일한 정책).
      submitFinish('CANCELLED', null);
      return;
    }
    pendingFinishRef.current = { status };
    if (shoeOptions === null) {
      fetch('/api/user-shoes/active-options')
        .then((res) => (res.ok ? res.json() : { shoes: [] }))
        .then((data) => setShoeOptions(data.shoes ?? []));
    }
    setShoeSelectOpen(true);
  }

  function confirmShoeSelection(myShoeId: string | null) {
    setShoeSelectOpen(false);
    const pending = pendingFinishRef.current;
    if (!pending) return;
    submitFinish(pending.status, myShoeId);
  }

  async function submitRecommendAsCourse() {
    if (!runIdRef.current || !courseName.trim()) return;
    setRecommending(true);
    try {
      const res = await fetch('/api/courses/from-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: runIdRef.current, courseName: courseName.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setRecommendResult({ courseId: data.courseId });
      } else {
        setRecommendResult('error');
      }
    } catch {
      setRecommendResult('error');
    } finally {
      setRecommending(false);
    }
  }

  const routeForMap: CourseRoute | null =
    trail.length > 0 ? { id: 'free-run', name: '내 경로', color: '#1259ee', positions: trail } : null;

  if (sessionStatus !== 'loading' && !session?.user) {
    return (
      <div className="run-track-page">
        <p className="muted">로그인이 필요해요.</p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="run-track-page">
        <p className="field-error">{errorMsg}</p>
      </div>
    );
  }

  return (
    <div className="run-track-page">
      {phase === 'ready' && (
        <div className="run-preview">
          <h1>자율 달리기</h1>
          <p className="muted">정해진 코스 없이 자유롭게 달려보세요. 완료하면 이 경로를 내 닉네임으로 코스 탐색에 추천할 수 있어요.</p>
          <button className="primary-btn full-width run-start-btn" disabled={starting} onClick={handleStart}>
            {starting ? '준비 중...' : '자유 달리기 시작'}
          </button>
        </div>
      )}

      {phase === 'countdown' && (
        <div className="run-countdown">
          <span key={countdownValue}>{countdownValue > 0 ? countdownValue : '출발!'}</span>
          <p className="run-countdown-location">
            {locationAvailable ? '✅ 위치 확인 완료' : locationError ? `⚠️ ${locationError}` : '📍 위치 확인 중...'}
          </p>
        </div>
      )}

      {phase === 'running' && (
        <div className="run-tracking">
          <div className="run-stopwatch">{formatStopwatch(elapsedSec)}</div>
          <div className="run-progress-row">
            <span>{(distanceM / 1000).toFixed(2)}km</span>
          </div>
          {!locationAvailable && (
            <p className="run-location-warning">{locationError ?? '위치를 확인하는 중이에요. 지도에 내 위치가 곧 표시돼요.'}</p>
          )}
          <div className="run-tracking-map">
            <CourseMapView
              routes={routeForMap ? [routeForMap] : []}
              height={420}
              center={trail[trail.length - 1]}
              recenterSignal={recenterSignal}
              defaultZoom={17}
              locationMarker={trail[trail.length - 1] ?? undefined}
            />
          </div>
          <div className="run-action-row">
            <button className="ghost-btn run-cancel-btn" onClick={() => setCancelConfirmOpen(true)}>
              취소
            </button>
            <button className="primary-btn run-arrive-btn" onClick={() => requestFinish('COMPLETED')}>
              종료
            </button>
          </div>
        </div>
      )}

      {phase === 'finished' && finishResult && (
        <div className="run-finished">
          <h2>{finishResult.status === 'COMPLETED' ? '러닝 완료!' : '러닝이 취소됐어요'}</h2>
          {finishResult.status === 'COMPLETED' && (
            <>
              <div className="run-finished-stats">
                <div>
                  <span>거리</span>
                  <strong>{(finishResult.distanceM / 1000).toFixed(2)}km</strong>
                </div>
                <div>
                  <span>시간</span>
                  <strong>{formatStopwatch(finishResult.durationSec)}</strong>
                </div>
                <div>
                  <span>평균 페이스</span>
                  <strong>{finishResult.avgPaceSecPerKm ? `${formatPace(finishResult.avgPaceSecPerKm)}/km` : '-'}</strong>
                </div>
              </div>

              {finishedTrail.length >= 2 && !recommendResult && (
                <div className="run-preview" style={{ marginTop: 16 }}>
                  <h2>이 경로를 코스로 추천할까요?</h2>
                  <p className="muted">코스 이름을 정하면 코스 탐색에 내 닉네임으로 등록돼요.</p>
                  <input
                    value={courseName}
                    onChange={(e) => setCourseName(e.target.value)}
                    placeholder="예: 한강 야경 러닝 코스"
                    maxLength={300}
                    style={{ width: '100%', marginBottom: 10 }}
                  />
                  <button className="primary-btn full-width" disabled={recommending || !courseName.trim()} onClick={submitRecommendAsCourse}>
                    {recommending ? '등록 중...' : '코스로 추천하기'}
                  </button>
                </div>
              )}

              {recommendResult === 'error' && <p className="field-error">코스 등록에 실패했어요. 다시 시도해주세요.</p>}

              {recommendResult && recommendResult !== 'error' && (
                <p className="field-ok">코스로 등록됐어요! 코스 탐색에서 바로 확인할 수 있어요.</p>
              )}
            </>
          )}

          <button className="ghost-btn full-width" style={{ marginTop: 12 }} onClick={() => router.push('/mypage')}>
            마이페이지에서 확인하기
          </button>
        </div>
      )}

      {cancelConfirmOpen && (
        <div className="run-modal-overlay">
          <div className="crew-detail-modal" style={{ width: 360 }}>
            <p>러닝을 취소하시겠습니까? 지금까지의 기록은 저장되지 않아요.</p>
            <div className="crew-battle-actions">
              <button className="ghost-btn" onClick={() => setCancelConfirmOpen(false)}>
                계속 달리기
              </button>
              <button
                className="primary-btn"
                onClick={() => {
                  setCancelConfirmOpen(false);
                  requestFinish('CANCELLED');
                }}
              >
                취소하기
              </button>
            </div>
          </div>
        </div>
      )}

      {shoeSelectOpen && (
        <div className="run-modal-overlay">
          <div className="crew-detail-modal shoe-select-modal" style={{ width: 380 }}>
            <p>무슨 신발을 신고 뛰었나요?</p>
            {shoeOptions === null ? (
              <p className="muted">불러오는 중...</p>
            ) : shoeOptions.length === 0 ? (
              <p className="muted">등록된 러닝화가 없어요.</p>
            ) : (
              <div className="shoe-select-list">
                {shoeOptions.map((shoe) => (
                  <button key={shoe.userShoeId} className="ghost-btn full-width" onClick={() => confirmShoeSelection(shoe.userShoeId)}>
                    {shoe.nickname || `${shoe.brandName} ${shoe.shoeName}`}
                  </button>
                ))}
              </div>
            )}
            <button className="primary-btn full-width" style={{ marginTop: 10 }} onClick={() => confirmShoeSelection(null)}>
              해당없음
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
