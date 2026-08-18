import './otel.mjs';
import { writeFile, unlink } from 'node:fs/promises';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import pg from 'pg';

const { Pool } = pg;
const TABLE_NAME = process.env.DIR_ENVIRONMENT_TABLE_NAME;
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? '60000');
const INITIAL_LOOKBACK_HOURS = Number(process.env.INITIAL_LOOKBACK_HOURS ?? '72');
const RUN_ONCE = process.env.RUN_ONCE === 'true';
const HEALTH_FILE = '/tmp/healthy';
const CHECKPOINT_NAME = 'dir-environment-consumer';
let stopping = false;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }), {
  unmarshallOptions: { wrapNumbers: false }
});
const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT ?? '5432'),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  max: Number(process.env.PGPOOL_MAX ?? '4'),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.PGSSL === 'true'
    ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== 'false' }
    : undefined
});
pool.on('error', (err) => console.error('[dir-environment-consumer] postgres pool error', err));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function checkpoint() {
  const result = await pool.query(
    'SELECT collected_at FROM environment.ingest_consumer_checkpoint WHERE consumer_name = $1',
    [CHECKPOINT_NAME]
  );
  if (result.rowCount > 0) return result.rows[0].collected_at.toISOString();
  return new Date(Date.now() - INITIAL_LOOKBACK_HOURS * 3600000).toISOString();
}

