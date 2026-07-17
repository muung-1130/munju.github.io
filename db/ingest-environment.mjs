// 서울 25개 자치구별 기상청 단기예보 전체(시간대별)와 에어코리아 서울 전체 측정소 실시간 측정값을
// environment.weather_hourly / environment.air_quality_hourly에 저장한다.
// 실행: node db/ingest-environment.mjs
//
// 날씨는 자치구마다 API를 한 번씩 호출해야 해서(기상청 API가 격자 단위 조회만 지원) 5개씩 묶어
// 동시 호출한다. 미세먼지는 서울 전체를 한 번에 반환하는 API라 1회만 호출한다.

import { Client } from 'pg';
import { loadEnvFile } from './lib/load-env.mjs';
import { SEOUL_DISTRICTS } from './lib/seoul-districts.mjs';

loadEnvFile(new URL('../.env', import.meta.url));

const BASE_TIMES = ['0200', '0500', '0800', '1100', '1400', '1700', '2000', '2300'];
const PUBLISH_DELAY_MIN = 15;
const CONCURRENCY = 5;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function getLatestBaseDateTime(nowUtc = new Date()) {
  const kst = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const d = kst.getUTCDate();
  const minutesNow = kst.getUTCHours() * 60 + kst.getUTCMinutes();

  let chosenDate = new Date(Date.UTC(y, m, d));
  let chosenTime = null;

  for (let i = BASE_TIMES.length - 1; i >= 0; i -= 1) {
    const slot = BASE_TIMES[i];
    const slotMinutes = Number(slot.slice(0, 2)) * 60 + Number(slot.slice(2));
    if (minutesNow >= slotMinutes + PUBLISH_DELAY_MIN) {
      chosenTime = slot;
      break;
    }
  }

  if (!chosenTime) {
    chosenDate = new Date(Date.UTC(y, m, d - 1));
    chosenTime = BASE_TIMES[BASE_TIMES.length - 1];
  }

  const baseDate = `${chosenDate.getUTCFullYear()}${pad2(chosenDate.getUTCMonth() + 1)}${pad2(chosenDate.getUTCDate())}`;
  return { baseDate, baseTime: chosenTime };
}

const SKY_LABEL = { '1': '맑음', '3': '구름많음', '4': '흐림' };
const PTY_LABEL = { '0': '없음', '1': '비', '2': '비/눈', '3': '눈', '4': '소나기' };

async function fetchDistrictWeather(district, baseDate, baseTime) {
  const url = new URL('https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/getVilageFcst');
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('numOfRows', '1000');
  url.searchParams.set('dataType', 'JSON');
  url.searchParams.set('base_date', baseDate);
  url.searchParams.set('base_time', baseTime);
  url.searchParams.set('nx', String(district.nx));
  url.searchParams.set('ny', String(district.ny));
  url.searchParams.set('authKey', process.env.WEATHER_API_KEY);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`${district.name} 기상청 API 요청 실패: ${res.status}`);
  const data = await res.json();
  if (data?.response?.header?.resultCode !== '00') {
    throw new Error(`${district.name} 기상청 API 오류: ${data?.response?.header?.resultMsg}`);
  }

  const items = data.response.body.items.item;
  const grouped = new Map();
  for (const item of items) {
    const key = `${item.fcstDate}${item.fcstTime}`;
    if (!grouped.has(key)) {
      grouped.set(key, { forecastDate: item.fcstDate, forecastTime: item.fcstTime, values: {} });
    }
    grouped.get(key).values[item.category] = item.fcstValue;
  }

  return [...grouped.values()].map(({ forecastDate, forecastTime, values }) => ({
    district: district.name,
    nx: district.nx,
    ny: district.ny,
    baseDate,
    baseTime,
    forecastDate,
    forecastTime,
    skyCondition: SKY_LABEL[values.SKY] ?? null,
    precipitationType: PTY_LABEL[values.PTY] ?? null,
    temperatureC: values.TMP !== undefined ? Number(values.TMP) : null,
    minTempC: values.TMN !== undefined ? Number(values.TMN) : null,
    maxTempC: values.TMX !== undefined ? Number(values.TMX) : null,
    humidityPct: values.REH !== undefined ? Number(values.REH) : null,
    windSpeedMs: values.WSD !== undefined ? Number(values.WSD) : null,
    windDirectionDeg: values.VEC !== undefined ? Number(values.VEC) : null,
    windUMs: values.UUU !== undefined ? Number(values.UUU) : null,
    windVMs: values.VVV !== undefined ? Number(values.VVV) : null,
    waveHeightM: values.WAV !== undefined ? Number(values.WAV) : null,
    precipitationProbPct: values.POP !== undefined ? Number(values.POP) : null,
    precipitationAmount: values.PCP ?? null,
    snowAmount: values.SNO ?? null
  }));
}

