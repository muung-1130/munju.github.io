from datetime import datetime, timedelta
from sqlalchemy import text
from sqlalchemy.orm import Session


def get_user_profile(db: Session, user_id: str) -> dict:
    """사용자 프로필과 러닝 선호도 조회"""
    try:
        result = db.execute(
            text("""
            SELECT
                u.user_id, u.nickname, u.dong, u.created_at,
                prefs.difficulty, prefs.running_goal,
                prefs.preferred_distance_m, prefs.target_pace_sec_per_km,
                prefs.weekly_target_distance_m
            FROM auth_user.users u
            LEFT JOIN auth_user.user_running_preferences prefs ON u.user_id = prefs.user_id
            WHERE u.user_id = :user_id
              AND u.status = 'ACTIVE'
              AND u.deleted_at IS NULL
            """),
            {"user_id": user_id}
        )
        row = result.fetchone()

        if not row:
            return {"error": "사용자를 찾을 수 없습니다"}

        return {
            "user_id": row[0],
            "nickname": row[1],
            "district": row[2],
            "created_at": row[3].isoformat() if row[3] else None,
            "difficulty": row[4],
            "running_goal": row[5],
            "preferred_distance_m": row[6],
            "target_pace_sec_per_km": row[7],
            "weekly_target_distance_m": row[8],
        }
    except Exception as e:
        return {"error": f"프로필 조회 실패: {str(e)}"}


