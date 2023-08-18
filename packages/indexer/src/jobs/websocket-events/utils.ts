// Utility functions for parsing cdc event data

export const formatValidBetween = (validBetween: string) => {
  try {
    const parsed = JSON.parse(validBetween.replace("infinity", "null"));
    return {
      validFrom: new Date(parsed[0]).getTime(),
      validUntil: new Date(parsed[1]).getTime(),
    };
  } catch (error) {
    return {
      validFrom: null,
      validUntil: null,
    };
  }
};

export const formatStatus = (status: string) => {
  switch (status) {
    case "filled":
      return "filled";
    case "cancelled":
      return "cancelled";
    case "expired":
      return "expired";
    case "no-balance":
    case "no-approval":
      return "inactive";
    default:
      return "active";
  }
};
