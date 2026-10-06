# Architecture

FlowPilot is a service that automates Google Flow interactions. Here is how it is organized.

## Components

- **src/cli**: The `flowpilot` command-line tool; talks to the service over the local HTTP API.
- **src/server**: Local HTTP API with bearer token authentication; also hosts the MCP server over stdio that calls the HTTP API.
- **src/core**: Service lifecycle, job store and serial queue, credit ledger and limits, config, paths, logger, update check (compares the installed version with `package.json` on GitHub's `main` branch).
- **src/browser**: Chrome session management: sign-in in a plain Chrome window without remote debugging, then reopening the same profile with a debugging port and attaching over the Chrome DevTools Protocol.
- **src/flow**: Everything that knows the Flow page; all DOM selectors live in `src/flow/selectors.ts`; self-test function.
- **src/i18n**: All user-facing strings, translated to English and Italian.

## Principles

- **Single owner**: Only the service touches Chrome; no concurrent access.
- **Serial execution**: Jobs run one at a time in a queue.
- **Fail early**: Settings and cost are verified before submitting to Flow, to avoid spending credits.
- **Centralized selectors**: All Flow page DOM selectors are in `src/flow/selectors.ts`, with a self-test to catch breaking changes.
- **Clear, translated errors**: All error messages are internationalized and user-facing.
- **Rich logging**: Logs are organized by day; a JSON summary is written next to every result.

## Data storage

Locations are platform-specific and never depend on the current working directory:

- **Config and token**: `%APPDATA%\FlowPilot` (Windows), `~/Library/Application Support/FlowPilot` (macOS), `~/.config/flowpilot` (Linux)
- **Chrome profile, jobs, logs, credit ledger**: `%LOCALAPPDATA%\FlowPilot` (Windows), `~/Library/Application Support/FlowPilot` (macOS), `~/.local/share/flowpilot` (Linux)
- **Results**: Configurable folder (default `Documents\FlowPilot` on Windows, `~/Documents/FlowPilot` on macOS/Linux)

## Architecture diagram

```
  CLI / HTTP clients / MCP clients
            |
         HTTP API
            |
        Service (queue)
            |
       Flow driver
            |
          Chrome
            |
       Google Flow
```
