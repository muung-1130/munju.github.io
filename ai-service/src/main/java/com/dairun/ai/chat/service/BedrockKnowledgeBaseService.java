package com.dairun.ai.chat.service;

import com.dairun.ai.chat.dto.RagChatResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.services.bedrockagentruntime.BedrockAgentRuntimeClient;
import software.amazon.awssdk.services.bedrockagentruntime.model.BedrockAgentRuntimeException;
import software.amazon.awssdk.services.bedrockagentruntime.model.KnowledgeBaseRetrieveAndGenerateConfiguration;
import software.amazon.awssdk.services.bedrockagentruntime.model.RetrieveAndGenerateConfiguration;
import software.amazon.awssdk.services.bedrockagentruntime.model.RetrieveAndGenerateInput;
import software.amazon.awssdk.services.bedrockagentruntime.model.RetrieveAndGenerateRequest;
import software.amazon.awssdk.services.bedrockagentruntime.model.RetrieveAndGenerateResponse;
import software.amazon.awssdk.services.bedrockagentruntime.model.RetrieveAndGenerateType;

import java.util.List;
import java.util.Objects;

@Service
public class BedrockKnowledgeBaseService {

    private final BedrockAgentRuntimeClient client;
    private final String knowledgeBaseId;
    private final String modelArn;

    public BedrockKnowledgeBaseService(
            BedrockAgentRuntimeClient client,
            @Value("${bedrock.knowledge-base-id}") String knowledgeBaseId,
            @Value("${bedrock.model-arn}") String modelArn
    ) {
        this.client = client;
        this.knowledgeBaseId = knowledgeBaseId;
        this.modelArn = modelArn;
    }

    public RagChatResponse chat(String question, String sessionId) {
        try {
            var knowledgeBaseConfig = KnowledgeBaseRetrieveAndGenerateConfiguration.builder()
                    .knowledgeBaseId(knowledgeBaseId)
                    .modelArn(modelArn)
                    .build();

            var configuration = RetrieveAndGenerateConfiguration.builder()
                    .type(RetrieveAndGenerateType.KNOWLEDGE_BASE)
                    .knowledgeBaseConfiguration(knowledgeBaseConfig)
                    .build();

            var requestBuilder = RetrieveAndGenerateRequest.builder()
                    .input(RetrieveAndGenerateInput.builder()
                            .text(question)
                            .build())
                    .retrieveAndGenerateConfiguration(configuration);

            if (sessionId != null && !sessionId.isBlank()) {
                requestBuilder.sessionId(sessionId);
            }

            RetrieveAndGenerateResponse response =
                    client.retrieveAndGenerate(requestBuilder.build());

            String answer = response.output() == null
                    ? "답변을 생성하지 못했습니다."
                    : response.output().text();

            return new RagChatResponse(
                    answer,
                    response.sessionId(),
                    extractS3Sources(response)
            );
        } catch (BedrockAgentRuntimeException exception) {
            String message = exception.awsErrorDetails() == null
                    ? exception.getMessage()
                    : exception.awsErrorDetails().errorMessage();

            throw new IllegalStateException(
                    "Bedrock Knowledge Base 호출에 실패했습니다: " + message,
                    exception
            );
        } catch (SdkClientException exception) {
            throw new IllegalStateException(
                    "AWS 자격 증명을 찾지 못했거나 SDK 요청 준비에 실패했습니다. AWS CLI 프로필 또는 환경변수를 설정하세요.",
                    exception
            );
        }
    }

    private List<String> extractS3Sources(RetrieveAndGenerateResponse response) {
        if (response.citations() == null) {
            return List.of();
        }

        return response.citations().stream()
                .filter(citation -> citation.retrievedReferences() != null)
                .flatMap(citation -> citation.retrievedReferences().stream())
                .map(reference -> {
                    if (reference.location() == null
                            || reference.location().s3Location() == null) {
                        return null;
                    }

                    return reference.location().s3Location().uri();
                })
                .filter(Objects::nonNull)
                .distinct()
                .toList();
    }
}
