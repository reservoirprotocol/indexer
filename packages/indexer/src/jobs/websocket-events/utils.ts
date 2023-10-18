// Utility functions for parsing cdc event data

export const formatValidBetween = (validBetween: string) => {
  try {
    const parsed = JSON.parse(validBetween.replace("infinity", "null"));
    return {
      validFrom: Math.floor(new Date(parsed[0]).getTime() / 1000),
      validUntil: Math.floor(new Date(parsed[1]).getTime() / 1000),
    };
  } catch (error) {
    return {
      validFrom: null,
      validUntil: null,
    };
  }
};

export const formatStatus = (fillabilityStatus: string, approvalStatus: string) => {
  switch (fillabilityStatus) {
    case "filled":
      return "filled";
    case "cancelled":
      return "cancelled";
    case "expired":
      return "expired";
    case "no-balance":
      return "inactive";
  }

  switch (approvalStatus) {
    case "no-approval":
    case "disabled":
      return "inactive";
  }

  return "active";
};