def get_recent_runs(db: Session, user_id: str, days: int = 30) -> dict:
    """최근 러닝 기록 조회"""
    try:
        since = datetime.now() - timedelta(days=days)

        result = db.execute(
            text("""
            SELECT
                COUNT(*) as total_runs,
                SUM(COALESCE(distance_m, 0)) as total_distance_m,
                AVG(average_pace_sec_per_km) as avg_pace_sec_per_km,
                MAX(completed_at) as last_run_date
            FROM running_record.runs
            WHERE user_id = :user_id AND completed_at >= :since AND status = 'COMPLETED'
            """),
            {"user_id": user_id, "since": since}
        )
        row = result.fetchone()

        if not row or row[0] == 0:
            return {"total_runs": 0, "message": f"지난 {days}일간 기록이 없습니다"}

        avg_pace_sec = row[2] or 0
        avg_pace_min = int(avg_pace_sec // 60)
        avg_pace_sec_remainder = int(avg_pace_sec % 60)

        return {
            "total_runs": row[0],
            "total_distance_km": round(row[1] / 1000, 2) if row[1] else 0,
            "avg_pace": f"{avg_pace_min}:{avg_pace_sec_remainder:02d}/km",
            "last_run_date": row[3].isoformat() if row[3] else None,
            "period_days": days,
        }
    except Exception as e:
        return {"error": f"러닝 기록 조회 실패: {str(e)}"}


def get_current_weather(db: Session, district: str | None = None) -> dict:
    """서울 지역 현재 날씨 조회 (최신)"""
    try:
        result = db.execute(
            text("""
            SELECT
                forecast_date, forecast_time, district, temperature_c,
                humidity_pct, precipitation_amount, wind_speed_ms,
                sky_condition, precipitation_type
            FROM environment.weather_hourly
            ORDER BY
                CASE
                    WHEN :district IS NOT NULL
                     AND (:district LIKE '%%' || district || '%%'
                          OR district LIKE '%%' || :district || '%%')
                    THEN 0 ELSE 1
                END,
                ABS(
                    TO_DATE(forecast_date, 'YYYYMMDD')
                    - (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date
                ),
                ABS(SUBSTRING(forecast_time, 1, 2)::int
                    - EXTRACT(HOUR FROM CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul'))
            LIMIT 1
            """),
            {"district": district}
        )
        row = result.fetchone()

        if not row:
            return {"message": "최근 날씨 데이터가 없습니다"}

        return {
            "forecast_date": row[0],
            "forecast_time": row[1],
            "district": row[2],
            "temperature_c": row[3],
            "humidity_pct": row[4],
            "precipitation_amount": row[5],
            "wind_speed_ms": row[6],
            "sky_condition": row[7],
            "precipitation_type": row[8],
        }
    except Exception as e:
        return {"error": f"날씨 조회 실패: {str(e)}"}


def get_air_quality(db: Session) -> dict:
    """서울 지역 대기질 정보 (최신)"""
    try:
        result = db.execute(
            text("""
            SELECT
                measured_at, station_name, pm10_value, pm10_grade,
                pm25_value, pm25_grade, o3_value, no2_value, khai_grade
            FROM environment.air_quality_hourly
            ORDER BY measured_at DESC
            LIMIT 1
            """)
        )
        row = result.fetchone()

        if not row:
            return {"message": "최근 대기질 데이터가 없습니다"}

        return {
            "timestamp": row[0].isoformat() if row[0] else None,
            "station_name": row[1],
            "pm10_ug_m3": row[2],
            "pm10_grade": row[3],
            "pm25_ug_m3": row[4],
            "pm25_grade": row[5],
            "o3": row[6],
            "no2": row[7],
            "status": row[8],
        }
    except Exception as e:
        return {"error": f"대기질 조회 실패: {str(e)}"}


def search_nearby_courses(db: Session, latitude: float, longitude: float, radius_m: int = 5000) -> dict:
    """GPS 위치 기준 주변 코스 검색 (PostGIS)"""
    try:
        result = db.execute(
            text("""
            SELECT
                c.course_id, c.course_name, c.difficulty, c.distance_m,
                ROUND(ST_Distance(
                    c.route_geom::geography,
                    ST_Point(:longitude, :latitude, 4326)::geography
                )::numeric, 0) as distance_to_user_m
            FROM course.courses c
            WHERE ST_DWithin(
                c.route_geom::geography,
                ST_Point(:longitude, :latitude, 4326)::geography,
                :radius_m
            )
            AND c.deleted_at IS NULL
            AND c.status = 'ACTIVE'
            ORDER BY distance_to_user_m ASC
            LIMIT 10
            """),
            {"latitude": latitude, "longitude": longitude, "radius_m": radius_m}
        )
        rows = result.fetchall()

        if not rows:
            return {"message": f"{radius_m}m 반경 내 코스가 없습니다", "courses": []}

        courses = []
        for row in rows:
            courses.append({
                "course_id": row[0],
                "name": row[1],
                "difficulty": row[2],
                "distance_km": round(row[3] / 1000, 2) if row[3] else 0,
                "distance_to_user_m": row[4],
            })

        return {
            "count": len(courses),
            "radius_m": radius_m,
            "courses": courses
        }
    except Exception as e:
        return {"error": f"코스 검색 실패: {str(e)}"}


def get_last_run_location(db: Session, user_id: str) -> dict:
    """최근 완료 러닝 경로의 시작 좌표를 조회한다."""
    try:
        row = db.execute(
            text("""
            SELECT
                ST_Y(ST_StartPoint(route_geom)) AS latitude,
                ST_X(ST_StartPoint(route_geom)) AS longitude,
                completed_at
            FROM running_record.runs
            WHERE user_id = :user_id
              AND status = 'COMPLETED'
              AND route_geom IS NOT NULL
            ORDER BY completed_at DESC
            LIMIT 1
            """),
            {"user_id": user_id},
        ).fetchone()
        if not row:
            return {"message": "좌표가 포함된 최근 러닝 기록이 없습니다"}
        return {
            "latitude": float(row[0]),
            "longitude": float(row[1]),
            "completed_at": row[2].isoformat() if row[2] else None,
        }
    except Exception as e:
        return {"error": f"최근 러닝 위치 조회 실패: {str(e)}"}


def get_active_challenges(db: Session, user_id: str) -> dict:
    """사용자의 진행 중인 챌린지 조회"""
    try:
        result = db.execute(
            text("""
            SELECT
                c.challenge_id, c.name, c.challenge_type, c.metric_type,
                c.target_value, cp.progress_value, c.end_at
            FROM challenge.challenges c
            JOIN challenge.challenge_participations cp ON c.challenge_id = cp.challenge_id
            WHERE cp.user_id = :user_id AND c.status = 'ACTIVE' AND cp.status = 'ACTIVE'
            ORDER BY c.end_at ASC
            LIMIT 5
            """),
            {"user_id": user_id}
        )
        rows = result.fetchall()

        if not rows:
            return {"message": "진행 중인 챌린지가 없습니다", "challenges": []}

        challenges = []
        for row in rows:
            progress_pct = (row[5] / row[4] * 100) if row[4] and row[4] > 0 else 0
            challenges.append({
                "challenge_id": row[0],
                "title": row[1],
                "type": row[2],
                "metric": row[3],
                "target": row[4],
                "progress": row[5],
                "progress_pct": round(progress_pct, 1),
                "end_date": row[6].isoformat() if row[6] else None,
            })

        return {
            "count": len(challenges),
            "challenges": challenges
        }
    except Exception as e:
        return {"error": f"챌린지 조회 실패: {str(e)}"}


def format_tool_results(user_profile: dict, recent_runs: dict, weather: dict,
                       air_quality: dict, nearby_courses: dict, challenges: dict) -> str:
    """Tool 결과들을 프롬프트 형식으로 포맷팅"""
    text_parts = []

    if "error" not in user_profile and user_profile.get("user_id"):
        preferences = []
        if user_profile.get("difficulty"):
            preferences.append(f"난이도 {user_profile['difficulty']}")
        if user_profile.get("running_goal"):
            preferences.append(f"목표 {user_profile['running_goal']}")
        if user_profile.get("preferred_distance_m"):
            preferences.append(f"선호 거리 {user_profile['preferred_distance_m']}m")
        if user_profile.get("target_pace_sec_per_km"):
            preferences.append(
                f"목표 페이스 {user_profile['target_pace_sec_per_km']}초/km"
            )
        if preferences:
            text_parts.append("러닝 선호: " + ", ".join(preferences))

    if "error" not in recent_runs and recent_runs.get("total_runs", 0) > 0:
        text_parts.append(
            f"최근 {recent_runs.get('period_days')}일 기록: "
            f"{recent_runs.get('total_runs')}회, "
            f"총 {recent_runs.get('total_distance_km')}km, "
            f"평균 페이스 {recent_runs.get('avg_pace')}"
        )

    if "error" not in weather and weather.get("temperature_c"):
        text_parts.append(
            f"현재 날씨: 기온 {weather.get('temperature_c')}°C, "
            f"습도 {weather.get('humidity_pct')}%, "
            f"강수 {weather.get('precipitation_amount') or '없음'}, "
            f"풍속 {weather.get('wind_speed_ms')}m/s"
        )

    if "error" not in air_quality and air_quality.get("pm10_ug_m3"):
        text_parts.append(
            f"대기질: PM10 {air_quality.get('pm10_ug_m3')}μg/m³, "
            f"PM2.5 {air_quality.get('pm25_ug_m3')}μg/m³, "
            f"상태: {air_quality.get('status')}"
        )

    if "error" not in nearby_courses and nearby_courses.get("count", 0) > 0:
        courses_str = ", ".join([
            f"{c['name']} ({c['distance_km']}km, {c['difficulty']})"
            for c in nearby_courses.get("courses", [])[:3]
        ])
        text_parts.append(f"주변 추천 코스: {courses_str}")

    if "error" not in challenges and challenges.get("count", 0) > 0:
        challenges_str = ", ".join([
            f"{c['title']} ({c['progress_pct']}% 진행)"
            for c in challenges.get("challenges", [])[:2]
        ])
        text_parts.append(f"진행 중인 챌린지: {challenges_str}")

    return "\n".join(text_parts)
