from copy import deepcopy
from datetime import date

from app import calculate_life, merge_outsole_audit, parse_json, validate_wear_result


def valid_result():
    return {
        "is_usable": True,
        "quality_reason": "",
        "image_quality": {
            name: {"usable": True, "issues": []}
            for name in ("left_outsole", "right_outsole", "heels", "left_side", "right_side")
        },
        "same_pair_check": {
            "consistent": True,
            "mismatched_views": [],
            "reason": "밑창 패턴과 미드솔 형상 및 갑피 색상이 다섯 사진에서 일치합니다.",
            "confidence": 0.94,
        },
        "shoe_type_check": {
            "category": "running",
            "is_supported": True,
            "reason": "곡선형 러닝 미드솔과 분할형 아웃솔 구조가 확인됩니다.",
            "confidence": 0.93,
        },
        "left_outsole": {
            "heel_outer": 2, "heel_inner": 1, "forefoot_outer": 1,
            "forefoot_inner": 1, "outsole_loss": 1, "toe_tip_damage": 0, "outsole_crack": 0,
        },
        "right_outsole": {
            "heel_outer": 2, "heel_inner": 1, "forefoot_outer": 1,
            "forefoot_inner": 1, "outsole_loss": 1, "toe_tip_damage": 0, "outsole_crack": 0,
        },
        "heel_view": {"left_deformation": 1, "right_deformation": 1},
        "left_side": {"midsole_compression": 1, "deep_creasing": 1, "sole_separation": 0},
        "right_side": {"midsole_compression": 1, "deep_creasing": 1, "sole_separation": 0},
        "asymmetry_level": 1,
        "crack_detected": False,
        "structural_damage_detected": False,
        "overall_wear_level": 1,
        "confidence": 0.86,
        "observations": [
            "왼쪽 바깥쪽 뒤꿈치 홈이 일부 낮아졌습니다.",
            "오른쪽 바깥쪽 뒤꿈치에 비슷한 표면 마모가 보입니다.",
            "양쪽 측면에는 얕은 미드솔 주름만 보이고 접착 분리는 없습니다.",
        ],
    }


validated = validate_wear_result(valid_result())
assert validated["quality_metrics"]["derived_wear_level"] in (1, 2)
print("PASS: 정상 5장 분석 통과")

contradiction = valid_result()
for side in ("left_outsole", "right_outsole"):
    for field in contradiction[side]:
        contradiction[side][field] = 0
for field in contradiction["heel_view"]:
    contradiction["heel_view"][field] = 0
for side in ("left_side", "right_side"):
    for field in contradiction[side]:
        contradiction[side][field] = 0
contradiction["asymmetry_level"] = 0
contradiction["overall_wear_level"] = 0
contradiction["observations"][0] = "왼쪽 뒤꿈치에 약간의 마모 흔적이 보입니다."
try:
    validate_wear_result(contradiction)
except ValueError:
    print("PASS: 점수와 관찰 모순 차단")
else:
    raise AssertionError("모순 응답이 통과했습니다.")

severe_mismatch = valid_result()
severe_mismatch["left_side"]["sole_separation"] = 5
severe_mismatch["overall_wear_level"] = 1
corrected_severe = validate_wear_result(severe_mismatch)
assert corrected_severe["overall_wear_level"] >= 3
assert corrected_severe["quality_adjustments"]
print("PASS: 심한 세부 손상과 전체 점수 차이 보정")

bad_photo = valid_result()
bad_photo["is_usable"] = False
bad_photo["quality_reason"] = "오른쪽 측면 사진이 심하게 흐립니다."
bad_photo["image_quality"]["right_side"] = {"usable": False, "issues": ["blur"]}
validated_bad_photo = validate_wear_result(bad_photo)
assert validated_bad_photo["unusable_views"] == ["right_side"]
print("PASS: 재촬영할 사진 위치 반환")

