# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.1] - 2026-10-06

### Added

- `flowpilot doctor` and the `doctor` MCP tool tell the user when a newer FlowPilot version is available on GitHub

### Fixed

- Jobs, `flowpilot models` and `flowpilot selftest` no longer stop with `settings_not_open` when Flow's Agent chat panel is open: FlowPilot closes the panel first

### Changed

- Docs: Nano Banana 2.1 replaces Nano Banana 2, which Flow no longer offers
- Docs: the HTTP API examples match the real responses

## [0.1.0]

### Added

- CLI tool (`flowpilot` command) for image and video generation
- Background service with local HTTP API (127.0.0.1:47820, token-authenticated)
- Serial job queue (one Flow session, jobs run one at a time in queue)
- Credit guard with per-job limit (default 20) and monthly limit (default 1000)
- Job management: list, view, cancel operations
- Configuration system (`flowpilot config get/set`)
- Self-test to verify setup without spending credits
- Model discovery (`flowpilot models` reads live list from Flow)
- Reference files support (start frame, end frame, ingredients, characters)
- Reference and upload rights confirmation
- English and Italian localization (auto-detect or configurable)
- Logging system with daily log rotation and JSON job summaries
- MCP server for AI assistants (Claude Code, Codex, Cursor, etc.)
- Service lifecycle management (start, stop, status, idle shutdown)
