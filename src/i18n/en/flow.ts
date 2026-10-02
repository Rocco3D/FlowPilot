export default {
  "session.chromeNotFound":
    "Google Chrome was not found. Tried: {tried}. Install Chrome or set FLOWPILOT_CHROME_PATH to its executable.",
  "session.noDebugPort":
    "Chrome did not open a debugging port for the profile {profileDir}. Close every Chrome window using that profile and try again.",
  "session.connectFailed":
    "Could not connect to Chrome on port {port}. Run the login command, sign in, then try again. ({reason})",
  "session.statusConnected": "Chrome is running and FlowPilot is connected.",
  "session.statusRunning":
    "Chrome is running on the profile but no debugging connection is available.",
  "session.statusStopped": "Chrome is not running on the profile.",
  "nav.projectNotFound": "No Flow project matches {project}.",
  "nav.projectNotOpened": "Flow did not open a project page.",
  "models.settingsNotOpen": "The Flow settings popover did not open.",
  "models.menuNotOpen": "The Flow model menu did not open.",
  "gen.unsupportedInput":
    "Start frames, end frames, ingredients and characters are not supported yet.",
  "gen.settingsNotApplied": "Flow did not apply the requested settings: {details}.",
  "gen.settingsMismatch": "{field} should be {wanted} but is {actual}",
  "gen.creditsUnreadable": "Could not read the credit cost from Flow.",
  "gen.promptNotSet": "The prompt box is empty after typing the prompt.",
  "gen.submitNotReady": "The Start generation button did not become enabled.",
  "gen.timeout": "Flow did not finish the generation in {minutes} minutes.",
  "gen.rateLimited": "Flow reported unusual activity or a rate limit. Wait a while and try again.",
  "gen.creditsExhausted": "Flow reports that the account is out of credits.",
  "gen.blocked": "Flow refused the prompt (content policy).",
  "gen.failed": "Flow reported that the generation failed.",
  "download.viewerNotOpened": "Flow did not open the result viewer.",
  "download.tierLocked": "The requested download tier needs a Flow plan upgrade.",
  "download.fetchFailed": "Could not download a result (HTTP {status}).",
  "download.noSource": "Could not find the media file of a result.",
  "driver.notSignedIn": "Chrome is connected but not signed in to Flow. Run the login command.",
  "driver.fatal": "FlowPilot service failed: {reason}",
} as const;
