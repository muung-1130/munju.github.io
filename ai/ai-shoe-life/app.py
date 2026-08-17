import json
import os
import re
from datetime import date, datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from typing import Annotated
from uuid import UUID, uuid4

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, ImageOps, UnidentifiedImageError


app = FastAPI()
DEMO_FILE = Path(__file__).with_name("demo.html")

ALLOWED_TYPES = {
    "image/jpeg": "jpeg",
    "image/jpg": "jpeg",
    "image/pjpeg": "jpeg",
    "image/png": "png",
    "image/webp": "webp",
}
MAX_FILE_SIZE = 5 * 1024 * 1024
MIN_SHORT_SIDE_PX = 480
MAX_IMAGE_PIXELS = 25_000_000

IMAGE_ROLES = (
    "left_outsole",
    "right_outsole",
    "heels",
    "left_side",
    "right_side",
)

QUALITY_LABELS = {
    "left_outsole": "왼쪽 밑창 전체",
    "right_outsole": "오른쪽 밑창 전체",
    "heels": "양쪽 뒤꿈치 정면",
    "left_side": "왼쪽 신발 바깥쪽 측면",
    "right_side": "오른쪽 신발 바깥쪽 측면",
}

PROMPT = """
당신은 러닝화 사진에서 눈으로 확인 가능한 외관 마모만 구조화하는 비전 분석기입니다.
의학적 진단, 부상 예측, 내부 쿠션 성능 확정, 남은 거리나 남은 기간 계산을 하지 마세요.

입력 사진은 정확히 다음 순서와 용도입니다. 각 입력 한 장의 위쪽에는 원본, 아래쪽에는
서버가 같은 원본에서 자동으로 잘라낸 핵심 부위 확대가 들어 있습니다. 별도의 신발 사진이 아닙니다.
1. 왼쪽 밑창 전체: 뒤꿈치·앞꿈치의 안쪽/바깥쪽 및 발가락 끝단의 마모와 고무 손실
2. 오른쪽 밑창 전체: 뒤꿈치·앞꿈치의 안쪽/바깥쪽 및 발가락 끝단의 마모와 고무 손실
3. 양쪽 뒤꿈치 정면: 좌우 기울어짐, 비대칭 변형
4. 왼쪽 신발 바깥쪽 측면: 미드솔 압축, 깊은 주름, 밑창 접착 분리
5. 오른쪽 신발 바깥쪽 측면: 미드솔 압축, 깊은 주름, 밑창 접착 분리

먼저 사진별 촬영 품질을 판정하세요. 다음 중 하나라도 핵심 부위를 판독하지 못하게 하면 usable=false입니다.
- 다른 각도의 사진, 좌우 사진 중복 또는 누락
- 심한 흐림, 어두움, 반사, 잘림, 지나치게 먼 촬영
- 밑창 전체 또는 측면 미드솔이 보이지 않음
- 러닝화가 아닌 이미지

러닝화와 일상용 스니커즈(생활화)는 분석 대상입니다. shoe_type_check.category를
running 또는 lifestyle로 구분하고 근거를 적으세요. 구두, 슬리퍼, 샌들처럼 이 두 범주가
아닌 신발만 unsupported로 판정해 is_usable=false로 설정하세요.
평평한 컵솔과 원형 피벗 밑창이 뚜렷하면 lifestyle이며, 러닝화로 분류하지 마세요.

그다음 다섯 사진이 동일한 한 켤레인지 반드시 교차 확인하세요.
- 갑피의 색상·메시 조직·재봉선·보강재 형상
- 미드솔의 색상·두께·성형 패턴
- 아웃솔 고무 블록의 배치와 좌우 대칭 관계
- 뒤꿈치 카운터와 측면 사진의 디자인 연결
서로 다른 신발이나 서로 다른 상태의 사진을 섞은 것으로 보이면 추정하지 말고
same_pair_check.consistent=false와 is_usable=false로 설정하세요.
불일치가 의심되는 사진 역할을 mismatched_views에 넣으세요.
같은 신발이라고 판단한 경우에도 same_pair_check.reason에 밑창 패턴, 미드솔 형상,
갑피 디자인, 색상 중 최소 두 가지를 비교한 구체적인 근거를 작성하세요.
동일 신발 여부의 confidence가 0.75 미만이면 억지로 분석하지 말고 is_usable=false로 설정하세요.

마모 점수는 모두 0~5 정수입니다.
- 0: 마모 또는 변형이 보이지 않음
- 1: 매우 약한 표면 마모나 얕은 주름
- 2: 국소적인 홈 감소, 평탄화 또는 압축 흔적
- 3: 뚜렷한 홈 소실, 편마모, 미드솔 압축 또는 깊은 주름
- 4: 넓은 고무 손실, 심한 비대칭, 뚜렷한 접착 분리 또는 변형
- 5: 바닥층 노출, 큰 균열·박리, 구조적 손상이 명확함

판정 규칙:
- 흙, 먼지, 색 변화만으로 마모 점수를 올리지 마세요.
- 밑창에 원래부터 성형된 홈·원형 무늬가 있다는 사실 자체를 균열이나 손상으로 판정하지 마세요.
- 반대로 패턴이 남아 있다는 이유만으로 "마모가 없다"고 단정하지 마세요. 홈 깊이 감소,
  고무 블록 모서리의 둥글어짐, 표면 평탄화, 좌우·안팎 차이, 국소 재료 손실을 함께 비교하세요.
- 사진의 맨 위쪽에 보이는 발가락 끝단(toe tip)을 빠뜨리지 마세요. 끝단의 고무가 패였거나
  뜯김·찍힘·마모·들뜸·접착 분리처럼 보이면 위치와 형태를 관찰 문장에 명시하고,
  forefoot 점수와 outsole_loss 또는 sole_separation 점수에 일관되게 반영하세요.
- 왼쪽·오른쪽 발가락 끝단 확대 이미지와 전체 밑창 이미지를 반드시 함께 비교하세요.
  확대 이미지에서 끝단 윤곽이 끊기거나 패이고 고무가 떨어져 나간 부분이 보이면
  전체 패턴이 남아 있더라도 "마모가 거의 없다" 또는 "매우 잘 보존됐다"고 표현하지 마세요.
- 사진만으로 홈의 실제 깊이를 측정할 수 없으면 "깊이가 유지된다"고 확정하지 말고
  "사진상 패턴 경계가 보이지만 실제 홈 깊이는 측정할 수 없음"이라고 한계를 적으세요.
- 미드솔 주름만으로 내부 쿠션이 죽었다고 확정하지 마세요.
- 측면 미드솔은 단순한 제조 성형선이나 얕은 표면 주름과 실제 압축 변형을 구분하세요.
  주름의 위치·길이·깊이, 여러 주름이 한곳에 몰리는지, 미드솔 높이가 국소적으로 낮아졌는지,
  좌우 차이가 있는지를 측면 원본과 확대 이미지에서 비교하세요. 실제로 보이는 구김을 누락하지 마세요.
- 갑피와 미드솔 또는 미드솔과 아웃솔 경계에 틈, 들뜸, 벌어짐, 찢김이 보이면
  접착 분리 가능성을 위치와 함께 적으세요. 그림자나 오염선만으로 분리라고 확정하지 마세요.
- 뒤꿈치는 양쪽 뒤축의 높이와 중심선을 비교하고, 뒤꿈치 고무의 닳음, 모서리 손실,
  뒤축 찌그러짐·기울어짐·비대칭, 접착부 벌어짐을 확인하세요. 손상이 보이면
  "평평하다" 또는 "변형이 없다"는 포괄적인 문장으로 덮지 말고 위치와 형태를 명시하세요.
- 보이지 않는 부위는 추측하지 말고 해당 사진을 unusable로 처리하세요.
- 세부 점수 중 하나가 4 이상이면 overall_wear_level은 최소 3이어야 합니다.
- crack_detected 또는 structural_damage_detected가 true면 관찰 근거를 반드시 적으세요.
- observations에는 사진 역할별로 정확히 5개를 다음 순서로 적으세요: 왼쪽 밑창, 오른쪽 밑창,
  양쪽 뒤축, 왼쪽 측면 미드솔, 오른쪽 측면 미드솔. 마모가 없어도 없다고 판단한 시각적 근거를 적으세요.
- 각 밑창 observation에는 반드시 ① 관찰 위치(뒤꿈치/앞꿈치/발가락 끝단 및 안쪽/바깥쪽),
  ② 홈·고무 블록 모서리·평탄화·재료 손실 중 실제로 보이는 특징,
  ③ 반대쪽 밑창과 비교한 차이, ④ 사진으로 판단할 수 없는 한계를 포함하세요.
- 뒤축 observation에는 좌우 높이, 수직 정렬, 한쪽 쏠림 또는 비대칭 여부를 근거와 함께 적으세요.
- 뒤축 observation에는 뒤꿈치 아래 고무의 마모·재료 손실·접착 분리 여부도 반드시 적으세요.
- 측면 observation에는 미드솔 주름의 위치와 깊이, 국소적인 높이 감소, 압축 비대칭,
  갑피-미드솔 및 미드솔-아웃솔 접착 분리 여부를 적으세요.
- "상태가 좋습니다", "잘 보존되어 있습니다", "유사합니다" 같은 포괄적 평가만 쓰지 마세요.
  무엇이 얼마나 보이거나 보이지 않는지를 구체적으로 적으세요.
- observations는 자연스러운 한국어 완전한 문장으로 작성하고 같은 단어나 구절을 반복하지 마세요.
- 각 observation에는 신발 부위(밑창, 뒤꿈치, 뒤축, 미드솔, 측면 등)와 관찰 근거를 포함하세요.
- 한국어는 그대로 출력하고 \\uXXXX 같은 유니코드 이스케이프나 자리표시자를 사용하지 마세요.
- confidence와 same_pair_check.confidence는 반드시 0~1 사이 소수로 출력하세요. 백분율이나 문자열을 쓰지 마세요.
- is_usable=true이면 모든 마모·변형 점수는 반드시 0~5 정수여야 하며 null을 쓰지 마세요.
- 눈에 보이는 손상이나 변형이 없으면 null이나 "없음" 대신 숫자 0을 출력하세요.

반드시 아래 JSON 구조만 출력하세요. 설명문, 마크다운, 코드블록을 붙이지 마세요.
사진이 unusable이어도 모든 키는 유지하고 사용하지 않을 점수에는 임시 숫자 0을 넣으세요.
단, is_usable=false인 결과의 점수는 서버가 수명 계산에 사용하지 않습니다.
{
  "is_usable": true,
  "quality_reason": "",
  "image_quality": {
    "left_outsole": {"usable": true, "issues": []},
    "right_outsole": {"usable": true, "issues": []},
    "heels": {"usable": true, "issues": []},
    "left_side": {"usable": true, "issues": []},
    "right_side": {"usable": true, "issues": []}
  },
  "same_pair_check": {
    "consistent": true,
    "mismatched_views": [],
    "reason": "",
    "confidence": null
  },
  "shoe_type_check": {
    "category": "running",
    "is_supported": true,
    "reason": "",
    "confidence": null
  },
  "left_outsole": {
    "heel_outer": null,
    "heel_inner": null,
    "forefoot_outer": null,
    "forefoot_inner": null,
    "outsole_loss": null,
    "toe_tip_damage": null,
    "outsole_crack": null
  },
  "right_outsole": {
    "heel_outer": null,
    "heel_inner": null,
    "forefoot_outer": null,
    "forefoot_inner": null,
    "outsole_loss": null,
    "toe_tip_damage": null,
    "outsole_crack": null
  },
  "heel_view": {
    "left_deformation": null,
    "right_deformation": null
  },
  "left_side": {
    "midsole_compression": null,
    "deep_creasing": null,
    "sole_separation": null
  },
  "right_side": {
    "midsole_compression": null,
    "deep_creasing": null,
    "sole_separation": null
  },
  "asymmetry_level": null,
  "crack_detected": false,
  "structural_damage_detected": false,
  "overall_wear_level": null,
  "confidence": null,
  "observations": []
}
"""


