package com.dairun.ai.chat.dto;

import java.util.List;

public record RagChatResponse(
        String answer,
        String sessionId,
        List<String> sources
) {
}
