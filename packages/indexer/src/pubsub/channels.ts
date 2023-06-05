export enum Channel {
  ApiKeyUpdated = "api-key-updated",
  RateLimitRuleUpdated = "rate-limit-rule-updated",
  RouteApiPointsUpdated = "route-api-points-updated",
  RoutersUpdated = "routers-updated",
  SourcesUpdated = "sources-updated",
  PauseRabbitConsumerQueue = "pause-rabbit-consumer-queue",
  ResumeRabbitConsumerQueue = "resume-rabbit-consumer-queue",
}

export enum AllChainsChannel {
  ApiKeyCreated = "api-key-created-all-chains",
  ApiKeyUpdated = "api-key-updated-all-chains",
}