def _nullable_score_object(fields: list[str]) -> dict:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": fields,
        "properties": {
            field: {"type": "integer", "minimum": 0, "maximum": 5}
            for field in fields
        },
    }


IMAGE_QUALITY_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": list(IMAGE_ROLES),
    "properties": {
        role: {
            "type": "object",
            "additionalProperties": False,
            "required": ["usable", "issues"],
            "properties": {
                "usable": {"type": "boolean"},
                "issues": {"type": "array", "items": {"type": "string"}, "maxItems": 5},
            },
        }
        for role in IMAGE_ROLES
    },
}

WEAR_OUTPUT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "is_usable", "quality_reason", "image_quality", "same_pair_check", "shoe_type_check",
        "left_outsole", "right_outsole", "heel_view", "left_side", "right_side",
        "asymmetry_level", "crack_detected", "structural_damage_detected",
        "overall_wear_level", "confidence", "observations",
    ],
    "properties": {
        "is_usable": {"type": "boolean"},
        "quality_reason": {"type": "string", "maxLength": 300},
        "image_quality": IMAGE_QUALITY_SCHEMA,
        "same_pair_check": {
            "type": "object",
            "additionalProperties": False,
            "required": ["consistent", "mismatched_views", "reason", "confidence"],
            "properties": {
                "consistent": {"type": "boolean"},
                "mismatched_views": {
                    "type": "array",
                    "items": {"type": "string", "enum": list(IMAGE_ROLES)},
                    "uniqueItems": True,
                },
                "reason": {"type": "string", "maxLength": 300},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            },
        },
        "shoe_type_check": {
            "type": "object",
            "additionalProperties": False,
            "required": ["category", "is_supported", "reason", "confidence"],
            "properties": {
                "category": {"type": "string", "enum": ["running", "lifestyle", "unsupported"]},
                "is_supported": {"type": "boolean"},
                "reason": {"type": "string", "minLength": 10, "maxLength": 300},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            },
        },
        "left_outsole": _nullable_score_object([
            "heel_outer", "heel_inner", "forefoot_outer", "forefoot_inner", "outsole_loss",
            "toe_tip_damage", "outsole_crack"
        ]),
        "right_outsole": _nullable_score_object([
            "heel_outer", "heel_inner", "forefoot_outer", "forefoot_inner", "outsole_loss",
            "toe_tip_damage", "outsole_crack"
        ]),
        "heel_view": _nullable_score_object(["left_deformation", "right_deformation"]),
        "left_side": _nullable_score_object([
            "midsole_compression", "deep_creasing", "sole_separation"
        ]),
        "right_side": _nullable_score_object([
            "midsole_compression", "deep_creasing", "sole_separation"
        ]),
        "asymmetry_level": {"type": "integer", "minimum": 0, "maximum": 5},
        "crack_detected": {"type": "boolean"},
        "structural_damage_detected": {"type": "boolean"},
        "overall_wear_level": {"type": "integer", "minimum": 0, "maximum": 5},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "observations": {
            "type": "array",
            "items": {"type": "string", "minLength": 30, "maxLength": 350},
            "minItems": 5,
            "maxItems": 5,
        },
    },
}

RETRY_PROMPT = """
이전 응답이 스키마, 필수 점수 또는 관찰과의 일관성 검증에 실패했습니다.
사진 다섯 장을 처음부터 다시 독립적으로 관찰하고, 검증 실패 원인을 바로잡은 JSON만 출력하세요.
이전 숫자를 그대로 복사하지 마세요.
"""

OUTSOLE_AUDIT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["left", "right"],
    "properties": {
        side: {
            "type": "object",
            "additionalProperties": False,
            "required": ["toe_tip_damage", "outsole_crack", "material_loss", "observation", "confidence"],
            "properties": {
                "toe_tip_damage": {"type": "integer", "minimum": 0, "maximum": 5},
                "outsole_crack": {"type": "integer", "minimum": 0, "maximum": 5},
                "material_loss": {"type": "integer", "minimum": 0, "maximum": 5},
                "observation": {"type": "string", "minLength": 20, "maxLength": 350},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            },
        }
        for side in ("left", "right")
    },
}

OUTSOLE_AUDIT_PROMPT = """
당신은 신발 밑창의 앞꿈치와 발가락 끝단 손상만 재검사하는 독립 검수자입니다.
왼쪽과 오른쪽 밑창의 전체 사진 및 각 사진의 발가락 끝단 확대 이미지가 제공됩니다.
기존 분석 결과는 보지 말고 이미지에서 다음을 각각 판정하세요.
- 발가락 끝단의 패임, 뜯김, 찍힘, 가장자리 결손
- 밑창 홈을 가로지르는 균열이나 찢김
- 고무 또는 바닥 재료가 실제로 떨어져 나간 부분
원래 성형된 홈과 오염은 손상으로 세지 마세요. 반대로 큰 구멍, 끊어진 윤곽,
홈을 가로지르는 불규칙한 선은 패턴이 남아 있다는 이유로 정상 처리하지 마세요.
점수는 0(없음)~5(매우 심함) 정수이며, observation에는 위치와 눈에 보이는 형태를
한국어로 구체적으로 적으세요. 반드시 도구의 구조로 결과를 제출하세요.
"""


class GuardrailBlockedError(Exception):
    pass


class AnalysisRejectedError(Exception):
    pass


class PersistenceError(Exception):
    pass


def parse_json(text: str) -> dict:
    cleaned = text.strip().replace("```json", "").replace("```", "").strip()
    object_start = cleaned.find("{")
    if object_start < 0:
        raise ValueError("모델 응답에서 JSON을 찾지 못했습니다.")
    candidate = cleaned[object_start:]
    decoder = json.JSONDecoder()

    # Nova가 긴 JSON에서 가끔 다음 key 앞의 쉼표 하나를 누락한다.
    # JSON 파서가 정확히 쉼표 누락을 지목할 때만 해당 위치를 보정하며,
    # 스키마나 분석 점수 자체는 이후 품질 게이트에서 그대로 검증한다.
    for _ in range(20):
        try:
            # raw_decode는 첫 JSON 객체까지만 읽으므로 모델이 뒤에 설명이나
            # 두 번째 JSON을 붙여도 정상 분석 객체는 안전하게 분리할 수 있다.
            parsed, _ = decoder.raw_decode(candidate)
            if not isinstance(parsed, dict):
                raise ValueError("모델 JSON 최상위 값은 객체여야 합니다.")
            return parsed
        except json.JSONDecodeError as error:
            if error.msg == "Invalid \\uXXXX escape":
                repaired = re.sub(
                    r"\\u(?![0-9a-fA-F]{4})",
                    r"\\\\u",
                    candidate,
                )
                if repaired == candidate:
                    # 오류 위치가 \\u 내부를 가리키는 경우 해당 escape의
                    # 시작 백슬래시만 이스케이프해 일반 문자열로 보존한다.
                    search_start = max(0, error.pos - 8)
                    slash_pos = candidate.rfind("\\u", search_start, error.pos + 2)
                    if slash_pos < 0:
                        raise
                    repaired = candidate[:slash_pos] + "\\" + candidate[slash_pos:]
                candidate = repaired
                continue
            if error.msg != "Expecting ',' delimiter":
                raise
            candidate = candidate[:error.pos] + "," + candidate[error.pos:]
    parsed, _ = decoder.raw_decode(candidate)
    return parsed


