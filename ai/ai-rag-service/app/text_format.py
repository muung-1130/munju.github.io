import re

# 소수점("0.98km" 등) 보호용 임시 치환 문자. 유니코드 사용자 영역(U+E000)이라
# 실제 응답 텍스트에 절대 등장하지 않는다.
_DECIMAL_POINT_PLACEHOLDER = chr(0xE000)
_DECIMAL_POINT_PATTERN = re.compile(r"(\d)\.(\d)")
_SENTENCE_PIECE_PATTERN = re.compile(r"[^.,!?]*[.,!?]|[^.,!?]+$")


def _protect_decimal_points(paragraph: str) -> str:
    return _DECIMAL_POINT_PATTERN.sub(
        lambda m: m.group(1) + _DECIMAL_POINT_PLACEHOLDER + m.group(2), paragraph
    )


def wrap_text_for_chat(text: str, target_len: int = 30) -> str:
    """한 줄이 target_len자를 넘으면 가장 가까운 문장부호(.,!?) 뒤에서 줄바꿈을 넣는다.

    채팅 위젯이 <p style="white-space: pre-wrap">로 렌더링하므로 실제 개행 문자를
    넣어야 줄이 나뉜다. 숫자 사이의 마침표(소수점, "0.98km" 등)는 문장 구분자가
    아니므로 보호했다가 되돌린다. 이미 있는 줄바꿈(하이픈 목록 등)은 각 줄을
    독립적으로 처리해 건드리지 않는다.
    """
    out_paragraphs = []
    for paragraph in text.split("\n"):
        protected = _protect_decimal_points(paragraph)
        pieces = _SENTENCE_PIECE_PATTERN.findall(protected)

        lines: list[str] = []
        current = ""
        for piece in pieces:
            if current and len(current) + len(piece) > target_len:
                lines.append(current.strip())
                current = piece
            else:
                current += piece
        if current.strip():
            lines.append(current.strip())

        result = "\n".join(lines) if lines else protected
        out_paragraphs.append(result.replace(_DECIMAL_POINT_PLACEHOLDER, "."))

    return "\n".join(out_paragraphs)
