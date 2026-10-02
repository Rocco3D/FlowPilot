# FlowPilot

FlowPilot is a local service that drives Google Flow (AI image and video generation) through the user's own signed-in Chrome, using their own Flow subscription credits. It exposes a CLI (`flowpilot`), a local HTTP API (127.0.0.1 only, bearer token) and an MCP server for AI assistants. Jobs run one at a time on a single Flow session. TypeScript, Node.js 22.12+, Playwright over the Chrome DevTools Protocol.

## Source paths

- `src/cli/` - the `flowpilot` command (`program.ts`, `commands/`), HTTP client of the service (`client.ts`), service start/stop (`service-control.ts`).
- `src/server/` - service entrypoint (`main.ts`), local HTTP API (`http.ts`), token auth (`auth.ts`), MCP server (`mcp.ts`).
- `src/core/` - service lifecycle (`service.ts`), job store and serial queue (`jobs.ts`, `queue.ts`), credit ledger and limits (`credits.ts`), config (`config.ts`), platform paths (`paths.ts`), logger, errors, shared Zod schemas (`schemas.ts`).
- `src/browser/` - Chrome session (`session.ts`) and Chrome process handling (`processes.ts`).
- `src/flow/` - everything that knows the Flow page: all DOM selectors (`selectors.ts`), navigation, settings, prompt, submit, results, download, reference uploads, model discovery, self-test, and the driver used by the service (`real-driver.ts`, interface in `driver.ts`).
- `src/i18n/` - user-facing strings, English (`en/`) and Italian (`it/`).
- `test/unit/` - unit tests (Vitest); `test/fakes/` - fake Flow driver.
- `docs/` - architecture, local HTTP API, MCP server.
- `assets/brand/` - logos and banner (not covered by the MIT License, see `assets/brand/NOTICE.md`).

## Runtime paths

- Config and API token: `%APPDATA%\FlowPilot\` (macOS `~/Library/Application Support/FlowPilot`, Linux `~/.config/flowpilot`).
- Chrome profile, jobs, logs, credit ledger, `service.json`: `%LOCALAPPDATA%\FlowPilot\` (macOS `~/Library/Application Support/FlowPilot`, Linux `~/.local/share/flowpilot`).
- Results: `Documents\FlowPilot` by default (`outputDir` in the config).