def _score(result: dict, group: str, field: str) -> int:
    section = result.get(group)
    if not isinstance(section, dict) or field not in section:
        raise ValueError(f"모델 응답에 {group}.{field} 필드가 없습니다.")
    value = section[field]
    if isinstance(value, bool):
        raise ValueError(f"{group}.{field}가 유효한 점수가 아닙니다.")
    if value is None:
        raise ValueError(f"{group}.{field}가 유효한 점수가 아닙니다.")
    if isinstance(value, str):
        cleaned = value.strip().lower()
        numeric_match = re.fullmatch(r"([0-5])(?:\.0)?(?:\s*점)?", cleaned)
        if numeric_match:
            value = numeric_match.group(1)
    if isinstance(value, float) and not value.is_integer():
        raise ValueError(f"{group}.{field}는 0~5 정수여야 합니다.")
    try:
        number = int(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{group}.{field}가 숫자가 아닙니다.") from error
    if not 0 <= number <= 5:
        raise ValueError(f"{group}.{field} 점수가 0~5 범위를 벗어났습니다.")
    section[field] = number
    return number


def _normalize_confidence(value, field: str, default: float = 0.5) -> float:
    if value is None or value == "":
        return default
    if isinstance(value, bool):
        raise ValueError(f"{field}가 유효한 신뢰도가 아닙니다.")
    if isinstance(value, str):
        cleaned = value.strip().lower()
        labels = {
            "높음": 0.85,
            "중간": 0.65,
            "낮음": 0.40,
            "high": 0.85,
            "medium": 0.65,
            "low": 0.40,
        }
        if cleaned in labels:
            return labels[cleaned]
        is_percent = cleaned.endswith("%")
        cleaned = cleaned.rstrip("%").strip()
        try:
            number = float(cleaned)
        except ValueError as error:
            raise ValueError(f"{field}가 숫자로 변환될 수 없습니다.") from error
        if is_percent:
            number /= 100
    else:
        try:
            number = float(value)
        except (TypeError, ValueError) as error:
            raise ValueError(f"{field}가 숫자가 아닙니다.") from error
    if 1 < number <= 100:
        number /= 100
    if not 0 <= number <= 1:
        raise ValueError(f"{field}는 0~1 또는 0~100 백분율이어야 합니다.")
    return round(number, 4)


def _derived_wear_level(result: dict) -> tuple[int, dict]:
    outsole_fields = (
        "heel_outer", "heel_inner", "forefoot_outer", "forefoot_inner", "outsole_loss",
        "toe_tip_damage", "outsole_crack"
    )
    outsole_scores = [
        result[side][field]
        for side in ("left_outsole", "right_outsole")
        for field in outsole_fields
    ]
    heel_scores = list(result["heel_view"].values())
    side_scores = [
        result[side][field]
        for side in ("left_side", "right_side")
        for field in ("midsole_compression", "deep_creasing", "sole_separation")
    ]

    outsole_average = sum(outsole_scores) / len(outsole_scores)
    heel_average = sum(heel_scores) / len(heel_scores)
    side_average = sum(side_scores) / len(side_scores)
    hotspot = max(outsole_scores + heel_scores + side_scores)
    weighted = (
        outsole_average * 0.45
        + side_average * 0.25
        + heel_average * 0.10
        + result["asymmetry_level"] * 0.05
        + hotspot * 0.15
    )
    derived = max(0, min(5, round(weighted)))
    if hotspot >= 4:
        derived = max(derived, 3)
    if result["crack_detected"] or result["structural_damage_detected"]:
        derived = max(derived, 4)

    metrics = {
        "outsole_average": round(outsole_average, 2),
        "heel_deformation_average": round(heel_average, 2),
        "side_midsole_average": round(side_average, 2),
        "highest_visible_damage_score": hotspot,
        "derived_wear_level": derived,
    }
    return derived, metrics


def validate_wear_result(result: dict) -> dict:
    required = (
        "is_usable", "quality_reason", "image_quality", "same_pair_check", "shoe_type_check", "left_outsole",
        "right_outsole", "heel_view", "left_side", "right_side",
        "asymmetry_level", "crack_detected", "structural_damage_detected",
        "overall_wear_level", "confidence", "observations",
    )
    missing = [name for name in required if name not in result]
    if missing:
        raise ValueError(f"모델 응답에 필수 필드가 없습니다: {', '.join(missing)}")
    if not isinstance(result["is_usable"], bool):
        raise ValueError("is_usable은 boolean이어야 합니다.")

    shoe_type = result["shoe_type_check"]
    if (
        not isinstance(shoe_type, dict)
        or shoe_type.get("category") not in {"running", "lifestyle", "unsupported"}
        or not isinstance(shoe_type.get("is_supported"), bool)
    ):
        raise ValueError("shoe_type_check가 유효하지 않습니다.")
    shoe_type["confidence"] = _normalize_confidence(
        shoe_type.get("confidence"), "shoe_type_check.confidence"
    )
    if len(str(shoe_type.get("reason", "")).strip()) < 10:
        raise ValueError("러닝화 종류 판정 근거가 너무 짧습니다.")

    image_quality = result["image_quality"]
    if not isinstance(image_quality, dict):
        raise ValueError("image_quality는 객체여야 합니다.")
    unusable_views = []
    for role in IMAGE_ROLES:
        quality = image_quality.get(role)
        if not isinstance(quality, dict):
            raise ValueError(f"image_quality.{role}가 없습니다.")
        if not isinstance(quality.get("usable"), bool):
            raise ValueError(f"image_quality.{role}.usable은 boolean이어야 합니다.")
        if not isinstance(quality.get("issues"), list):
            raise ValueError(f"image_quality.{role}.issues는 배열이어야 합니다.")
        if not quality["usable"]:
            unusable_views.append(role)

    same_pair = result["same_pair_check"]
    if not isinstance(same_pair, dict):
        raise ValueError("same_pair_check는 객체여야 합니다.")
    if not isinstance(same_pair.get("consistent"), bool):
        raise ValueError("same_pair_check.consistent는 boolean이어야 합니다.")
    mismatched_views = same_pair.get("mismatched_views")
    if not isinstance(mismatched_views, list) or any(
        role not in IMAGE_ROLES for role in mismatched_views
    ):
        raise ValueError("same_pair_check.mismatched_views가 유효하지 않습니다.")
    pair_confidence = _normalize_confidence(
        same_pair.get("confidence"), "same_pair_check.confidence"
    )
    same_pair["confidence"] = pair_confidence

    if not same_pair["consistent"]:
        if result["is_usable"]:
            raise ValueError("서로 다른 신발 사진인데 is_usable=true로 표시됐습니다.")
        if not mismatched_views:
            raise ValueError("동일 신발 불일치 사진 위치가 지정되지 않았습니다.")
        if not str(same_pair.get("reason", "")).strip():
            raise ValueError("동일 신발 불일치 근거가 없습니다.")
        result["unusable_views"] = mismatched_views
        result["identity_mismatch"] = True
        return result

    pair_reason = str(same_pair.get("reason", "")).strip()
    if len(pair_reason) < 10:
        raise ValueError("동일 신발 판정 근거가 너무 짧습니다.")
    if pair_confidence < 0.75:
        result["is_usable"] = False
        result["quality_reason"] = "사진 5장이 동일한 한 켤레인지 확신하기 어렵습니다. 동일 신발로 다시 촬영해 주세요."
        result["unusable_views"] = list(IMAGE_ROLES)
        result["identity_uncertain"] = True
        return result

    if not result["is_usable"]:
        if not str(result["quality_reason"]).strip():
            raise ValueError("사용 불가능한 사진에는 quality_reason이 필요합니다.")
        if not unusable_views:
            raise ValueError("is_usable=false인데 문제 사진이 지정되지 않았습니다.")
        result["unusable_views"] = unusable_views
        return result

    if not shoe_type["is_supported"] or shoe_type["category"] == "unsupported":
        raise ValueError("지원하지 않는 신발인데 is_usable=true로 표시됐습니다.")

    if unusable_views:
        raise ValueError("전체 사진은 사용 가능하지만 일부 사진이 unusable로 표시됐습니다.")
    if not same_pair["consistent"]:
        raise ValueError("사진 5장이 동일한 한 켤레가 아닙니다.")

    score_paths = [
        (side, field)
        for side in ("left_outsole", "right_outsole")
        for field in (
            "heel_outer", "heel_inner", "forefoot_outer", "forefoot_inner", "outsole_loss",
            "toe_tip_damage", "outsole_crack"
        )
    ] + [
        ("heel_view", "left_deformation"),
        ("heel_view", "right_deformation"),
    ] + [
        (side, field)
        for side in ("left_side", "right_side")
        for field in ("midsole_compression", "deep_creasing", "sole_separation")
    ]
    detail_scores = [_score(result, group, field) for group, field in score_paths]

    asymmetry = result["asymmetry_level"]
    if isinstance(asymmetry, str):
        cleaned = asymmetry.strip().lower()
        if any(label in cleaned for label in ("없", "정상", "none", "null", "n/a")):
            asymmetry = 0
        else:
            match = re.fullmatch(r"([0-5])(?:\.0)?(?:\s*점)?", cleaned)
            asymmetry = match.group(1) if match else asymmetry
    if asymmetry is None or isinstance(asymmetry, bool):
        raise ValueError("asymmetry_level이 유효하지 않습니다.")
    if isinstance(asymmetry, float) and not asymmetry.is_integer():
        raise ValueError("asymmetry_level은 0~5 정수여야 합니다.")
    result["asymmetry_level"] = int(asymmetry)
    if not 0 <= result["asymmetry_level"] <= 5:
        raise ValueError("asymmetry_level은 0~5여야 합니다.")

    for boolean_field in ("crack_detected", "structural_damage_detected"):
        if not isinstance(result[boolean_field], bool):
            raise ValueError(f"{boolean_field}는 boolean이어야 합니다.")

    overall = result["overall_wear_level"]
    if isinstance(overall, str):
        cleaned = overall.strip().lower()
        if any(label in cleaned for label in ("없", "정상", "none", "null", "n/a")):
            overall = 0
        else:
            match = re.fullmatch(r"([0-5])(?:\.0)?(?:\s*점)?", cleaned)
            overall = match.group(1) if match else overall
    if overall is None or isinstance(overall, bool):
        raise ValueError("overall_wear_level이 유효하지 않습니다.")
    if isinstance(overall, float) and not overall.is_integer():
        raise ValueError("overall_wear_level은 0~5 정수여야 합니다.")
    overall = int(overall)
    if not 0 <= overall <= 5:
        raise ValueError("overall_wear_level은 0~5여야 합니다.")
    result["overall_wear_level"] = overall

    confidence = _normalize_confidence(result["confidence"], "confidence")
    result["confidence"] = confidence

    observations = result["observations"]
    if not isinstance(observations, list) or len(observations) < 3:
        raise ValueError("사용 가능한 분석에는 서로 다른 관찰 근거가 최소 3개 필요합니다.")
    if any(not isinstance(item, str) or len(item.strip()) < 5 for item in observations):
        raise ValueError("각 observation에는 구체적인 시각적 근거가 필요합니다.")

    observation_terms = (
        "왼쪽", "오른쪽", "양쪽", "밑창", "아웃솔", "뒤꿈치", "뒤축",
        "앞꿈치", "미드솔", "측면", "고무", "패턴", "홈", "주름",
        "기울", "변형", "마모", "균열", "분리", "압축",
    )
    normalized_observations = []
    grounded_observation_count = 0
    for observation in observations:
        if re.search(r"\\u(?:XXXX|[^0-9a-fA-F])", observation, re.IGNORECASE):
            raise ValueError("observation에 잘못된 유니코드 이스케이프 또는 자리표시자가 있습니다.")
        words = re.findall(r"[가-힣A-Za-z0-9]+", observation)
        if len(words) < 4:
            raise ValueError("observation 문장이 너무 짧거나 의미 있는 단어가 부족합니다.")
        frequencies = {word: words.count(word) for word in set(words)}
        repetition_ratio = max(frequencies.values()) / len(words)
        unique_ratio = len(frequencies) / len(words)
        if repetition_ratio >= 0.40 or unique_ratio < 0.45:
            raise ValueError("observation에 의미 없는 단어나 구절이 과도하게 반복됩니다.")
        if any(term in observation for term in observation_terms):
            grounded_observation_count += 1
        normalized_observations.append(" ".join(words))
    if len(set(normalized_observations)) != len(normalized_observations):
        raise ValueError("서로 중복된 observation이 있습니다.")
    if grounded_observation_count < 2:
        raise ValueError("observations에 신발 부위 또는 마모의 시각적 근거가 부족합니다.")

    max_detail = max(detail_scores + [result["asymmetry_level"]])
    # 단순 키워드 검색은 "마모가 없습니다", "압축이 보이지 않습니다"도
    # 손상으로 오인한다. 관찰 문장별로 부정 표현을 먼저 제외한다.
    wear_phrases = (
        "약간의 마모", "뚜렷한 마모", "심한 마모", "홈 소실",
        "고무 손실", "접착 분리", "균열", "압축",
    )
    negative_phrases = (
        "없", "아니", "보이지 않", "관찰되지 않", "확인되지 않",
        "발견되지 않", "뚜렷하지 않", "거의 보이지 않",
    )
    positive_wear = any(
        any(phrase in observation for phrase in wear_phrases)
        and not any(negative in observation for negative in negative_phrases)
        for observation in observations
    )
    if max_detail == 0 and positive_wear:
        raise ValueError("모든 세부 점수가 0인데 관찰 설명에는 마모 또는 손상이 있습니다.")
    quality_adjustments = []
    if max_detail >= 4 and overall < 3:
        quality_adjustments.append(
            f"전체 마모 단계를 {overall}에서 3으로 보정: 세부 손상 점수 {max_detail}"
        )
        overall = 3
        result["overall_wear_level"] = overall
    if (result["crack_detected"] or result["structural_damage_detected"]) and overall < 4:
        quality_adjustments.append(
            f"전체 마모 단계를 {overall}에서 4로 보정: 구조 손상 플래그"
        )
        overall = 4
        result["overall_wear_level"] = overall
    observation_text = " ".join(observations)
    if (result["crack_detected"] or result["structural_damage_detected"]) and not any(
        term in observation_text for term in ("균열", "갈라짐", "분리", "박리", "파손", "노출", "손상")
    ):
        raise ValueError("구조 손상 플래그에 대응하는 관찰 근거가 없습니다.")

    derived, metrics = _derived_wear_level(result)
    if abs(overall - derived) > 1:
        quality_adjustments.append(
            f"모델 전체 마모 단계 {overall}을 세부 점수 계산 단계 {derived}로 보정"
        )
        result["model_overall_wear_level"] = overall
        result["overall_wear_level"] = derived
    result["quality_adjustments"] = quality_adjustments
    result["quality_metrics"] = metrics
    return result


async def read_image(upload: UploadFile, role: str) -> tuple[bytes, str]:
    declared_format = ALLOWED_TYPES.get((upload.content_type or "").lower())
    label = QUALITY_LABELS[role]
    if declared_format is None:
        raise ValueError(f"{label}: JPG, PNG, WebP 파일만 가능합니다.")
    data = await upload.read()
    if not data:
        raise ValueError(f"{label}: 빈 파일입니다.")
    if len(data) > MAX_FILE_SIZE:
        raise ValueError(f"{label}: 파일 크기는 5MB 이하여야 합니다.")

    try:
        with Image.open(BytesIO(data)) as image:
            width, height = image.size
            actual_format = (image.format or "").lower()
            if actual_format == "jpg":
                actual_format = "jpeg"
            # 일부 휴대폰은 확장자가 JPG인 사진을 MPO 컨테이너로 저장한다.
            # 첫 프레임은 정상 JPEG 이미지이므로 디코딩 후 표준 JPEG로 변환한다.
            if actual_format not in {"jpeg", "mpo", "png", "webp"}:
                raise ValueError(f"{label}: 실제 이미지 형식을 확인할 수 없습니다.")
            if width * height > MAX_IMAGE_PIXELS:
                raise ValueError(f"{label}: 이미지 해상도가 지나치게 큽니다.")
            if min(width, height) < MIN_SHORT_SIDE_PX:
                raise ValueError(f"{label}: 짧은 변이 최소 {MIN_SHORT_SIDE_PX}px이어야 합니다.")

            image.load()
            normalized = ImageOps.exif_transpose(image)
            if normalized.mode in {"RGBA", "LA"}:
                rgba = normalized.convert("RGBA")
                background = Image.new("RGB", rgba.size, "white")
                background.paste(rgba, mask=rgba.getchannel("A"))
                normalized = background
            elif normalized.mode != "RGB":
                normalized = normalized.convert("RGB")

            output = BytesIO()
            normalized.save(output, format="JPEG", quality=90, optimize=True)
            normalized_data = output.getvalue()
    except (UnidentifiedImageError, OSError) as error:
        raise ValueError(f"{label}: 손상되었거나 이미지가 아닌 파일입니다.") from error
    return normalized_data, "jpeg"


def _analysis_composite(image_bytes: bytes, role: str) -> bytes:
    """원본과 핵심부 확대를 한 JPEG로 합쳐 모델 입력 이미지를 5장으로 유지한다."""
    with Image.open(BytesIO(image_bytes)) as source:
        original = source.convert("RGB")
        width, height = original.size
        if role in {"left_outsole", "right_outsole"}:
            detail = original.crop((0, 0, width, max(1, round(height * 0.42))))
        elif role == "heels":
            detail = original.crop((0, round(height * 0.42), width, height))
        else:
            detail = original.crop((0, round(height * 0.48), width, height))

        target_width = min(1400, width)
        original_scale = target_width / width
        original = original.resize(
            (target_width, max(1, round(height * original_scale))),
            Image.Resampling.LANCZOS,
        )
        detail_scale = target_width / detail.width
        detail = detail.resize(
            (target_width, max(1, round(detail.height * detail_scale))),
            Image.Resampling.LANCZOS,
        )
        gap = 16
        canvas = Image.new(
            "RGB",
            (target_width, original.height + gap + detail.height),
            "white",
        )
        canvas.paste(original, (0, 0))
        canvas.paste(detail, (0, original.height + gap))
        output = BytesIO()
        canvas.save(output, format="JPEG", quality=92, optimize=True)
        return output.getvalue()


def invoke_bedrock(client, model_id: str, images: dict[str, tuple[bytes, str]], prompt: str) -> str:
    content = [{"text": prompt}]
    for role in IMAGE_ROLES:
        image_bytes, _ = images[role]
        composite_bytes = _analysis_composite(image_bytes, role)
        detail_label = (
            "아래쪽에는 발가락 끝단 확대가 포함됨"
            if role in {"left_outsole", "right_outsole"}
            else "아래쪽에는 뒤꿈치 손상 영역 확대가 포함됨"
            if role == "heels"
            else "아래쪽에는 측면 미드솔 확대가 포함됨"
        )
        content.append({"text": f"사진 역할: {role} - {QUALITY_LABELS[role]}; {detail_label}"})
        content.append({
            "image": {
                "format": "jpeg",
                "source": {"bytes": composite_bytes},
            }
        })

    max_tokens = int(os.getenv("BEDROCK_MAX_OUTPUT_TOKENS", "5000"))
    if not 1000 <= max_tokens <= 10000:
        raise ValueError("BEDROCK_MAX_OUTPUT_TOKENS는 1000~10000 사이여야 합니다.")
    request = {
        "modelId": model_id,
        "messages": [{"role": "user", "content": content}],
        "inferenceConfig": {"maxTokens": max_tokens, "temperature": 0},
        "toolConfig": {
            "tools": [{
                "toolSpec": {
                    "name": "submit_running_shoe_wear_analysis",
                    "description": "사진 5장의 품질, 동일 신발 여부와 외관 마모 분석 결과 제출",
                    "inputSchema": {"json": WEAR_OUTPUT_SCHEMA},
                }
            }],
            "toolChoice": {"tool": {"name": "submit_running_shoe_wear_analysis"}},
        },
    }
    guardrail_id = os.getenv("BEDROCK_GUARDRAIL_ID", "").strip()
    guardrail_version = os.getenv("BEDROCK_GUARDRAIL_VERSION", "DRAFT").strip()
    if guardrail_id:
        request["guardrailConfig"] = {
            "guardrailIdentifier": guardrail_id,
            "guardrailVersion": guardrail_version,
            "trace": "enabled",
        }

    try:
        response = client.converse(**request)
    except ClientError as error:
        error_code = error.response.get("Error", {}).get("Code", "")
        error_message = error.response.get("Error", {}).get("Message", "")
        if error_code == "ValidationException" and "tool" in error_message.lower():
            # 일부 구형 모델은 강제 Tool JSON을 지원하지 않는다. 이 경우에도
            # 서비스가 중단되지 않도록 기존 JSON 텍스트 출력으로 자동 전환한다.
            request.pop("toolConfig", None)
            response = client.converse(**request)
        else:
            raise
    if response.get("stopReason") == "guardrail_intervened":
        raise GuardrailBlockedError("Bedrock Guardrail이 요청 또는 응답을 차단했습니다.")
    if response.get("stopReason") == "max_tokens":
        raise ValueError(
            f"Bedrock 응답이 {max_tokens} 토큰 제한에서 잘렸습니다. "
            "BEDROCK_MAX_OUTPUT_TOKENS를 늘려 주세요."
        )
    blocks = response["output"]["message"]["content"]
    for block in blocks:
        tool_use = block.get("toolUse")
        if tool_use and tool_use.get("name") == "submit_running_shoe_wear_analysis":
            return json.dumps(tool_use["input"], ensure_ascii=False)
    return next(block["text"] for block in blocks if "text" in block)


def audit_outsole_damage(client, model_id: str, images: dict[str, tuple[bytes, str]]) -> dict:
    content = [{"text": OUTSOLE_AUDIT_PROMPT}]
    for role, side_label in (("left_outsole", "왼쪽"), ("right_outsole", "오른쪽")):
        image_bytes, image_format = images[role]
        content.append({"text": f"{side_label} 밑창 전체 원본"})
        content.append({"image": {"format": image_format, "source": {"bytes": image_bytes}}})
        with Image.open(BytesIO(image_bytes)) as source:
            width, height = source.size
            crop_height = max(1, round(height * 0.42))
            crop = source.crop((0, 0, width, crop_height))
            scale = max(1.0, 1000 / width, 700 / crop_height)
            crop = crop.resize((round(width * scale), round(crop_height * scale)), Image.Resampling.LANCZOS)
            output = BytesIO()
            crop.save(output, format="JPEG", quality=94, optimize=True)
        content.append({"text": f"{side_label} 밑창 발가락 끝단 확대"})
        content.append({"image": {"format": "jpeg", "source": {"bytes": output.getvalue()}}})

    request = {
        "modelId": model_id,
        "messages": [{"role": "user", "content": content}],
        "inferenceConfig": {"maxTokens": 1600, "temperature": 0},
        "toolConfig": {
            "tools": [{"toolSpec": {
                "name": "submit_outsole_damage_audit",
                "description": "왼쪽과 오른쪽 밑창 앞부분의 독립 손상 재검사 결과",
                "inputSchema": {"json": OUTSOLE_AUDIT_SCHEMA},
            }}],
            "toolChoice": {"tool": {"name": "submit_outsole_damage_audit"}},
        },
    }
    guardrail_id = os.getenv("BEDROCK_GUARDRAIL_ID", "").strip()
    if guardrail_id:
        request["guardrailConfig"] = {
            "guardrailIdentifier": guardrail_id,
            "guardrailVersion": os.getenv("BEDROCK_GUARDRAIL_VERSION", "DRAFT").strip(),
            "trace": "enabled",
        }
    response = client.converse(**request)
    if response.get("stopReason") == "guardrail_intervened":
        raise GuardrailBlockedError("Bedrock Guardrail이 밑창 손상 재검사를 차단했습니다.")
    for block in response["output"]["message"]["content"]:
        tool_use = block.get("toolUse")
        if tool_use and tool_use.get("name") == "submit_outsole_damage_audit":
            return tool_use["input"]
    raise ValueError("밑창 손상 재검사 결과가 구조화된 형식으로 반환되지 않았습니다.")


def merge_outsole_audit(wear: dict, audit: dict) -> dict:
    for side_key, result_key, observation_index in (
        ("left", "left_outsole", 0),
        ("right", "right_outsole", 1),
    ):
        side = audit.get(side_key)
        if not isinstance(side, dict):
            raise ValueError(f"밑창 손상 재검사의 {side_key} 결과가 없습니다.")
        toe = _score({"audit": side}, "audit", "toe_tip_damage")
        crack = _score({"audit": side}, "audit", "outsole_crack")
        loss = _score({"audit": side}, "audit", "material_loss")
        confidence = _normalize_confidence(side.get("confidence"), f"audit.{side_key}.confidence")
        observation = str(side.get("observation", "")).strip()
        if len(observation) < 20:
            raise ValueError("밑창 손상 재검사의 관찰 근거가 너무 짧습니다.")
        # 신뢰도 0.7 이상의 독립 재검사만 1차 결과를 보수적으로 상향한다.
        if confidence >= 0.70:
            wear[result_key]["toe_tip_damage"] = max(wear[result_key]["toe_tip_damage"], toe)
            wear[result_key]["outsole_crack"] = max(wear[result_key]["outsole_crack"], crack)
            wear[result_key]["outsole_loss"] = max(wear[result_key]["outsole_loss"], loss)
            wear["observations"][observation_index] = observation
            if crack >= 3:
                wear["crack_detected"] = True
            if toe >= 4 or crack >= 4 or loss >= 4:
                wear["structural_damage_detected"] = True
    derived, metrics = _derived_wear_level(wear)
    wear["quality_metrics"] = metrics
    wear["overall_wear_level"] = max(wear["overall_wear_level"], derived)
    if wear["crack_detected"] or wear["structural_damage_detected"]:
        wear["overall_wear_level"] = max(wear["overall_wear_level"], 4)
    wear["outsole_damage_audit"] = audit
    return wear


def call_bedrock(images: dict[str, tuple[bytes, str]]) -> dict:
    region = os.getenv("AWS_REGION", "ap-northeast-2")
    model_id = os.getenv("BEDROCK_MODEL_ID")
    if not model_id:
        raise ValueError("BEDROCK_MODEL_ID 환경변수가 설정되지 않았습니다.")
    client = boto3.client("bedrock-runtime", region_name=region)
    first_text = invoke_bedrock(client, model_id, images, PROMPT)
    try:
        wear = validate_wear_result(parse_json(first_text))
    except (ValueError, json.JSONDecodeError) as first_error:
        retry = (
            PROMPT + "\n\n" + RETRY_PROMPT
            + f"\n검증 실패 원인: {first_error}"
            + "\nJSON의 모든 객체 속성과 배열 항목 사이에 쉼표가 있는지 출력 전에 확인하세요."
        )
        second_text = invoke_bedrock(client, model_id, images, retry)
        try:
            wear = validate_wear_result(parse_json(second_text))
        except (ValueError, json.JSONDecodeError) as second_error:
            raise AnalysisRejectedError(
                "두 번의 모델 응답이 품질 검증을 통과하지 못했습니다. "
                f"첫 번째: {first_error} / 두 번째: {second_error}"
            ) from second_error
    return wear


def fetch_running_summary(
    user_id: UUID,
    my_shoe_id: str | None,
    purchase_date: date,
) -> dict:
    try:
        import psycopg
    except ImportError as error:
        raise ValueError("PostgreSQL 연결 모듈이 없습니다. requirements.txt를 설치해 주세요.") from error

    required = ("DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD")
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        raise ValueError(f"러닝 기록 DB 환경변수가 없습니다: {', '.join(missing)}")

    shoe_filter = "AND my_shoe_id::text = %s" if my_shoe_id else ""
    query = f"""
        SELECT
            COUNT(*)::int AS run_count,
            COALESCE(SUM(distance_m), 0)::bigint AS total_distance_m,
            COALESCE(
                SUM(distance_m) FILTER (
                    WHERE completed_at >= CURRENT_TIMESTAMP - INTERVAL '28 days'
                ), 0
            )::bigint AS recent_28d_distance_m,
            MAX(completed_at) AS last_run_at,
            MIN(completed_at) AS first_run_at,
            COALESCE(SUM(moving_duration_sec), 0)::bigint AS total_moving_duration_sec,
            COALESCE(SUM(elevation_gain_m), 0)::double precision AS total_elevation_gain_m
        FROM running_record.runs
        WHERE user_id = %s
          AND completed_at IS NOT NULL
          AND completed_at::date >= %s
          AND distance_m > 0
          {shoe_filter}
    """
    try:
        with psycopg.connect(
            host=os.environ["DB_HOST"],
            port=int(os.getenv("DB_PORT", "5432")),
            dbname=os.environ["DB_NAME"],
            user=os.environ["DB_USER"],
            password=os.environ["DB_PASSWORD"],
            connect_timeout=5,
        ) as connection:
            with connection.cursor() as cursor:
                params = [user_id, purchase_date]
                if my_shoe_id:
                    params.append(my_shoe_id.strip())
                cursor.execute(query, params)
                row = cursor.fetchone()
    except Exception as error:
        raise ValueError(f"러닝 기록 DB 조회에 실패했습니다: {error}") from error

    run_count, total_m, recent_m, last_run_at, first_run_at, moving_sec, elevation_m = row
    total_km = round(float(total_m) / 1000, 2)
    recent_km = round(float(recent_m) / 1000, 2)
    weekly_km = round(recent_km / 4, 2)
    average_pace = None
    if total_m and moving_sec:
        average_pace = round(float(moving_sec) / (float(total_m) / 1000))
    return {
        "user_id": str(user_id),
        "my_shoe_id": my_shoe_id.strip() if my_shoe_id else None,
        "record_scope": "selected_shoe" if my_shoe_id else "user_all_runs_since_purchase",
        "completed_run_count": run_count,
        "total_distance_km": total_km,
        "recent_28d_distance_km": recent_km,
        "average_weekly_distance_km": weekly_km,
        "average_pace_sec_per_km": average_pace,
        "total_elevation_gain_m": round(float(elevation_m), 1),
        "last_run_at": last_run_at.isoformat() if last_run_at else None,
        "first_run_at": first_run_at.isoformat() if first_run_at else None,
    }


def calculate_life(wear: dict, purchase_date: date, running: dict | None = None) -> dict:
    today = date.today()
    if purchase_date > today:
        raise ValueError("구매일은 오늘 이후일 수 없습니다.")
    elapsed_days = (today - purchase_date).days
    elapsed_months = round(elapsed_days / 30.4375, 1)
    shoe_category = wear.get("shoe_type_check", {}).get("category", "running")
    lifestyle_mode = shoe_category == "lifestyle"
    # 생활화에는 러닝화의 500~800km 교체 기준을 적용할 근거가 없으므로
    # 러닝 기록 기반 거리 계산을 제외하고 사진과 구매 경과만 사용한다.
    if lifestyle_mode:
        running = None

    derived = wear["quality_metrics"]["derived_wear_level"]
    overall = wear["overall_wear_level"]
    effective_level = max(derived, overall)
    remaining_ranges = {
        0: (85, 100),
        1: (70, 90),
        2: (50, 75),
        3: (25, 50),
        4: (10, 30),
        5: (0, 10),
    }
    low, high = remaining_ranges[effective_level]
    if wear["confidence"] < 0.70:
        low = max(0, low - 10)
        high = min(100, high + 10)
    if wear["crack_detected"] or wear["structural_damage_detected"]:
        low, high = 0, min(high, 10)

    # MVP calendar heuristic. This is intentionally a broad range because
    # purchase date does not reveal actual running frequency or distance.
    remaining_day_ranges = {
        0: (365, 730),
        1: (270, 540),
        2: (180, 365),
        3: (90, 180),
        4: (30, 90),
        5: (0, 30),
    }
    remaining_days_low, remaining_days_high = remaining_day_ranges[effective_level]
    if elapsed_months >= 60:
        age_factor = 0.25
    elif elapsed_months >= 36:
        age_factor = 0.50
    elif elapsed_months >= 24:
        age_factor = 0.75
    else:
        age_factor = 1.0
    remaining_days_low = round(remaining_days_low * age_factor)
    remaining_days_high = round(remaining_days_high * age_factor)
    if wear["confidence"] < 0.70:
        remaining_days_low = max(0, round(remaining_days_low * 0.75))
        remaining_days_high = round(remaining_days_high * 1.25)
    if wear["crack_detected"] or wear["structural_damage_detected"]:
        remaining_days_low, remaining_days_high = 0, min(14, remaining_days_high)
    visual_purchase_days = {
        "min": remaining_days_low,
        "max": remaining_days_high,
    }

    remaining_distance = None
    distance_usage_days = None
    if running is not None:
        recorded_km = float(running["total_distance_km"])
        recent_weekly_km = float(running["average_weekly_distance_km"])
        pattern_weekly_km = recent_weekly_km
        observed_span_days = 0
        first_run_at = running.get("first_run_at")
        last_run_at = running.get("last_run_at")
        if first_run_at and last_run_at:
            from datetime import datetime
            first_dt = datetime.fromisoformat(first_run_at)
            last_dt = datetime.fromisoformat(last_run_at)
            observed_span_days = (last_dt.date() - first_dt.date()).days + 1
        if pattern_weekly_km < 1 and running["completed_run_count"] > 0:
            if first_run_at and last_run_at:
                observed_days = max(28, (last_dt.date() - first_dt.date()).days + 1)
                pattern_weekly_km = round(recorded_km / observed_days * 7, 2)

        can_extrapolate = (
            running["completed_run_count"] >= 10
            and observed_span_days >= 28
            and pattern_weekly_km >= 1
        )
        if can_extrapolate:
            estimated_total_km = max(
                recorded_km,
                round(pattern_weekly_km * elapsed_days / 7, 2),
            )
            estimated_unrecorded_km = max(0, round(estimated_total_km - recorded_km, 2))
        else:
            estimated_total_km = recorded_km
            estimated_unrecorded_km = None

        if running["completed_run_count"] >= 30 and observed_span_days >= 84:
            pattern_confidence = "high"
        elif can_extrapolate:
            pattern_confidence = "medium"
        else:
            pattern_confidence = "insufficient"
        running.update({
            "pattern_weekly_distance_km": round(pattern_weekly_km, 2),
            "observed_pattern_span_days": observed_span_days,
            "estimated_unrecorded_distance_km": estimated_unrecorded_km,
            "estimated_total_distance_since_purchase_km": estimated_total_km,
            "distance_estimation_confidence": pattern_confidence,
            "distance_extrapolation_applied": can_extrapolate,
        })
        used_km = estimated_total_km
        assumed_min_km = float(os.getenv("SHOE_LIFE_MIN_KM", "500"))
        assumed_max_km = float(os.getenv("SHOE_LIFE_MAX_KM", "800"))
        if assumed_min_km <= 0 or assumed_max_km < assumed_min_km:
            raise ValueError("SHOE_LIFE_MIN_KM/MAX_KM 설정이 올바르지 않습니다.")

        distance_low = max(0, round(assumed_min_km - used_km))
        distance_high = max(0, round(assumed_max_km - used_km))
        remaining_distance = {"min": distance_low, "max": distance_high}
        mileage_percent_low = max(0, round((assumed_min_km - used_km) / assumed_min_km * 100))
        mileage_percent_high = max(0, round((assumed_max_km - used_km) / assumed_max_km * 100))
        low = min(low, mileage_percent_low)
        high = min(high, mileage_percent_high)

        weekly_km = float(running["pattern_weekly_distance_km"])
        if weekly_km >= 1:
            usage_days_low = round(distance_low / weekly_km * 7)
            usage_days_high = round(distance_high / weekly_km * 7)
            distance_usage_days = {"min": usage_days_low, "max": usage_days_high}
            remaining_days_low = min(remaining_days_low, usage_days_low)
            remaining_days_high = min(remaining_days_high, usage_days_high)

    if wear["crack_detected"] or wear["structural_damage_detected"] or effective_level == 5:
        condition = "사용 중단 후 점검 권장"
    elif effective_level == 4:
        condition = "교체 준비"
    elif effective_level == 3:
        condition = "주의 관찰"
    elif effective_level == 2:
        condition = "경미한 외관 마모"
    else:
        condition = "외관상 사용 가능"
    if remaining_distance is not None and remaining_distance["max"] == 0:
        condition = "추정 주행거리 기준 교체 검토"
    elif remaining_distance is not None and remaining_distance["min"] == 0 and effective_level < 4:
        condition = "추정 주행거리 상 교체 준비"

    cautions = []
    if lifestyle_mode:
        cautions.append(
            "생활화로 분류되어 러닝화의 500~800km 기준과 러닝 기록은 적용하지 않았습니다. "
            "사진에서 확인되는 외관 손상과 구매 후 경과기간만 반영한 참고 결과입니다."
        )
    if elapsed_months >= 36:
        if condition in {"외관상 사용 가능", "경미한 외관 마모"}:
            condition = "장기 보유 - 사용 전 상태 점검 권장"
        cautions.append("구매 후 36개월 이상 경과했습니다. 보관 기간과 실제 사용량을 별도로 확인하세요.")
    if wear["confidence"] < 0.70:
        cautions.append("사진 판독 신뢰도가 낮아 잔여 수명 범위를 넓게 표시했습니다.")
    if running is not None and running["completed_run_count"] == 0:
        cautions.append("이 신발에 연결된 완료 러닝 기록이 없어 사진과 구매일 중심으로 계산했습니다.")
    elif running is not None and running["average_weekly_distance_km"] < 1:
        cautions.append("최근 28일 러닝 거리가 적어 잔여 일수는 사진과 구매일의 영향을 더 크게 받습니다.")
    if running is not None and running.get("record_scope") == "user_all_runs_since_purchase":
        cautions.append(
            "DB의 my_shoe_id가 비어 있어 구매일 이후 이 사용자의 모든 러닝을 해당 신발 거리로 "
            "임시 간주했습니다. 정확한 계산을 위해 러닝 기록에 my_shoe_id를 저장해야 합니다."
        )
    if running is not None and running.get("distance_estimation_confidence") == "insufficient":
        cautions.append(
            "러닝 기록이 10건 미만이거나 관측 기간이 28일 미만이어서 미기록 거리 추정을 "
            "적용하지 않고 DB 기록거리만 사용했습니다."
        )

    # 사용자 응답에는 이해에 필요한 핵심 근거만 제공한다. 세부 마모 점수는
    # wear_analysis.quality_metrics에 남겨 서버 검증·감사에 사용할 수 있다.
    calculation_evidence = {
        "신발 분류": "생활화" if lifestyle_mode else "러닝화",
        "사진 기반 마모 단계": f"{effective_level} / 5",
        "사진 분석 신뢰도": f"{round(float(wear['confidence']) * 100)}%",
        "구매 후 경과": f"{elapsed_months}개월",
        "왼쪽 앞쪽 끝단 손상": f"{wear['left_outsole']['toe_tip_damage']} / 5",
        "오른쪽 앞쪽 끝단 손상": f"{wear['right_outsole']['toe_tip_damage']} / 5",
        "왼쪽 밑창 균열": f"{wear['left_outsole']['outsole_crack']} / 5",
        "오른쪽 밑창 균열": f"{wear['right_outsole']['outsole_crack']} / 5",
        "구조 손상 감지": "감지됨" if wear["structural_damage_detected"] else "감지되지 않음",
        "추정 잔여 수명 비율": f"{low}~{high}%",
        "통합 계산 기준": (
            "생활화: 사진 외관 손상과 구매 경과기간 적용"
            if lifestyle_mode
            else "러닝화: 사진 외관 손상과 구매 경과기간 적용"
        ),
    }
    if running is not None:
        calculation_evidence.update({
            "recorded_run_count": running["completed_run_count"],
            "recorded_total_distance_km": running["total_distance_km"],
            "recent_weekly_distance_km": running["average_weekly_distance_km"],
            "estimated_total_distance_km": running["estimated_total_distance_since_purchase_km"],
            "거리 기준 잔여 주행거리(km)": (
                f"{remaining_distance['min']}~{remaining_distance['max']}"
                if remaining_distance else None
            ),
            "통합 계산 기준": (
                "사진 마모·구매 경과·러닝 기록 중 더 보수적인 결과 적용"
                if distance_usage_days else "사진 마모·구매 경과 기준"
            ),
        })

    image_confidence = float(wear["confidence"])
    if running is not None:
        record_count_score = min(running["completed_run_count"] / 30, 1.0)
        span_score = min(running.get("observed_pattern_span_days", 0) / 84, 1.0)
        shoe_link_score = 1.0 if running.get("record_scope") == "selected_shoe" else 0.0
        confidence_percent = round(
            image_confidence * 45
            + record_count_score * 20
            + span_score * 15
            + shoe_link_score * 15
            + 5
        )
    else:
        confidence_percent = round(image_confidence * 70 + 5)
    confidence_percent = max(0, min(100, confidence_percent))
    confidence_level = (
        "높음" if confidence_percent >= 75
        else "보통" if confidence_percent >= 50
        else "낮음"
    )

    return {
        "condition": condition,
        "shoe_category": shoe_category,
        "purchase_information": {
            "purchase_date": purchase_date.isoformat(),
            "elapsed_days": elapsed_days,
            "elapsed_months": elapsed_months,
        },
        "visual_wear_level": effective_level,
        "estimated_remaining_life_percent": {"min": low, "max": high},
        "estimated_remaining_days": {
            "min": remaining_days_low,
            "max": remaining_days_high,
        },
        "estimation_confidence": {
            "level": confidence_level,
            "percent": confidence_percent,
            "meaning": "실제 정확도가 아니라 사진과 러닝 기록의 데이터 충분도를 나타내는 MVP 신뢰도",
        },
        "estimated_remaining_distance_km": remaining_distance,
        "running_record_summary": running,
        "calendar_adjustment": {
            "age_factor": age_factor,
            "basis": "purchase_date_and_visible_wear_mvp_heuristic",
        },
        "calculation_evidence": calculation_evidence,
        "cautions": cautions,
        "calculation_type": (
            "VISIBLE_WEAR_RUNNING_DISTANCE_AND_PURCHASE_DATE_MVP_V4"
            if running is not None
            else "VISIBLE_WEAR_AND_PURCHASE_DATE_MVP_V3"
        ),
        "notice": (
            "사진의 외관 마모, DB 기록거리, 최근 28일 러닝 패턴을 구매일부터 확장한 미기록 거리 "
            "추정치를 결합한 MVP 규칙 기반 결과입니다. 기준 주행수명은 500~800km로 가정했으며 "
            "내부 쿠션 성능과 정확한 교체일을 보장하지 않습니다."
            if running is not None and running.get("distance_extrapolation_applied")
            else
            "사진의 외관 마모, 구매일과 DB 기록거리를 결합한 MVP 규칙 기반 결과입니다. "
            "러닝 패턴의 관측 근거가 부족해 미기록 거리 추정은 적용하지 않았습니다. 기준 주행수명은 "
            "500~800km로 가정했으며 내부 쿠션 성능과 정확한 교체일을 보장하지 않습니다."
            if running is not None
            else
            "사진의 외관 마모 단계와 구매 후 경과 기간을 결합한 MVP 규칙 기반 추정입니다. "
            "구매일은 실제 사용 시작일이나 누적거리를 의미하지 않으므로 남은 일수는 넓은 범위로 "
            "표시합니다. 내부 쿠션 성능과 정확한 교체일을 보장하지 않습니다."
        ),
    }


def persistence_enabled() -> bool:
    return os.getenv("PERSIST_ANALYSIS_RESULTS", "false").strip().lower() in {
        "1", "true", "yes", "on"
    }


def object_storage_client():
    endpoint_url = os.getenv("MINIO_ENDPOINT", "").strip()
    if endpoint_url:
        access_key = os.getenv("MINIO_ACCESS_KEY", "").strip()
        secret_key = os.getenv("MINIO_SECRET_KEY", "").strip()
        if not access_key or not secret_key:
            raise ValueError("MINIO_ENDPOINT를 사용하면 MINIO_ACCESS_KEY와 MINIO_SECRET_KEY가 필요합니다.")
        return boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=os.getenv("MINIO_REGION", "us-east-1"),
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
            verify=os.getenv("MINIO_VERIFY_TLS", "true").strip().lower() in {"1", "true", "yes", "on"},
        )
    return boto3.client("s3", region_name=os.getenv("AWS_REGION", "ap-northeast-2"))


