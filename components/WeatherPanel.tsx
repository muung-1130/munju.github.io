'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Card } from '@/components/UI';
import { resolveDefaultDistrict } from '@/lib/region';

type WeatherPoint = {
  forecast_date: string;
  forecast_time: string;
  sky_condition: string | null;
  precipitation_type: string | null;
  temperature_c: string | null;
  humidity_pct: string | null;
  wind_speed_ms: string | null;
  precipitation_prob_pct: string | null;
  collected_at: string;
};

type AirQuality = {
  measured_at: string;
  pm10_value: string | null;
  pm10_grade: string | null;
  pm25_value: string | null;
  pm25_grade: string | null;
  collected_at: string;
} | null;

type WeatherResponse = {
  district: string;
  source: 'geolocation' | 'district';
  weather: WeatherPoint[];
  airQuality: AirQuality;
};

const GRADE_CLASS: Record<string, string> = {
  좋음: 'grade-good',
  보통: 'grade-normal',
  나쁨: 'grade-bad',
  매우나쁨: 'grade-verybad'
};

function weatherIcon(point: WeatherPoint) {
  if (point.precipitation_type && point.precipitation_type !== '없음') {
    return { 비: '🌧️', '비/눈': '🌨️', 눈: '❄️', 소나기: '🌦️' }[point.precipitation_type] ?? '🌦️';
  }
  const hour = Number(point.forecast_time.slice(0, 2));
  const isNight = hour < 6 || hour >= 18;
  if (point.sky_condition === '맑음') return isNight ? '🌙' : '☀️';
  if (point.sky_condition === '구름많음') return '⛅';
  if (point.sky_condition === '흐림') return '☁️';
  return '🌤️';
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

// 화면에 보여주는 기온/습도 등은 가장 가까운 미래 예보 슬롯 값이라, "OO시 기준"이라고 쓰면
// 아직 오지 않은 시각을 근거로 삼은 것처럼 보인다. 실제로 우리가 이 값을 언제 수집했는지
// (collected_at)를 기준 시각으로 표시해서 데이터 신선도를 정직하게 보여준다.
function formatMeasuredAt(measuredAt: string) {
  const kst = new Date(new Date(measuredAt).getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = pad2(kst.getUTCMonth() + 1);
  const d = pad2(kst.getUTCDate());
  const hh = pad2(kst.getUTCHours());
  const mm = pad2(kst.getUTCMinutes());
  return `${y}.${m}.${d} ${hh}:${mm}`;
}

function getKstNow() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

function todayDateStr() {
  const kst = getKstNow();
  return `${kst.getUTCFullYear()}${pad2(kst.getUTCMonth() + 1)}${pad2(kst.getUTCDate())}`;
}

const WEEKDAY_LABEL = ['일', '월', '화', '수', '목', '금', '토'];

function dayLabel(date: string, todayStr: string) {
  if (date === todayStr) return '오늘';
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(4, 6));
  const d = Number(date.slice(6, 8));
  const weekday = WEEKDAY_LABEL[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}/${d} (${weekday})`;
}

// "오늘" 화면은 다음날 새벽 6시까지 이어서 보여준다. 대신 그 시간대를 "내일" 목록에서 지우지는
// 않아서(복사만 하고 splice는 안 함), 다음날로 넘어가도 그 정보가 0시부터 그대로 다시 보인다.
function buildDayPages(weather: WeatherPoint[]) {
  if (weather.length === 0) return [];

  const groupsMap = new Map<string, WeatherPoint[]>();
  for (const point of weather) {
    if (!groupsMap.has(point.forecast_date)) groupsMap.set(point.forecast_date, []);
    groupsMap.get(point.forecast_date)!.push(point);
  }
  const groups = Array.from(groupsMap.entries()).map(([date, items]) => ({ date, items: [...items] }));

  const todayStr = todayDateStr();
  const todayIndex = groups.findIndex((g) => g.date === todayStr);
  if (todayIndex !== -1 && todayIndex + 1 < groups.length) {
    const earlyMorning = groups[todayIndex + 1].items.filter((p) => Number(p.forecast_time.slice(0, 2)) <= 6);
    groups[todayIndex].items.push(...earlyMorning);
  }

  return groups;
}

function HourlyChart({ weather }: { weather: WeatherPoint[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startScrollLeft: number } | null>(null);
  const [pageIndex, setPageIndex] = useState(0);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!scrollRef.current) return;
    dragState.current = { startX: event.clientX, startScrollLeft: scrollRef.current.scrollLeft };
    scrollRef.current.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current || !scrollRef.current) return;
    scrollRef.current.scrollLeft = dragState.current.startScrollLeft - (event.clientX - dragState.current.startX);
  };
  const onPointerUp = () => {
    dragState.current = null;
  };

  const pages = buildDayPages(weather);
  if (pages.length === 0) {
    return <p>날씨 정보를 아직 수집하지 못했어요.</p>;
  }

  const clampedIndex = Math.min(pageIndex, pages.length - 1);
  const page = pages[clampedIndex];
  const todayStr = todayDateStr();

  const stepX = 56;
  const width = Math.max(page.items.length * stepX, 320);
  const chartTop = 34;
  const chartBottom = 118;
  const temps = page.items.map((p) => Number(p.temperature_c));
  const minT = Math.min(...temps);
  const maxT = Math.max(...temps);
  const range = maxT - minT || 1;
  const yFor = (t: number) => chartBottom - ((t - minT) / range) * (chartBottom - chartTop);
  const points = page.items.map((p, i) => [24 + i * stepX, yFor(Number(p.temperature_c))] as [number, number]);
  const linePoints = points.map((p) => p.join(',')).join(' ');
  const areaPath = `M${points[0][0]},${chartBottom} ${points.map((p) => `L${p[0]},${p[1]}`).join(' ')} L${points[points.length - 1][0]},${chartBottom} Z`;

  return (
    <div className="hourly-weather-block">
      <div className="hourly-day-nav">
        <button
          type="button"
          aria-label="이전 날"
          disabled={clampedIndex === 0}
          onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
        >
          ‹
        </button>
        <span>{dayLabel(page.date, todayStr)}</span>
        <button
          type="button"
          aria-label="다음 날"
          disabled={clampedIndex === pages.length - 1}
          onClick={() => setPageIndex((i) => Math.min(pages.length - 1, i + 1))}
        >
          ›
        </button>
      </div>
      <div
        ref={scrollRef}
        className="hourly-weather-scroll"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <svg className="hourly-weather-chart" width={width} height={150} viewBox={`0 0 ${width} 150`} role="img" aria-label="시간대별 날씨 그래프">
          <defs>
            <linearGradient id="hourlyFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#74BDEB" stopOpacity="0.22" />
              <stop offset="1" stopColor="#74BDEB" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#hourlyFill)" />
          <polyline points={linePoints} fill="none" stroke="#74BDEB" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {points.map(([x, y], i) => (
            <g key={`${page.items[i].forecast_date}${page.items[i].forecast_time}`}>
              <circle cx={x} cy={y} r="4" fill="#fff" stroke="#74BDEB" strokeWidth="2.5" />
              <text x={x} y="18" textAnchor="middle" fontSize="18">{weatherIcon(page.items[i])}</text>
              <text x={x} y={y - 10} textAnchor="middle" fontSize="13" fontWeight="800" fill="#3C6E71">{Math.round(temps[i])}°</text>
              <text x={x} y="140" textAnchor="middle" fontSize="11" fontWeight="700" fill="rgba(0,0,0,.55)">{Number(page.items[i].forecast_time.slice(0, 2))}시</text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

export function WeatherPanel() {
  const { data: session, status } = useSession();
  const [data, setData] = useState<WeatherResponse | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;
    const district = resolveDefaultDistrict(session?.user?.dong);
    fetch(`/api/environment/weather?district=${encodeURIComponent(district)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => json && setData(json));
  }, [status, session?.user?.dong]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const res = await fetch(`/api/environment/weather?lat=${latitude}&lng=${longitude}`);
          if (res.ok) setData(await res.json());
        } finally {
          setLocating(false);
        }
      },
      () => setLocating(false),
      { timeout: 8000 }
    );
  }, []);

  const current = data?.weather[0];
  const dust = data?.airQuality;

  return (
    <>
      <Card className="weather-card">
        <h3>
          오늘의 날씨{' '}
          {data && (
            <span className="weather-district">
              {data.district}
              {data.source === 'geolocation' ? ' · 현재 위치' : ''}
              {locating ? ' · 위치 확인 중…' : ''}
            </span>
          )}
        </h3>
        {data ? <HourlyChart key={data.district + data.source} weather={data.weather} /> : <p>날씨 정보를 불러오는 중…</p>}
        {current && (
          <>
            <p>{current.sky_condition} · 습도 {Math.round(Number(current.humidity_pct))}% · 기온 {Number(current.temperature_c).toFixed(1)}°C</p>
            <p>바람 {Number(current.wind_speed_ms).toFixed(1)} m/s · 강수확률 {Math.round(Number(current.precipitation_prob_pct))}%</p>
            <p className="data-source-note">기상청 단기예보 · {formatMeasuredAt(current.collected_at)} 수집 기준</p>
          </>
        )}
      </Card>

      <Card className="dust-card">
        <h3>미세먼지</h3>
        {dust && dust.pm10_grade ? (
          <>
            <strong className={GRADE_CLASS[dust.pm10_grade] ?? ''}>{dust.pm10_grade} 🙂</strong>
            <div className="dust-values">
              <span>PM10 <b>{Math.round(Number(dust.pm10_value))}</b>㎍/m³</span>
              <span>PM2.5 <b>{Math.round(Number(dust.pm25_value))}</b>㎍/m³</span>
            </div>
            <div className="range-bar"><i /></div>
            <p className="data-source-note">에어코리아 · {formatMeasuredAt(dust.collected_at)} 수집 기준</p>
          </>
        ) : (
          <p>{data ? '미세먼지 정보를 아직 수집하지 못했어요.' : '불러오는 중…'}</p>
        )}
      </Card>
    </>
  );
}
