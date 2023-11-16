export enum Channel {
  ApiKeyUpdated = "api-key-updated",
  RateLimitRuleUpdated = "rate-limit-rule-updated",
  RoutersUpdated = "routers-updated",
  SourcesUpdated = "sources-updated",
  PauseRabbitConsumerQueue = "pause-rabbit-consumer-queue",
  ResumeRabbitConsumerQueue = "resume-rabbit-consumer-queue",
  MetadataReenabled = "metadata-reenabled",
}

export enum AllChainsChannel {
  ApiKeyCreated = "api-key-created-all-chains",
  ApiKeyUpdated = "api-key-updated-all-chains",
  RateLimitRuleCreated = "rate-limit-rule-created",
  RateLimitRuleUpdated = "rate-limit-rule-updated",
  RateLimitRuleDeleted = "rate-limit-rule-deleted",
}