def upload_analysis_images(
    analysis_id: UUID,
    user_id: UUID | None,
    images: dict[str, tuple[bytes, str]],
) -> dict[str, str]:
    bucket = os.getenv("OBJECT_STORAGE_BUCKET", os.getenv("S3_BUCKET", "")).strip()
    if not bucket:
        raise ValueError("PERSIST_ANALYSIS_RESULTS=true이면 OBJECT_STORAGE_BUCKET이 필요합니다.")
    prefix = os.getenv("S3_PREFIX", "shoe-life-analyses").strip().strip("/")
    owner = str(user_id) if user_id else "anonymous"
    now = datetime.now(timezone.utc)
    base_key = f"{prefix}/{now:%Y/%m/%d}/{owner}/{analysis_id}"
    client = object_storage_client()
    kms_key_id = os.getenv("S3_KMS_KEY_ID", "").strip()
    encryption = {} if os.getenv("MINIO_ENDPOINT") else (
        {"ServerSideEncryption": "aws:kms", "SSEKMSKeyId": kms_key_id}
        if kms_key_id else {"ServerSideEncryption": "AES256"}
    )
    uploaded: dict[str, str] = {}
    try:
        for role in IMAGE_ROLES:
            image_bytes, _ = images[role]
            key = f"{base_key}/{role}.jpg"
            client.put_object(
                Bucket=bucket,
                Key=key,
                Body=image_bytes,
                ContentType="image/jpeg",
                CacheControl="private, max-age=0, no-store",
                Metadata={
                    "analysis-id": str(analysis_id),
                    "image-role": role,
                },
                **encryption,
            )
            uploaded[role] = key
    except Exception as error:
        # 일부만 저장된 요청은 고아 파일을 남기지 않도록 같은 요청의 객체만 정리한다.
        for key in uploaded.values():
            try:
                client.delete_object(Bucket=bucket, Key=key)
            except Exception:
                pass
        raise PersistenceError(f"분석 이미지 S3 저장에 실패했습니다: {error}") from error
    return uploaded


