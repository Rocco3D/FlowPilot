# FlowPilot

FlowPilot is a local service that drives Google Flow (AI image and video generation) through your own logged-in Chrome, using your own Flow subscription credits. It is usable from a CLI (`flowpilot`), a local HTTP API (127.0.0.1 only, protected by a token) and an MCP server for AI assistants (Claude Code, Codex, Cursor and others).

**Status:** work in progress, not yet usable.

## Planned features

- CLI for images and videos
- Local HTTP API
- MCP server
- Serial job queue (one Flow session, jobs run one at a time)
- Credit guard (reads the cost shown by Flow before submitting, per-job and monthly limits)
- Self-test that checks the Flow UI without spending credits
- Download in original or upscaled quality
- Reference images (first/last frame, ingredients, characters)
- English and Italian interface

## Requirements

- Windows 10/11 first (macOS and Linux supported)
- Node.js 22.12 or newer
- Google Chrome
- A Google account with access to Google Flow

## Uploads and Google's rights confirmation

When a job uses reference files (start/end frame, ingredients), Flow asks you to confirm that you have the rights to each uploaded file and that you comply with Google's Prohibited Use Policy. FlowPilot clicks "I agree" automatically by default, so that queued jobs can run unattended. By using reference files you make that declaration yourself.

To turn this off, run `flowpilot config set acceptUploadRights false`. Jobs with uploads then stop with an explanation.

## Disclaimer

FlowPilot is unofficial. It is not affiliated with or endorsed by Google. It automates your own Google Flow session in your own browser, and you are responsible for complying with Google's Terms of Service.

## License

MIT, see `LICENSE`.
