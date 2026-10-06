export default {
  "error.internal": "Internal error",
  "jobs.notFound": "Job not found: {id}",
  "queue.notCancellable": "Job {id} cannot be cancelled because it is {status}",
  "config.invalid": "Invalid configuration file {path}: {reason}",
  "config.unknownKey": "Unknown configuration key: {key}",
  "credits.overJobLimit":
    "This job costs {cost} credits, above the per-job limit of {limit}. Use --confirm to allow it.",
  "credits.overMonthlyLimit":
    "Monthly credit limit exceeded: {spent} spent, this job costs {cost}, limit is {limit}.",
  "update.available":
    "FlowPilot {latest} is available (installed: {installed}). Update with: npm install -g Rocco3D/FlowPilot (in a cloned repository: git pull, then npm install), then run: flowpilot service stop",
} as const;
