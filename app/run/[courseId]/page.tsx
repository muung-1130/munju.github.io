'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { CourseMapView } from '@/components/CourseMapView';
import type { CourseRoute } from '@/components/CourseMapView';
import {
  buildCumulativeDistances,
  snapToRoute,
  haversineMeters,
  formatStopwatch,
  formatPace,
  IMPOSSIBLE_PACE_SEC_PER_KM,
  FORGOT_TO_STOP_PACE_SEC_PER_KM
} from '@/lib/geoRoute';

type CourseInfo = { courseId: string; courseName: string; distanceM: number; positions: [number, number][] };
type Phase = 'loading' | 'preview' | 'countdown' | 'running' | 'manualReview' | 'finished' | 'error';

const ARRIVAL_TOLERANCE_M = 40;
const SAMPLE_FLUSH_MS = 30000;
const PACE_CHECK_MS = 30000;
const FORGOT_TO_STOP_TIMEOUT_MS = 45000;

type RunSample = { lat: number; lng: number; recordedAt: string; paceSecPerKm: number | null; accuracyM: number | null; speedMps: number | null };

export default function RunTrackingPage() {
  const params = useParams<{ courseId: string }>();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const courseId = params.courseId;

  const [phase, setPhase] = useState<Phase>('loading');
  const [course, setCourse] = useState<CourseInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [countdownValue, setCountdownValue] = useState(3);

  const [runId, setRunId] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [snappedPos, setSnappedPos] = useState<[number, number] | null>(null);
  const [maxDistanceAlongM, setMaxDistanceAlongM] = useState(0);
  const [recenterSignal, setRecenterSignal] = useState(0);

  const [notArrivedConfirmOpen, setNotArrivedConfirmOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [forgotToStopOpen, setForgotToStopOpen] = useState(false);
  const [noLocationArriveOpen, setNoLocationArriveOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [locationAvailable, setLocationAvailable] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const [finishResult, setFinishResult] = useState<{
    status: 'COMPLETED' | 'STOPPED' | 'CANCELLED';
    distanceM: number;
    durationSec: number;
    avgPaceSecPerKm: number | null;
  } | null>(null);

  const [manualDistanceKm, setManualDistanceKm] = useState('');
  const [manualMinutes, setManualMinutes] = useState('');
  const [manualSeconds, setManualSeconds] = useState('');
  const [pendingManualStatus, setPendingManualStatus] = useState<'COMPLETED' | 'STOPPED'>('COMPLETED');

  const cumulativeRef = useRef<number[]>([]);
  const watchIdRef = useRef<number | null>(null);
  const timerIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const trackingStartMsRef = useRef<number | null>(null);
  const lastRawPositionRef = useRef<[number, number] | null>(null);
  const sampleBufferRef = useRef<RunSample[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const checkpointRef = useRef<{ time: number; distance: number }>({ time: 0, distance: 0 });
  const paceCheckTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const forgotTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runIdRef = useRef<string | null>(null);
  const locationAvailableRef = useRef(false);
  // 확인창이 하나라도 떠 있는 동안은 "도착 버튼을 잊으신 것 같아요" 체크를 쉰다 — 안 그러면
  // "아직 도착 안 했는데 종료할까요?" 창이 떠 있는 동안 뒤에서 타이머가 계속 돌아서, 그 창을
  // 오래 띄워두기만 해도 별개의 페이스 경고가 겹쳐서 뜨는 문제가 있었다.
  const dialogOpenRef = useRef(false);
  useEffect(() => {
    dialogOpenRef.current = notArrivedConfirmOpen || cancelConfirmOpen || forgotToStopOpen || noLocationArriveOpen;
  }, [notArrivedConfirmOpen, cancelConfirmOpen, forgotToStopOpen, noLocationArriveOpen]);
  // setInterval 클로저 안에서 최신 state를 읽기 위한 ref 미러링.
  const maxDistanceAlongMRef = useRef(0);
  useEffect(() => {
    maxDistanceAlongMRef.current = maxDistanceAlongM;
  }, [maxDistanceAlongM]);

  useEffect(() => {
    fetch(`/api/courses/${courseId}/track-info`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        cumulativeRef.current = buildCumulativeDistances(data.course.positions);
        setCourse(data.course);
        setPhase('preview');
      })
      .catch(() => {
        setErrorMsg('코스 경로 정보를 불러오지 못했어요.');
        setPhase('error');
      });
  }, [courseId]);

  const clearAllTimers = useCallback(() => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    if (timerIdRef.current) clearInterval(timerIdRef.current);
    if (flushTimerRef.current) clearInterval(flushTimerRef.current);
    if (paceCheckTimerRef.current) clearInterval(paceCheckTimerRef.current);
    if (forgotTimeoutRef.current) clearTimeout(forgotTimeoutRef.current);
    watchIdRef.current = null;
    timerIdRef.current = null;
    flushTimerRef.current = null;
    paceCheckTimerRef.current = null;
    forgotTimeoutRef.current = null;
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
    if (!course) return;
    const raw: [number, number] = [position.coords.latitude, position.coords.longitude];
    lastRawPositionRef.current = raw;
    const snap = snapToRoute(raw, course.positions, cumulativeRef.current);
    if (!snap) return;
    setSnappedPos(snap.point);
    setMaxDistanceAlongM((prev) => Math.max(prev, snap.distanceAlongM));
    setRecenterSignal((v) => v + 1);

    sampleBufferRef.current.push({
      lat: raw[0],
      lng: raw[1],
      recordedAt: new Date().toISOString(),
      paceSecPerKm: null,
      accuracyM: position.coords.accuracy ?? null,
      speedMps: position.coords.speed ?? null
    });
  }

  function handlePositionError(error: GeolocationPositionError) {
    if (locationAvailableRef.current) return; // 한 번이라도 잡혔으면 일시적 오류는 무시
    setLocationError(
      error.code === error.PERMISSION_DENIED ? '위치 권한이 거부됐어요. 브라우저 설정에서 허용해주세요.' : '위치 정보를 가져올 수 없어요.'
    );
  }

  // 카운트다운이 시작되는 순간 GPS 수집을 미리 시작해서(사전 점검), "출발!"과 동시에 지도에
  // 내 위치가 바로 뜨게 한다. 실제 기록용 타이머(스톱워치·샘플 저장·페이스 체크)는 beginTracking에서
  // 카운트다운이 끝난 뒤에만 별도로 시작한다.
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
    checkpointRef.current = { time: Date.now(), distance: 0 };
    setElapsedSec(0);
    setMaxDistanceAlongM(0);
    setPhase('running');

    timerIdRef.current = setInterval(() => {
      if (trackingStartMsRef.current) setElapsedSec(Math.floor((Date.now() - trackingStartMsRef.current) / 1000));
    }, 1000);

    flushTimerRef.current = setInterval(flushSamples, SAMPLE_FLUSH_MS);

    paceCheckTimerRef.current = setInterval(() => {
      if (dialogOpenRef.current) {
        // 확인창이 떠 있는 동안 멈춰 있던 시간은 페이스 계산에서 빼기 위해 체크포인트만 갱신한다.
        checkpointRef.current = { time: Date.now(), distance: maxDistanceAlongMRef.current };
        return;
      }
      const nowMs = Date.now();
      const nowDistance = maxDistanceAlongMRef.current;
      const { time: lastTime, distance: lastDistance } = checkpointRef.current;
      const deltaSec = (nowMs - lastTime) / 1000;
      const deltaKm = (nowDistance - lastDistance) / 1000;
      const intervalPace = deltaKm > 0 ? deltaSec / deltaKm : Infinity;
      checkpointRef.current = { time: nowMs, distance: nowDistance };
      if (intervalPace > FORGOT_TO_STOP_PACE_SEC_PER_KM) {
        openForgotToStopAlert();
      }
    }, PACE_CHECK_MS);
  }

  function openForgotToStopAlert() {
    setForgotToStopOpen(true);
    if (forgotTimeoutRef.current) clearTimeout(forgotTimeoutRef.current);
    forgotTimeoutRef.current = setTimeout(() => {
      setForgotToStopOpen(false);
      finishAsCancelled();
    }, FORGOT_TO_STOP_TIMEOUT_MS);
  }

  function dismissForgotToStopAlert() {
    setForgotToStopOpen(false);
    if (forgotTimeoutRef.current) clearTimeout(forgotTimeoutRef.current);
    checkpointRef.current = { time: Date.now(), distance: maxDistanceAlongMRef.current };
  }

  async function handleStart() {
    if (!session?.user) {
      router.push('/');
      return;
    }
    setFinishing(true);
    try {
      const res = await fetch('/api/runs/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId })
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
      setFinishing(false);
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

  function computePaceMetrics(distanceM: number, durationSec: number) {
    if (distanceM <= 0 || durationSec <= 0) return { avgPaceSecPerKm: null as number | null };
    const avgPaceSecPerKm = Math.round(durationSec / (distanceM / 1000));
    return { avgPaceSecPerKm };
  }

  async function submitFinish(status: 'COMPLETED' | 'STOPPED', distanceM: number, durationSec: number, sourceType: 'APP' | 'MANUAL') {
    if (!runIdRef.current) return;
    const { avgPaceSecPerKm } = computePaceMetrics(distanceM, durationSec);
    clearAllTimers();
    await flushSamples();
    const res = await fetch(`/api/runs/${runIdRef.current}/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        sourceType,
        distanceM,
        durationSec,
        movingDurationSec: durationSec,
        avgPaceSecPerKm,
        bestPaceSecPerKm: avgPaceSecPerKm,
        routePositions: course ? course.positions.slice(0, Math.max(2, Math.ceil((distanceM / course.distanceM) * course.positions.length))) : []
      })
    });
    if (res.ok) {
      setFinishResult({ status, distanceM, durationSec, avgPaceSecPerKm });
      setPhase('finished');
    } else {
      setErrorMsg('기록 저장에 실패했어요.');
      setPhase('error');
    }
  }

  async function finishAsCancelled() {
    if (!runIdRef.current) return;
    clearAllTimers();
    await fetch(`/api/runs/${runIdRef.current}/cancel`, { method: 'POST' }).catch(() => {});
    setFinishResult({ status: 'CANCELLED', distanceM: 0, durationSec: elapsedSec, avgPaceSecPerKm: null });
    setPhase('finished');
  }

  // "도착" 버튼은 위치 정보가 한 번도 안 잡혔으면 자동 판정 자체가 불가능하므로 별도 안내로 보낸다.
  function handleArriveClick() {
    if (!locationAvailableRef.current) {
      setNoLocationArriveOpen(true);
      return;
    }
    tryFinish();
  }

  // 위치 정보가 끝내 안 잡힌 채로 "완주로 저장하기"를 선택하면, 자동 판정 없이 코스 공식 거리와
  // 지금까지의 스톱워치 시간을 그대로 수동 확인 화면에 채워서 사용자가 직접 확정하게 한다.
  function startManualCompleteFromNoLocation() {
    if (!course) return;
    setNoLocationArriveOpen(false);
    setPendingManualStatus('COMPLETED');
    setManualDistanceKm((course.distanceM / 1000).toFixed(2));
    setManualMinutes(String(Math.floor(elapsedSec / 60)));
    setManualSeconds(String(elapsedSec % 60));
    clearAllTimers();
    setPhase('manualReview');
  }

  function tryFinish(forceStatus?: 'COMPLETED' | 'STOPPED') {
    if (!course) return;
    const raw = lastRawPositionRef.current;
    const durationSec = elapsedSec;
    const arrivedNear = raw ? haversineMeters(raw, course.positions[course.positions.length - 1]) <= ARRIVAL_TOLERANCE_M : false;

    const status: 'COMPLETED' | 'STOPPED' = forceStatus ?? (arrivedNear ? 'COMPLETED' : 'STOPPED');

    if (!forceStatus && !arrivedNear) {
      setNotArrivedConfirmOpen(true);
      return;
    }

    // 도착(COMPLETED)했으면 "코스대로 달렸다는 가정"으로 코스의 공식 거리를 그대로 쓰고, 중간에
    // 멈춘(STOPPED) 경우에만 GPS로 실제 추적된 진행 거리(maxDistanceAlongM)를 쓴다.
    const distanceM = status === 'COMPLETED' ? Math.round(course.distanceM) : Math.round(maxDistanceAlongM);

    const { avgPaceSecPerKm } = computePaceMetrics(distanceM, durationSec);
    if (avgPaceSecPerKm !== null && avgPaceSecPerKm < IMPOSSIBLE_PACE_SEC_PER_KM) {
      setPendingManualStatus(status);
      setManualDistanceKm((distanceM / 1000).toFixed(2));
      setManualMinutes(String(Math.floor(durationSec / 60)));
      setManualSeconds(String(durationSec % 60));
      clearAllTimers();
      setPhase('manualReview');
      return;
    }

    submitFinish(status, distanceM, durationSec, 'APP');
  }

  function confirmNotArrivedStop() {
    setNotArrivedConfirmOpen(false);
    tryFinish('STOPPED');
  }

  function submitManualReview() {
    const distanceM = Math.round(Number(manualDistanceKm) * 1000);
    const durationSec = Number(manualMinutes) * 60 + Number(manualSeconds);
    if (!Number.isFinite(distanceM) || distanceM <= 0 || !Number.isFinite(durationSec) || durationSec <= 0) return;
    submitFinish(pendingManualStatus, distanceM, durationSec, 'MANUAL');
  }

  const routeForMap: CourseRoute | null = useMemo(
    () => (course ? { id: course.courseId, name: course.courseName, color: '#1259ee', positions: course.positions } : null),
    [course]
  );

  const progressPct = course && course.distanceM > 0 ? Math.min(100, Math.round((maxDistanceAlongM / course.distanceM) * 100)) : 0;

  if (sessionStatus !== 'loading' && !session?.user) {
    return (
      <div className="run-track-page">
        <p className="muted">로그인이 필요해요.</p>
      </div>
    );
  }

  if (phase === 'loading') {
    return (
      <div className="run-track-page">
        <p className="muted">코스 정보를 불러오는 중...</p>
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
      {phase === 'preview' && course && (
        <div className="run-preview">
          <h1>{course.courseName}</h1>
          <p className="muted">{(course.distanceM / 1000).toFixed(1)}km 코스를 따라 실시간으로 달려요.</p>
          {routeForMap && (
            <div className="run-preview-map">
              <CourseMapView routes={[routeForMap]} height={360} />
            </div>
          )}
          <button className="primary-btn full-width run-start-btn" disabled={finishing} onClick={handleStart}>
            {finishing ? '준비 중...' : '출발'}
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

      {phase === 'running' && course && routeForMap && (
        <div className="run-tracking">
          <div className="run-stopwatch">{formatStopwatch(elapsedSec)}</div>
          <div className="run-progress-row">
            <span>{(maxDistanceAlongM / 1000).toFixed(2)}km / {(course.distanceM / 1000).toFixed(1)}km</span>
            <span>{progressPct}%</span>
          </div>
          {!locationAvailable && (
            <p className="run-location-warning">{locationError ?? '위치를 확인하는 중이에요. 지도에 내 위치가 곧 표시돼요.'}</p>
          )}
          <div className="run-tracking-map">
            <CourseMapView
              routes={[routeForMap]}
              height={420}
              center={snappedPos ?? course.positions[0]}
              recenterSignal={recenterSignal}
              defaultZoom={17}
              locationMarker={snappedPos ?? undefined}
            />
          </div>
          <div className="run-action-row">
            <button className="ghost-btn run-cancel-btn" onClick={() => setCancelConfirmOpen(true)}>
              취소
            </button>
            <button className="primary-btn run-arrive-btn" onClick={handleArriveClick}>
              도착
            </button>
          </div>
        </div>
      )}

      {phase === 'manualReview' && (
        <div className="run-manual-review">
          <h2>기록을 확인해주세요</h2>
          <p className="field-error">
            GPS 기록상 페이스가 {formatPace(IMPOSSIBLE_PACE_SEC_PER_KM)}/km보다 빨라서 실제 기록으로 보기 어려워요. 거리와 시간을 직접 확인하고
            저장해주세요.
          </p>
          <label>
            거리(km)
            <input value={manualDistanceKm} onChange={(e) => setManualDistanceKm(e.target.value)} type="number" min="0" step="0.01" />
          </label>
          <div className="run-manual-time-row">
            <label>
              분
              <input value={manualMinutes} onChange={(e) => setManualMinutes(e.target.value)} type="number" min="0" />
            </label>
            <label>
              초
              <input value={manualSeconds} onChange={(e) => setManualSeconds(e.target.value)} type="number" min="0" max="59" />
            </label>
          </div>
          <button className="primary-btn full-width" onClick={submitManualReview}>
            저장
          </button>
        </div>
      )}

      {phase === 'finished' && finishResult && (
        <div className="run-finished">
          <h2>
            {finishResult.status === 'COMPLETED' ? '러닝 완료!' : finishResult.status === 'STOPPED' ? '기록이 저장됐어요' : '러닝이 취소됐어요'}
          </h2>
          {finishResult.status !== 'CANCELLED' && (
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
          )}
          <button className="primary-btn full-width" onClick={() => router.push('/mypage')}>
            마이페이지에서 확인하기
          </button>
        </div>
      )}

      {notArrivedConfirmOpen && (
        <div className="run-modal-overlay">
          <div className="crew-detail-modal" style={{ width: 360 }}>
            <p>아직 목적지에 도착하지 않았습니다. 종료하시겠습니까?</p>
            <div className="crew-battle-actions">
              <button className="ghost-btn" onClick={() => setNotArrivedConfirmOpen(false)}>
                계속 달리기
              </button>
              <button className="primary-btn" onClick={confirmNotArrivedStop}>
                종료하고 저장
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelConfirmOpen && (
        <div className="run-modal-overlay">
          <div className="crew-detail-modal" style={{ width: 360 }}>
            <p>러닝을 취소하시겠습니까? 지금까지의 기록은 저장되지 않아요.</p>
            {!locationAvailable && <p className="muted">위치 정보를 받아올 수 없어서 어차피 기록을 남기기 어려운 상태예요.</p>}
            <div className="crew-battle-actions">
              <button className="ghost-btn" onClick={() => setCancelConfirmOpen(false)}>
                계속 달리기
              </button>
              <button className="primary-btn" onClick={() => { setCancelConfirmOpen(false); finishAsCancelled(); }}>
                취소하기
              </button>
            </div>
          </div>
        </div>
      )}

      {forgotToStopOpen && (
        <div className="run-modal-overlay">
          <div className="crew-detail-modal" style={{ width: 360 }}>
            <p>페이스가 많이 느려졌어요. 도착 버튼을 잊으신 건 아닌가요?</p>
            <div className="crew-battle-actions">
              <button className="primary-btn full-width" onClick={dismissForgotToStopAlert}>
                아직 뛰고 있어요
              </button>
            </div>
          </div>
        </div>
      )}

      {noLocationArriveOpen && (
        <div className="run-modal-overlay">
          <div className="crew-detail-modal" style={{ width: 360 }}>
            <p>위치 정보를 받아올 수 없어서 자동으로 도착을 확인할 수 없어요. 완주하셨다면 직접 확인하고 저장할 수 있어요.</p>
            <div className="crew-battle-actions">
              <button className="ghost-btn" onClick={() => setNoLocationArriveOpen(false)}>
                계속 달리기
              </button>
              <button className="primary-btn" onClick={startManualCompleteFromNoLocation}>
                완주로 저장하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
