type ConfigOptions = {
  aggregatorSource?: string;
};

// Should be overridden for custom configuration
export const Config: ConfigOptions = {
  aggregatorSource: undefined,
};