mixed_pair = valid_result()
mixed_pair["is_usable"] = False
mixed_pair["quality_reason"] = "밑창과 측면의 신발 디자인이 서로 다릅니다."
mixed_pair["same_pair_check"] = {
    "consistent": False,
    "mismatched_views": ["left_side", "right_side"],
    "reason": "미드솔 형상과 갑피 재봉선이 밑창 사진의 신발과 일치하지 않습니다.",
    "confidence": 0.91,
}
validated_mixed = validate_wear_result(mixed_pair)
assert validated_mixed["identity_mismatch"] is True
assert validated_mixed["unusable_views"] == ["left_side", "right_side"]
print("PASS: 서로 다른 신발 사진 혼합 차단")

percentage_confidence = valid_result()
percentage_confidence["confidence"] = "90%"
percentage_confidence["same_pair_check"]["confidence"] = 92
normalized = validate_wear_result(percentage_confidence)
assert normalized["confidence"] == 0.9
assert normalized["same_pair_check"]["confidence"] == 0.92
print("PASS: 문자열·백분율 신뢰도 정규화")

clean_with_negative_wording = valid_result()
for side in ("left_outsole", "right_outsole"):
    for field in clean_with_negative_wording[side]:
        clean_with_negative_wording[side][field] = 0
for field in clean_with_negative_wording["heel_view"]:
    clean_with_negative_wording["heel_view"][field] = 0
for side in ("left_side", "right_side"):
    for field in clean_with_negative_wording[side]:
        clean_with_negative_wording[side][field] = 0
clean_with_negative_wording["asymmetry_level"] = 0
clean_with_negative_wording["overall_wear_level"] = 0
clean_with_negative_wording["observations"] = [
    "왼쪽 밑창에서 뚜렷한 마모가 보이지 않습니다.",
    "오른쪽 밑창에서 고무 손실이 관찰되지 않습니다.",
    "양쪽 측면 미드솔에서 비정상적인 압축이 없습니다.",
]
validated_clean = validate_wear_result(clean_with_negative_wording)
assert validated_clean["overall_wear_level"] == 0
print("PASS: 손상 없음 문장을 손상으로 오인하지 않음")

missing_comma_json = '''{
  "is_usable": true,
  "confidence": 0.9
  "observations": ["정상 관찰"]
}'''
repaired_json = parse_json(missing_comma_json)
assert repaired_json["confidence"] == 0.9
assert repaired_json["observations"] == ["정상 관찰"]
print("PASS: 모델 JSON 쉼표 누락 자동 보정")

running_summary = {
    "completed_run_count": 24,
    "total_distance_km": 320.0,
    "average_weekly_distance_km": 20.0,
}
life_with_runs = calculate_life(
    validate_wear_result(valid_result()),
    date.today(),
    running_summary,
)
assert life_with_runs["estimated_remaining_distance_km"] == {"min": 180, "max": 480}
assert life_with_runs["calculation_evidence"]["recorded_total_distance_km"] == 320.0
assert life_with_runs["calculation_type"].endswith("MVP_V4")
print("PASS: 누적거리와 최근 주간거리 수명 계산 반영")

repetitive_observation = valid_result()
repetitive_observation["observations"] = [
    "밑창 바라드리어 바라드리어 바라드리어 바라드리어 바라드리어",
    "미드솔 바라드리어 바라드리어 바라드리어 바라드리어",
    "뒤꿈치 바라드리어 바라드리어 바라드리어 바라드리어",
]
try:
    validate_wear_result(repetitive_observation)
    raise AssertionError("반복된 무의미 관찰이 통과했습니다.")
except ValueError as error:
    assert "반복" in str(error)
print("PASS: 반복된 무의미 모델 관찰 차단")

json_with_extra_text = '{"confidence": 0.88, "is_usable": true}\n추가 설명입니다.'
parsed_with_extra = parse_json(json_with_extra_text)
assert parsed_with_extra == {"confidence": 0.88, "is_usable": True}
print("PASS: 정상 JSON 뒤의 불필요한 모델 출력 무시")

invalid_unicode_json = r'''{
  "message": "밑창에 \\uXXXX 자리표시자가 있습니다",
  "confidence": 0.8
}'''
parsed_invalid_unicode = parse_json(invalid_unicode_json)
assert "\\uXXXX" in parsed_invalid_unicode["message"]
print("PASS: 잘못된 모델 유니코드 이스케이프 파싱 복구")

