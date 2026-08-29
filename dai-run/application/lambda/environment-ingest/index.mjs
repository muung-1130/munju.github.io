import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.ENVIRONMENT_TABLE_NAME;
const districts = [
  ['강남구', 61, 125], ['강동구', 63, 126], ['강북구', 60, 128], ['강서구', 57, 127], ['관악구', 59, 125],
  ['광진구', 62, 126], ['구로구', 58, 125], ['금천구', 59, 124], ['노원구', 61, 129], ['도봉구', 61, 129],
  ['동대문구', 61, 127], ['동작구', 59, 125], ['마포구', 59, 127], ['서대문구', 59, 127], ['서초구', 61, 125],
  ['성동구', 61, 126], ['성북구', 60, 128], ['송파구', 62, 125], ['양천구', 58, 126], ['영등포구', 59, 126],
  ['용산구', 60, 126], ['은평구', 59, 128], ['종로구', 60, 127], ['중구', 60, 127], ['중랑구', 62, 127]
].map(([name, nx, ny]) => ({ name, nx, ny }));

const baseTimes = ['0200', '0500', '0800', '1100', '1400', '1700', '2000', '2300'];
const sky = { 1: '맑음', 3: '구름많음', 4: '흐림' };
const pty = { 0: '없음', 1: '비', 2: '비/눈', 3: '눈', 4: '소나기' };
const airGrade = { 1: '좋음', 2: '보통', 3: '나쁨', 4: '매우나쁨' };
const n = (v) => v === undefined || v === null || v === '-' || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
const pad = (v) => String(v).padStart(2, '0');

function latestBase(now = new Date()) {
  const k = new Date(now.getTime() + 9 * 3600000);
  let date = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()));
  const mins = k.getUTCHours() * 60 + k.getUTCMinutes();
  let time = baseTimes.findLast((t) => mins >= Number(t.slice(0, 2)) * 60 + 15);
  if (!time) { date.setUTCDate(date.getUTCDate() - 1); time = '2300'; }
  return { date: `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`, time };
}

async function json(url, label) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  const body = await res.json();
  if (body?.response?.header?.resultCode !== '00') throw new Error(`${label}: ${body?.response?.header?.resultMsg}`);
  return body;
}

async function weather(district, baseDate, baseTime) {
  const u = new URL('https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/getVilageFcst');
  for (const [k, v] of Object.entries({ pageNo: 1, numOfRows: 1000, dataType: 'JSON', base_date: baseDate, base_time: baseTime, nx: district.nx, ny: district.ny, authKey: process.env.WEATHER_API_KEY })) u.searchParams.set(k, v);
  const items = (await json(u, district.name)).response.body.items.item;
  const grouped = new Map();
  for (const item of items) {
    const key = `${item.fcstDate}${item.fcstTime}`;
    const row = grouped.get(key) ?? { district: district.name, nx: district.nx, ny: district.ny, baseDate, baseTime, forecastDate: item.fcstDate, forecastTime: item.fcstTime, values: {} };
    row.values[item.category] = item.fcstValue; grouped.set(key, row);
  }
  return [...grouped.values()].map(({ values, ...r }) => ({ ...r, skyCondition: sky[values.SKY] ?? null, precipitationType: pty[values.PTY] ?? null, temperatureC: n(values.TMP), minTempC: n(values.TMN), maxTempC: n(values.TMX), humidityPct: n(values.REH), windSpeedMs: n(values.WSD), windDirectionDeg: n(values.VEC), windUMs: n(values.UUU), windVMs: n(values.VVV), waveHeightM: n(values.WAV), precipitationProbPct: n(values.POP), precipitationAmount: values.PCP ?? null, snowAmount: values.SNO ?? null }));
}

async function airQuality() {
  const u = new URL('https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty');
  for (const [k, v] of Object.entries({ serviceKey: process.env.AIR_API_KEY, returnType: 'json', numOfRows: 100, pageNo: 1, sidoName: '서울', ver: '1.0' })) u.searchParams.set(k, v);
  const items = (await json(u, '에어코리아')).response.body.items;
  return items.map((x) => ({ stationName: x.stationName, measuredAt: `${x.dataTime}:00+09:00`, pm10Value: n(x.pm10Value), pm10Grade: airGrade[x.pm10Grade] ?? x.pm10Grade ?? null, pm25Value: n(x.pm25Value), pm25Grade: airGrade[x.pm25Grade] ?? x.pm25Grade ?? null, o3Value: n(x.o3Value), o3Grade: airGrade[x.o3Grade] ?? x.o3Grade ?? null, no2Value: n(x.no2Value), no2Grade: airGrade[x.no2Grade] ?? x.no2Grade ?? null, coValue: n(x.coValue), coGrade: airGrade[x.coGrade] ?? x.coGrade ?? null, so2Value: n(x.so2Value), so2Grade: airGrade[x.so2Grade] ?? x.so2Grade ?? null, khaiValue: n(x.khaiValue), khaiGrade: airGrade[x.khaiGrade] ?? x.khaiGrade ?? null }));
}

async function write(items) {
  for (let i = 0; i < items.length; i += 25) {
    let requests = items.slice(i, i + 25).map((Item) => ({ PutRequest: { Item } }));
    for (let attempt = 0; requests.length && attempt < 5; attempt++) {
      const out = await ddb.send(new BatchWriteCommand({ RequestItems: { [TABLE]: requests } }));
      requests = out.UnprocessedItems?.[TABLE] ?? [];
      if (requests.length) await new Promise((r) => setTimeout(r, 100 * 2 ** attempt));
    }
    if (requests.length) throw new Error('DynamoDB unprocessed items remain');
  }
}

export const handler = async () => {
  if (!TABLE || !process.env.WEATHER_API_KEY || !process.env.AIR_API_KEY) throw new Error('ENVIRONMENT_TABLE_NAME, WEATHER_API_KEY, AIR_API_KEY are required');
  const { date, time } = latestBase();
  const weatherRows = (await Promise.all(districts.map((d) => weather(d, date, time)))).flat();
  const airRows = await airQuality();
  const collectedAt = new Date().toISOString();
  await write([
    ...weatherRows.map((x) => ({ pk: `WEATHER#${x.district}`, sk: `${x.forecastDate}#${x.forecastTime}`, entityType: 'weather_hourly', collectedAt, ...x })),
    ...airRows.map((x) => ({ pk: `AIR#${x.stationName}`, sk: x.measuredAt, entityType: 'air_quality_hourly', collectedAt, ...x }))
  ]);
  return { weatherCount: weatherRows.length, airQualityCount: airRows.length, baseDate: date, baseTime: time };
};
