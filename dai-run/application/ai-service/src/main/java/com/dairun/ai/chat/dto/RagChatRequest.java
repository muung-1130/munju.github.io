package com.dairun.ai.chat.dto;

import jakarta.validation.constraints.NotBlank;

public record RagChatRequest(
        @NotBlank(message = "질문은 비어 있을 수 없습니다.")
        String question,
        String sessionId
) {
}