async function runInBatches(items, concurrency, worker) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(worker));
    results.push(...batchResults);
  }
  return results;
}

function toNumberOrNull(value) {
  if (value === undefined || value === null || value === '-' || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// 에어코리아 등급 필드(pm10Grade 등)는 "1"~"4" 코드로 온다 (1=좋음,2=보통,3=나쁨,4=매우나쁨).
const AIR_GRADE_LABEL = { '1': '좋음', '2': '보통', '3': '나쁨', '4': '매우나쁨' };

function toGradeLabel(value) {
  if (value === undefined || value === null || value === '-' || value === '') return null;
  return AIR_GRADE_LABEL[value] ?? value;
}

async function fetchAllStationsAirQuality() {
  const url = new URL('https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty');
  url.searchParams.set('serviceKey', process.env.AIR_API_KEY);
  url.searchParams.set('returnType', 'json');
  url.searchParams.set('numOfRows', '100');
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('sidoName', '서울');
  url.searchParams.set('ver', '1.0');

  const res = await fetch(url);
  if (!res.ok) throw new Error(`에어코리아 API 요청 실패: ${res.status}`);
  const data = await res.json();
  if (data?.response?.header?.resultCode !== '00') {
    throw new Error(`에어코리아 API 오류: ${data?.response?.header?.resultMsg}`);
  }

  return data.response.body.items.map((item) => ({
    stationName: item.stationName,
    // dataTime은 "2026-07-16 19:00" 형식의 KST 문자열(오프셋 없음) — 서버 타임존과 무관하게
    // 정확히 저장되도록 +09:00을 명시해서 timestamptz로 변환한다.
    measuredAt: `${item.dataTime}:00+09:00`,
    pm10Value: toNumberOrNull(item.pm10Value),
    pm10Grade: toGradeLabel(item.pm10Grade),
    pm25Value: toNumberOrNull(item.pm25Value),
    pm25Grade: toGradeLabel(item.pm25Grade),
    o3Value: toNumberOrNull(item.o3Value),
    o3Grade: toGradeLabel(item.o3Grade),
    no2Value: toNumberOrNull(item.no2Value),
    no2Grade: toGradeLabel(item.no2Grade),
    coValue: toNumberOrNull(item.coValue),
    coGrade: toGradeLabel(item.coGrade),
    so2Value: toNumberOrNull(item.so2Value),
    so2Grade: toGradeLabel(item.so2Grade),
    khaiValue: toNumberOrNull(item.khaiValue),
    khaiGrade: toGradeLabel(item.khaiGrade)
  }));
}

async function main() {
  const { baseDate, baseTime } = getLatestBaseDateTime();
  console.log(`기상청 base_date=${baseDate} base_time=${baseTime} 기준으로 25개 구 수집 중...`);

  const weatherRows = (
    await runInBatches(SEOUL_DISTRICTS, CONCURRENCY, (district) => fetchDistrictWeather(district, baseDate, baseTime))
  ).flat();
  console.log(`날씨 ${weatherRows.length}행 수집 완료`);

  console.log('에어코리아 서울 전체 측정소 수집 중...');
  const airRows = await fetchAllStationsAirQuality();
  console.log(`미세먼지 ${airRows.length}개 측정소 수집 완료`);

  const client = new Client({
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE
  });
  await client.connect();

  try {
    for (const row of weatherRows) {
      await client.query(
        `INSERT INTO environment.weather_hourly
           (district, nx, ny, base_date, base_time, forecast_date, forecast_time, sky_condition,
            precipitation_type, temperature_c, min_temp_c, max_temp_c, humidity_pct, wind_speed_ms,
            wind_direction_deg, wind_u_ms, wind_v_ms, wave_height_m, precipitation_prob_pct,
            precipitation_amount, snow_amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         ON CONFLICT (district, forecast_date, forecast_time) DO UPDATE SET
           base_date = EXCLUDED.base_date,
           base_time = EXCLUDED.base_time,
           sky_condition = EXCLUDED.sky_condition,
           precipitation_type = EXCLUDED.precipitation_type,
           temperature_c = EXCLUDED.temperature_c,
           min_temp_c = EXCLUDED.min_temp_c,
           max_temp_c = EXCLUDED.max_temp_c,
           humidity_pct = EXCLUDED.humidity_pct,
           wind_speed_ms = EXCLUDED.wind_speed_ms,
           wind_direction_deg = EXCLUDED.wind_direction_deg,
           wind_u_ms = EXCLUDED.wind_u_ms,
           wind_v_ms = EXCLUDED.wind_v_ms,
           wave_height_m = EXCLUDED.wave_height_m,
           precipitation_prob_pct = EXCLUDED.precipitation_prob_pct,
           precipitation_amount = EXCLUDED.precipitation_amount,
           snow_amount = EXCLUDED.snow_amount,
           collected_at = now()`,
        [
          row.district, row.nx, row.ny, row.baseDate, row.baseTime, row.forecastDate, row.forecastTime,
          row.skyCondition, row.precipitationType, row.temperatureC, row.minTempC, row.maxTempC,
          row.humidityPct, row.windSpeedMs, row.windDirectionDeg, row.windUMs, row.windVMs,
          row.waveHeightM, row.precipitationProbPct, row.precipitationAmount, row.snowAmount
        ]
      );
    }

    for (const row of airRows) {
      await client.query(
        `INSERT INTO environment.air_quality_hourly
           (station_name, measured_at, pm10_value, pm10_grade, pm25_value, pm25_grade, o3_value, o3_grade,
            no2_value, no2_grade, co_value, co_grade, so2_value, so2_grade, khai_value, khai_grade)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (station_name, measured_at) DO UPDATE SET
           pm10_value = EXCLUDED.pm10_value, pm10_grade = EXCLUDED.pm10_grade,
           pm25_value = EXCLUDED.pm25_value, pm25_grade = EXCLUDED.pm25_grade,
           o3_value = EXCLUDED.o3_value, o3_grade = EXCLUDED.o3_grade,
           no2_value = EXCLUDED.no2_value, no2_grade = EXCLUDED.no2_grade,
           co_value = EXCLUDED.co_value, co_grade = EXCLUDED.co_grade,
           so2_value = EXCLUDED.so2_value, so2_grade = EXCLUDED.so2_grade,
           khai_value = EXCLUDED.khai_value, khai_grade = EXCLUDED.khai_grade,
           collected_at = now()`,
        [
          row.stationName, row.measuredAt, row.pm10Value, row.pm10Grade, row.pm25Value, row.pm25Grade,
          row.o3Value, row.o3Grade, row.no2Value, row.no2Grade, row.coValue, row.coGrade,
          row.so2Value, row.so2Grade, row.khaiValue, row.khaiGrade
        ]
      );
    }
    console.log('저장 완료');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
