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
} as const;
