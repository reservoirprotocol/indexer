// Possible kinds of triggers that could result in new floor ask prices
export type TriggerKind =
  | "bootstrap"
  | "new-order"
  | "expiry"
  | "sale"
  | "cancel"
  | "balance-change"
  | "approval-change"
  | "revalidation"
  | "reprice";
