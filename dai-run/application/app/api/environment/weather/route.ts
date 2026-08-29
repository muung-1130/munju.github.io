import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getDistrict, nearestDistrict, SEOUL_DISTRICTS } from '@/lib/region';

export const dynamic = 'force-dynamic';

function nowKstParts() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${kst.getUTCFullYear()}${pad2(kst.getUTCMonth() + 1)}${pad2(kst.getUTCDate())}`,
    time: `${pad2(kst.getUTCHours())}${pad2(kst.getUTCMinutes())}`
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  const districtParam = searchParams.get('district');

  let district: string;
  let source: 'geolocation' | 'district';

  if (lat && lng) {
    const parsedLat = Number(lat);
    const parsedLng = Number(lng);
    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
      return NextResponse.json({ error: 'lat/lng이 올바르지 않아요.' }, { status: 400 });
    }
    district = nearestDistrict(parsedLat, parsedLng).name;
    source = 'geolocation';
  } else if (districtParam && getDistrict(districtParam)) {
    district = districtParam;
    source = 'district';
  } else {
    return NextResponse.json(
      { error: `district 쿼리 파라미터(${SEOUL_DISTRICTS.map((d) => d.name).join(', ')} 중 하나) 또는 lat+lng이 필요해요.` },
      { status: 400 }
    );
  }

  const pool = getPool();
  const { date: nowDate, time: nowTime } = nowKstParts();

  const weatherResult = await pool.query(
    `SELECT forecast_date, forecast_time, sky_condition, precipitation_type, temperature_c,
            humidity_pct, wind_speed_ms, precipitation_prob_pct, precipitation_amount, snow_amount, collected_at
       FROM environment.weather_hourly
      WHERE district = $1
        AND (forecast_date > $2 OR (forecast_date = $2 AND forecast_time >= $3))
      ORDER BY forecast_date, forecast_time
      LIMIT 72`,
    [district, nowDate, nowTime]
  );

  const airResult = await pool.query(
    `SELECT measured_at, pm10_value, pm10_grade, pm25_value, pm25_grade, collected_at
       FROM environment.air_quality_hourly
      WHERE station_name = $1
      ORDER BY measured_at DESC
      LIMIT 1`,
    [district]
  );

  return NextResponse.json({
    district,
    source,
    weather: weatherResult.rows,
    airQuality: airResult.rows[0] ?? null
  });
}
