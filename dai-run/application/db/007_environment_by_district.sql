-- environment 지역별(자치구/측정소) 날씨·미세먼지 저장으로 교체.
-- 이전 버전(seoul_environment_daily)은 서울 전체를 평균 낸 하루 1행이라 지역 구분이 없었다 —
-- 실제 요구사항(지역별 저장, API 원본 항목 전체 보존)에 맞지 않아 대체한다.
-- (해당 테이블은 방금 전 반복에서 만든 것으로 실제 서비스 데이터가 아니라 드롭해도 안전하다.)

DROP TABLE IF EXISTS environment.seoul_environment_daily;

CREATE TABLE environment.weather_hourly (
    id                       BIGSERIAL PRIMARY KEY,
    district                 VARCHAR(20) NOT NULL,
    nx                       INTEGER NOT NULL,
    ny                       INTEGER NOT NULL,
    base_date                CHAR(8) NOT NULL,
    base_time                CHAR(4) NOT NULL,
    forecast_date            CHAR(8) NOT NULL,
    forecast_time            CHAR(4) NOT NULL,
    sky_condition            VARCHAR(10),
    precipitation_type       VARCHAR(10),
    temperature_c            NUMERIC(4,1),
    min_temp_c               NUMERIC(4,1),
    max_temp_c               NUMERIC(4,1),
    humidity_pct             NUMERIC(5,2),
    wind_speed_ms            NUMERIC(4,1),
    wind_direction_deg       NUMERIC(5,1),
    wind_u_ms                NUMERIC(5,2),
    wind_v_ms                NUMERIC(5,2),
    wave_height_m            NUMERIC(4,1),
    precipitation_prob_pct   NUMERIC(5,2),
    precipitation_amount     VARCHAR(20),
    snow_amount              VARCHAR(20),
    collected_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (district, forecast_date, forecast_time)
);

CREATE INDEX idx_weather_hourly_lookup ON environment.weather_hourly (district, forecast_date, forecast_time);

CREATE TABLE environment.air_quality_hourly (
    id             BIGSERIAL PRIMARY KEY,
    station_name   VARCHAR(50) NOT NULL,
    measured_at    TIMESTAMPTZ NOT NULL,
    pm10_value     NUMERIC(6,2),
    pm10_grade     VARCHAR(10),
    pm25_value     NUMERIC(6,2),
    pm25_grade     VARCHAR(10),
    o3_value       NUMERIC(6,4),
    o3_grade       VARCHAR(10),
    no2_value      NUMERIC(6,4),
    no2_grade      VARCHAR(10),
    co_value       NUMERIC(6,2),
    co_grade       VARCHAR(10),
    so2_value      NUMERIC(6,4),
    so2_grade      VARCHAR(10),
    khai_value     NUMERIC(6,2),
    khai_grade     VARCHAR(10),
    collected_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (station_name, measured_at)
);

CREATE INDEX idx_air_quality_hourly_lookup ON environment.air_quality_hourly (station_name, measured_at);