def delete_analysis_images(image_keys: dict[str, str]) -> None:
    bucket = os.getenv("OBJECT_STORAGE_BUCKET", os.getenv("S3_BUCKET", "")).strip()
    if not bucket or not image_keys:
        return
    client = object_storage_client()
    for key in image_keys.values():
        try:
            client.delete_object(Bucket=bucket, Key=key)
        except Exception:
            pass


def _short_model_version(value: str) -> str:
    # model_version/prediction_model_version 컬럼은 VARCHAR(50)이라 Bedrock 추론 프로파일 ARN
    # 전체를 그대로 넣으면 초과한다. ARN이면 마지막 경로 조각만, 아니면 앞 50자만 남긴다.
    value = (value or "").strip()
    if "/" in value:
        value = value.rsplit("/", 1)[-1]
    return value[:50]


def save_analysis_result(
    analysis_id: UUID,
    user_id: UUID | None,
    my_shoe_id: str | None,
    input_media_id: UUID | None,
    result_media_id: UUID | None,
    purchase_date: date,
    image_keys: dict[str, str],
    response_payload: dict,
) -> None:
    try:
        import psycopg
        from psycopg.types.json import Jsonb
    except ImportError as error:
        raise ValueError("PostgreSQL 연결 모듈이 없습니다. requirements.txt를 설치해 주세요.") from error
    required = ("DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD")
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        raise ValueError(f"결과 저장 DB 환경변수가 없습니다: {', '.join(missing)}")
    life = response_payload["life_estimation"]
    wear = response_payload["wear_analysis"]
    if not my_shoe_id:
        raise ValueError("DB 저장을 위해 user_shoe_id(my_shoe_id)가 필요합니다.")
    try:
        user_shoe_id = UUID(str(my_shoe_id))
    except ValueError as error:
        raise ValueError("user_shoe_id(my_shoe_id)는 UUID 형식이어야 합니다.") from error
    if input_media_id is None:
        raise ValueError("DB 저장을 위해 input_media_id가 필요합니다.")

    confidence = life.get("estimation_confidence", {})
    remaining_days = life.get("estimated_remaining_days", {})
    remaining_distance = life.get("estimated_remaining_distance_km", {})
    running = life.get("running_record_summary") or {}

    def score_average(values: list[object]) -> float | None:
        scores = [float(value) for value in values if isinstance(value, (int, float))]
        return round(sum(scores) / len(scores), 2) if scores else None

    heel_score = score_average([
        wear.get("left_outsole", {}).get("heel_outer"),
        wear.get("left_outsole", {}).get("heel_inner"),
        wear.get("right_outsole", {}).get("heel_outer"),
        wear.get("right_outsole", {}).get("heel_inner"),
        wear.get("heel_view", {}).get("left_deformation"),
        wear.get("heel_view", {}).get("right_deformation"),
    ])
    forefoot_score = score_average([
        wear.get("left_outsole", {}).get("forefoot_outer"),
        wear.get("left_outsole", {}).get("forefoot_inner"),
        wear.get("right_outsole", {}).get("forefoot_outer"),
        wear.get("right_outsole", {}).get("forefoot_inner"),
    ])
    outsole_score = score_average([
        wear.get("left_outsole", {}).get("outsole_loss"),
        wear.get("right_outsole", {}).get("outsole_loss"),
        wear.get("left_outsole", {}).get("toe_tip_damage"),
        wear.get("right_outsole", {}).get("toe_tip_damage"),
        wear.get("left_outsole", {}).get("outsole_crack"),
        wear.get("right_outsole", {}).get("outsole_crack"),
    ])
    remaining_days_value = (
        round((remaining_days["min"] + remaining_days["max"]) / 2)
        if isinstance(remaining_days, dict)
        and isinstance(remaining_days.get("min"), (int, float))
        and isinstance(remaining_days.get("max"), (int, float))
        else None
    )
    remaining_distance_m = (
        round(((remaining_distance["min"] + remaining_distance["max"]) / 2) * 1000)
        if isinstance(remaining_distance, dict)
        and isinstance(remaining_distance.get("min"), (int, float))
        and isinstance(remaining_distance.get("max"), (int, float))
        else None
    )
    remaining_percent = life.get("estimated_remaining_life_percent", {})
    replacement_probability = (
        round(1 - ((remaining_percent["min"] + remaining_percent["max"]) / 200), 4)
        if isinstance(remaining_percent, dict)
        and isinstance(remaining_percent.get("min"), (int, float))
        and isinstance(remaining_percent.get("max"), (int, float))
        else None
    )
    persisted_result = dict(response_payload)
    persisted_result["storage"] = {
        "provider": "minio" if os.getenv("MINIO_ENDPOINT") else "s3",
        "bucket": os.getenv("OBJECT_STORAGE_BUCKET", os.getenv("S3_BUCKET", "")),
        "image_keys": image_keys,
        "purchase_date": purchase_date.isoformat(),
        "request_user_id": str(user_id) if user_id else None,
    }
    wear_query = """
        INSERT INTO shoe.shoe_wear_analyses (
            wear_analysis_id, user_shoe_id, input_media_id, result_media_id,
            status, wear_score, heel_wear_score, forefoot_wear_score,
            outsole_wear_score, result_json, model_version,
            requested_at, completed_at
        ) VALUES (
            %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s,
            NOW(), NOW()
        )
    """
    life_query = """
        INSERT INTO shoe.shoe_life_snapshots (
            snapshot_id, user_shoe_id, accumulated_distance_m,
            estimated_remaining_distance_m, estimated_remaining_days,
            replacement_recommended_at, replacement_probability,
            prediction_model_version, created_at
        ) VALUES (
            %s, %s, %s,
            %s, %s,
            %s, %s,
            %s, NOW()
        )
    """
    try:
        with psycopg.connect(
            host=os.environ["DB_HOST"],
            port=int(os.getenv("DB_PORT", "5432")),
            dbname=os.environ["DB_NAME"],
            user=os.environ["DB_USER"],
            password=os.environ["DB_PASSWORD"],
            connect_timeout=5,
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute(wear_query, (
                    analysis_id,
                    user_shoe_id,
                    input_media_id,
                    result_media_id,
                    "COMPLETED",
                    wear.get("overall_wear_level"),
                    heel_score,
                    forefoot_score,
                    outsole_score,
                    Jsonb(persisted_result),
                    _short_model_version(os.getenv("BEDROCK_MODEL_ID", "")),
                ))
                cursor.execute(life_query, (
                    uuid4(),
                    user_shoe_id,
                    round(float(running.get("total_distance_km", 0)) * 1000),
                    remaining_distance_m,
                    remaining_days_value,
                    date.today() + timedelta(days=remaining_days_value) if remaining_days_value is not None else None,
                    replacement_probability,
                    _short_model_version(life.get("calculation_type") or os.getenv("BEDROCK_MODEL_ID", "")),
                ))
    except Exception as error:
        raise PersistenceError(f"분석 결과 DB 저장에 실패했습니다: {error}") from error


@app.get("/")
def root():
    return {"service": "running-shoe-life-analysis", "status": "ok"}


@app.get("/demo", include_in_schema=False)
def demo():
    if (
        os.getenv("SERVE_DEMO", "true").strip().lower() not in {"1", "true", "yes", "on"}
        or not DEMO_FILE.exists()
    ):
        raise HTTPException(404, "운영 서버에서는 로컬 데모 화면을 제공하지 않습니다.")
    return FileResponse(
        DEMO_FILE,
        headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
    )


@app.get("/health")
def health():
    return {
        "status": "ok",
        "bedrock_model_configured": bool(os.getenv("BEDROCK_MODEL_ID")),
        "bedrock_guardrail_configured": bool(os.getenv("BEDROCK_GUARDRAIL_ID")),
        "persistence_enabled": persistence_enabled(),
        "object_storage_configured": bool(
            os.getenv("OBJECT_STORAGE_BUCKET") or os.getenv("S3_BUCKET")
        ),
        "result_db_configured": all(os.getenv(name) for name in ("DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD")),
        "required_images": list(IMAGE_ROLES),
    }


@app.get("/api/media/presigned-url")
def get_media_presigned_url(key: str, x_media_proxy_secret: str = Header(default="")):
    # Next.js가 서버 사이드에서만 호출한다(브라우저에 직접 노출되지 않음) — 공유 비밀값으로
    # 이 MinIO 버킷 접근을 이 한 엔드포인트로만 제한한다. key는 이 서비스가 실제로 올린
    # 접두사(S3_PREFIX) 아래 것만 허용해 임의 버킷 조회 게이트웨이가 되지 않게 막는다.
    expected_secret = os.getenv("MEDIA_PROXY_SECRET", "").strip()
    if not expected_secret or x_media_proxy_secret != expected_secret:
        raise HTTPException(403, "권한이 없습니다.")
    prefix = os.getenv("S3_PREFIX", "shoe-life-analyses").strip().strip("/")
    if not key or not key.startswith(f"{prefix}/"):
        raise HTTPException(400, "허용되지 않은 key입니다.")
    bucket = os.getenv("OBJECT_STORAGE_BUCKET", os.getenv("S3_BUCKET", "")).strip()
    if not bucket:
        raise HTTPException(500, "OBJECT_STORAGE_BUCKET이 설정되지 않았습니다.")
    client = object_storage_client()
    url = client.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=300,
    )
    return {"url": url}