uncertain_pair = valid_result()
uncertain_pair["same_pair_check"]["confidence"] = 0.60
uncertain_result = validate_wear_result(uncertain_pair)
assert uncertain_result["is_usable"] is False
assert uncertain_result["identity_uncertain"] is True
assert set(uncertain_result["unusable_views"]) == {
    "left_outsole", "right_outsole", "heels", "left_side", "right_side"
}
print("PASS: 동일 신발 여부가 불확실하면 전체 재촬영 요청")

normal_no_damage_values = valid_result()
normal_no_damage_values["heel_view"]["left_deformation"] = None
try:
    validate_wear_result(normal_no_damage_values)
    raise AssertionError("판정 불가능한 null 점수가 마모 없음으로 통과했습니다.")
except ValueError:
    pass
print("PASS: 판정 불가능한 null 점수를 마모 없음 0으로 변환하지 않음")

normal_null_summary_scores = valid_result()
normal_null_summary_scores["asymmetry_level"] = None
try:
    validate_wear_result(normal_null_summary_scores)
    raise AssertionError("판정 불가능한 null 비대칭 점수가 통과했습니다.")
except ValueError:
    pass
print("PASS: 판정 불가능한 null 비대칭 점수 차단")

lifestyle_damage = valid_result()
lifestyle_damage["shoe_type_check"] = {
    "category": "lifestyle",
    "is_supported": True,
    "reason": "평평한 컵솔과 원형 피벗 아웃솔을 가진 일상용 스니커즈입니다.",
    "confidence": 0.96,
}
lifestyle_damage["right_outsole"]["toe_tip_damage"] = 5
lifestyle_damage["right_outsole"]["outsole_crack"] = 4
lifestyle_damage["crack_detected"] = True
lifestyle_damage["structural_damage_detected"] = True
lifestyle_damage["overall_wear_level"] = 4
lifestyle_damage["observations"][1] = (
    "오른쪽 밑창 발가락 끝단에 큰 재료 결손이 있고 앞꿈치 원형 홈을 가로지르는 균열이 보입니다."
)
validated_lifestyle = validate_wear_result(lifestyle_damage)
lifestyle_life = calculate_life(
    validated_lifestyle,
    date(2024, 1, 1),
    {
        "total_distance_km": 200,
        "average_weekly_distance_km": 20,
        "completed_run_count": 30,
        "first_run_at": "2024-01-01T00:00:00",
        "last_run_at": "2024-05-01T00:00:00",
    },
)
assert lifestyle_life["shoe_category"] == "lifestyle"
assert lifestyle_life["running_record_summary"] is None
assert lifestyle_life["estimated_remaining_distance_km"] is None
assert lifestyle_life["estimated_remaining_days"]["max"] <= 14
print("PASS: 생활화는 분석하되 러닝 거리 기준 제외 및 앞쪽 구조 손상 반영")

missed_damage = validate_wear_result(valid_result())
audited_damage = merge_outsole_audit(missed_damage, {
    "left": {
        "toe_tip_damage": 0, "outsole_crack": 0, "material_loss": 0,
        "observation": "왼쪽 밑창 앞쪽 끝단에는 뚜렷한 결손이나 균열이 보이지 않습니다.",
        "confidence": 0.9,
    },
    "right": {
        "toe_tip_damage": 5, "outsole_crack": 4, "material_loss": 5,
        "observation": "오른쪽 밑창 발가락 끝단에 큰 재료 결손이 있고 원형 홈을 가로지르는 균열이 보입니다.",
        "confidence": 0.95,
    },
})
assert audited_damage["right_outsole"]["toe_tip_damage"] == 5
assert audited_damage["right_outsole"]["outsole_crack"] == 4
assert audited_damage["structural_damage_detected"] is True
assert audited_damage["overall_wear_level"] >= 4
assert "큰 재료 결손" in audited_damage["observations"][1]
print("PASS: 손상 점수 병합 규칙이 오른쪽 앞부분 구조 손상을 보수적으로 반영")
