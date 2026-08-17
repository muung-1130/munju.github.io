-- environment.seoul_environment_daily: 서울 날씨/미세먼지 일일 요약 (AI 운동패턴 분석용).
-- 기존 environment.* 테이블들은 기상청/에어코리아 API 원문 컬럼명을 그대로 쓰고 있어(so2Grade, pm10Value 등)
-- 알아보기 쉬운 요약 테이블을 별도로 둔다. observed_date 하루 1행, 재수집 시 upsert.

CREATE TABLE IF NOT EXISTS environment.seoul_environment_daily (
    id                        BIGSERIAL PRIMARY KEY,
    observed_date             DATE NOT NULL UNIQUE,
    collected_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    weather_condition         VARCHAR(20) NOT NULL,
    temperature_c             NUMERIC(4,1) NOT NULL,
    humidity_pct              NUMERIC(5,2),
    wind_speed_ms             NUMERIC(4,1),
    precipitation_prob_pct    NUMERIC(5,2),
    pm10_avg                  NUMERIC(6,2),
    pm10_grade                VARCHAR(10),
    pm25_avg                  NUMERIC(6,2),
    pm25_grade                VARCHAR(10),
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
