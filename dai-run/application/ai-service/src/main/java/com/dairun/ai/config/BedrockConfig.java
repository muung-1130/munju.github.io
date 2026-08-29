package com.dairun.ai.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.bedrockagentruntime.BedrockAgentRuntimeClient;

@Configuration
public class BedrockConfig {

    @Bean
    public BedrockAgentRuntimeClient bedrockAgentRuntimeClient(
            @Value("${aws.region}") String region
    ) {
        return BedrockAgentRuntimeClient.builder()
                .region(Region.of(region))
                .build();
    }
}