@app.post("/api/analyze")
async def analyze(
    left_outsole: Annotated[UploadFile, File()],
    right_outsole: Annotated[UploadFile, File()],
    heels: Annotated[UploadFile, File()],
    left_side: Annotated[UploadFile, File()],
    right_side: Annotated[UploadFile, File()],
    purchase_date: Annotated[date, Form()],
    user_id: Annotated[UUID | None, Form()] = None,
    my_shoe_id: Annotated[str | None, Form()] = None,
    input_media_id: Annotated[UUID | None, Form()] = None,
    result_media_id: Annotated[UUID | None, Form()] = None,
):
    try:
        if my_shoe_id is not None and not my_shoe_id.strip():
            my_shoe_id = None
        if user_id is None and os.getenv("RUNNING_RECORD_USER_ID"):
            try:
                user_id = UUID(os.environ["RUNNING_RECORD_USER_ID"])
            except ValueError as error:
                raise ValueError("RUNNING_RECORD_USER_ID 환경변수가 올바른 UUID가 아닙니다.") from error
        if my_shoe_id is None and os.getenv("RUNNING_RECORD_SHOE_ID"):
            my_shoe_id = os.environ["RUNNING_RECORD_SHOE_ID"].strip() or None
        if user_id is None and my_shoe_id is not None:
            raise ValueError("my_shoe_id를 사용하려면 user_id도 함께 입력해야 합니다.")
        if user_id is None and os.getenv("DB_HOST"):
            raise ValueError(
                "러닝 기록을 조회할 사용자 정보가 없습니다. 로컬에서는 RUNNING_RECORD_USER_ID를 "
                "설정하고, 실제 서버에서는 기존 백엔드가 로그인 user_id를 전달해야 합니다."
            )
        uploads = {
            "left_outsole": left_outsole,
            "right_outsole": right_outsole,
            "heels": heels,
            "left_side": left_side,
            "right_side": right_side,
        }
        images = {
            role: await read_image(uploads[role], role)
            for role in IMAGE_ROLES
        }
        wear = call_bedrock(images)
        if not wear["is_usable"]:
            return {
                "status": "RETAKE_REQUIRED",
                "wear_analysis": wear,
                "required_retake_views": wear.get("unusable_views", []),
            }
        running = fetch_running_summary(user_id, my_shoe_id, purchase_date) if user_id is not None else None
        response_payload = {
            "status": "COMPLETED",
            "wear_analysis": wear,
            "life_estimation": calculate_life(wear, purchase_date, running),
        }
        if persistence_enabled():
            analysis_id = uuid4()
            image_keys = upload_analysis_images(analysis_id, user_id, images)
            response_payload["analysis_id"] = str(analysis_id)
            response_payload["storage"] = {
                "images_saved": True,
                "result_saved": True,
                "bucket": os.getenv("OBJECT_STORAGE_BUCKET", os.getenv("S3_BUCKET", "")),
                "image_keys": image_keys,
            }
            try:
                save_analysis_result(
                    analysis_id,
                    user_id,
                    my_shoe_id,
                    input_media_id,
                    result_media_id,
                    purchase_date,
                    image_keys,
                    response_payload,
                )
            except Exception:
                delete_analysis_images(image_keys)
                raise
        return response_payload
    except GuardrailBlockedError as error:
        return {
            "status": "SAFETY_BLOCKED",
            "message": str(error),
            "notice": "사진과 입력 내용을 확인한 뒤 다시 시도해 주세요.",
        }
    except AnalysisRejectedError as error:
        response = {
            "status": "ANALYSIS_REJECTED",
            "message": "사진 분석 결과가 일시적으로 불안정합니다. 잠시 후 다시 시도해 주세요.",
            "notice": "검증되지 않은 마모 점수와 수명 결과는 사용자에게 제공하지 않습니다.",
        }
        if os.getenv("DEBUG_ANALYSIS_ERRORS", "").lower() in {"1", "true", "yes"}:
            response["debug_reason"] = str(error)
        return response
    except NoCredentialsError as error:
        raise HTTPException(500, "AWS 자격증명이 설정되지 않았습니다.") from error
    except PersistenceError as error:
        raise HTTPException(502, str(error)) from error
    except (ClientError, BotoCoreError) as error:
        raise HTTPException(502, f"Bedrock 호출 실패: {error}") from error
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
