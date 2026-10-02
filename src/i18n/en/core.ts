export default {
  "error.internal": "Internal error",
  "config.invalid": "Invalid configuration file {path}: {reason}",
  "config.unknownKey": "Unknown configuration key: {key}",
  "credits.overJobLimit":
    "This job costs {cost} credits, above the per-job limit of {limit}. Use --confirm to allow it.",
  "credits.overMonthlyLimit":
    "Monthly credit limit exceeded: {spent} spent, this job costs {cost}, limit is {limit}.",
} as const;
