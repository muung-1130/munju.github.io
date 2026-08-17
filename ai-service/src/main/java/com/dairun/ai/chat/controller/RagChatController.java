package com.dairun.ai.chat.controller;

import com.dairun.ai.chat.dto.RagChatRequest;
import com.dairun.ai.chat.dto.RagChatResponse;
import com.dairun.ai.chat.service.BedrockKnowledgeBaseService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/ai")
public class RagChatController {

    private final BedrockKnowledgeBaseService service;

    public RagChatController(BedrockKnowledgeBaseService service) {
        this.service = service;
    }

    @PostMapping("/chat")
    public ResponseEntity<RagChatResponse> chat(
            @Valid @RequestBody RagChatRequest request
    ) {
        return ResponseEntity.ok(
                service.chat(request.question(), request.sessionId())
        );
    }
}