async function scanSince(since) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const result = await ddb.send(new ScanCommand({
      TableName: TABLE_NAME,
      ConsistentRead: true,
      ExclusiveStartKey,
      FilterExpression: 'collectedAt >= :since AND entityType IN (:weather, :air)',
      ExpressionAttributeValues: {
        ':since': since,
        ':weather': 'weather_hourly',
        ':air': 'air_quality_hourly'
      }
    }));
    items.push(...(result.Items ?? []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

function chunks(items, size = 100) {
  const output = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

async function upsertWeather(client, rows) {
  for (const batch of chunks(rows)) {
    const values = [];
    const placeholders = batch.map((row, rowIndex) => {
      const offset = rowIndex * 21;
      values.push(
        row.district, row.nx, row.ny, row.baseDate, row.baseTime, row.forecastDate, row.forecastTime,
        row.skyCondition, row.precipitationType, row.temperatureC, row.minTempC, row.maxTempC,
        row.humidityPct, row.windSpeedMs, row.windDirectionDeg, row.windUMs, row.windVMs,
        row.waveHeightM, row.precipitationProbPct, row.precipitationAmount, row.snowAmount
      );
      return `(${Array.from({ length: 21 }, (_, column) => `$${offset + column + 1}`).join(',')})`;
    });

    await client.query(
      `INSERT INTO environment.weather_hourly
       (district,nx,ny,base_date,base_time,forecast_date,forecast_time,sky_condition,precipitation_type,
        temperature_c,min_temp_c,max_temp_c,humidity_pct,wind_speed_ms,wind_direction_deg,wind_u_ms,
        wind_v_ms,wave_height_m,precipitation_prob_pct,precipitation_amount,snow_amount)
       VALUES ${placeholders.join(',')}
       ON CONFLICT (district,forecast_date,forecast_time) DO UPDATE SET
         nx=EXCLUDED.nx, ny=EXCLUDED.ny, base_date=EXCLUDED.base_date, base_time=EXCLUDED.base_time,
         sky_condition=EXCLUDED.sky_condition, precipitation_type=EXCLUDED.precipitation_type,
         temperature_c=EXCLUDED.temperature_c, min_temp_c=EXCLUDED.min_temp_c, max_temp_c=EXCLUDED.max_temp_c,
         humidity_pct=EXCLUDED.humidity_pct, wind_speed_ms=EXCLUDED.wind_speed_ms,
         wind_direction_deg=EXCLUDED.wind_direction_deg, wind_u_ms=EXCLUDED.wind_u_ms, wind_v_ms=EXCLUDED.wind_v_ms,
         wave_height_m=EXCLUDED.wave_height_m, precipitation_prob_pct=EXCLUDED.precipitation_prob_pct,
         precipitation_amount=EXCLUDED.precipitation_amount, snow_amount=EXCLUDED.snow_amount, collected_at=now()`,
      values
    );
  }
}

async function upsertAirQuality(client, rows) {
  for (const batch of chunks(rows)) {
    const values = [];
    const placeholders = batch.map((row, rowIndex) => {
      const offset = rowIndex * 16;
      values.push(
        row.stationName, row.measuredAt, row.pm10Value, row.pm10Grade, row.pm25Value, row.pm25Grade,
        row.o3Value, row.o3Grade, row.no2Value, row.no2Grade, row.coValue, row.coGrade,
        row.so2Value, row.so2Grade, row.khaiValue, row.khaiGrade
      );
      return `(${Array.from({ length: 16 }, (_, column) => `$${offset + column + 1}`).join(',')})`;
    });

    await client.query(
      `INSERT INTO environment.air_quality_hourly
       (station_name,measured_at,pm10_value,pm10_grade,pm25_value,pm25_grade,o3_value,o3_grade,
        no2_value,no2_grade,co_value,co_grade,so2_value,so2_grade,khai_value,khai_grade)
       VALUES ${placeholders.join(',')}
       ON CONFLICT (station_name,measured_at) DO UPDATE SET
         pm10_value=EXCLUDED.pm10_value, pm10_grade=EXCLUDED.pm10_grade,
         pm25_value=EXCLUDED.pm25_value, pm25_grade=EXCLUDED.pm25_grade,
         o3_value=EXCLUDED.o3_value, o3_grade=EXCLUDED.o3_grade,
         no2_value=EXCLUDED.no2_value, no2_grade=EXCLUDED.no2_grade,
         co_value=EXCLUDED.co_value, co_grade=EXCLUDED.co_grade,
         so2_value=EXCLUDED.so2_value, so2_grade=EXCLUDED.so2_grade,
         khai_value=EXCLUDED.khai_value, khai_grade=EXCLUDED.khai_grade, collected_at=now()`,
      values
    );
  }
}

async function syncOnce() {
  const since = await checkpoint();
  const items = await scanSince(since);
  if (items.length === 0) {
    await writeFile(HEALTH_FILE, new Date().toISOString());
    console.log(JSON.stringify({ event: 'sync_completed', since, itemCount: 0 }));
    return;
  }

  const weather = items.filter((item) => item.entityType === 'weather_hourly');
  const airQuality = items.filter((item) => item.entityType === 'air_quality_hourly');
  const latestCollectedAt = items.reduce(
    (latest, item) => item.collectedAt > latest ? item.collectedAt : latest,
    since
  );
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await upsertWeather(client, weather);
    await upsertAirQuality(client, airQuality);
    await client.query(
      `INSERT INTO environment.ingest_consumer_checkpoint (consumer_name,collected_at,updated_at)
       VALUES ($1,$2,now())
       ON CONFLICT (consumer_name) DO UPDATE SET collected_at=EXCLUDED.collected_at, updated_at=now()`,
      [CHECKPOINT_NAME, latestCollectedAt]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await writeFile(HEALTH_FILE, new Date().toISOString());
  console.log(JSON.stringify({
    event: 'sync_completed', since, latestCollectedAt,
    itemCount: items.length, weatherCount: weather.length, airQualityCount: airQuality.length
  }));
}

async function main() {
  for (const required of ['DIR_ENVIRONMENT_TABLE_NAME', 'PGHOST', 'PGUSER', 'PGPASSWORD', 'PGDATABASE']) {
    if (!process.env[required]) throw new Error(`${required} is required`);
  }
  if (!Number.isFinite(POLL_INTERVAL_MS) || POLL_INTERVAL_MS < 10000) throw new Error('POLL_INTERVAL_MS must be >= 10000');

  while (!stopping) {
    try {
      await syncOnce();
    } catch (error) {
      await unlink(HEALTH_FILE).catch(() => {});
      console.error(JSON.stringify({ event: 'sync_failed', message: error.message, stack: error.stack }));
    }
    if (RUN_ONCE) break;
    await sleep(POLL_INTERVAL_MS);
  }
  await pool.end();
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => { stopping = true; });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
