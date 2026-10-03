<p align="center"><img src="https://raw.githubusercontent.com/Rocco3D/FlowPilot/main/assets/brand/banner.png" alt="FlowPilot" width="100%"></p>

<p align="center"><b>English</b> &nbsp;|&nbsp; <a href="README.it.md">Italiano</a></p>

# FlowPilot

FlowPilot is a local service that drives Google Flow (AI image and video generation) through your own logged-in Chrome, using your own Flow subscription credits. It is usable from a CLI (`flowpilot`), a local HTTP API (127.0.0.1 only, protected by a token) and an MCP server for AI assistants (Claude Code, Codex, Cursor and others).

**Status:** beta

## Requirements

- Windows 10/11, or macOS/Linux (first-class Windows support)
- Node.js 22.12 or newer
- Google Chrome
- A Google account with access to Google Flow
- Google AI subscription credits for video generation (image generation with Nano Banana models costs 0 credits)

## Install

```bash
npm install -g Rocco3D/FlowPilot
```

Or install from source:

```bash
git clone https://github.com/Rocco3D/FlowPilot.git
cd FlowPilot
npm install
npm run build
npm link
```

After installation, `flowpilot` is available in your terminal.

## First sign-in

Sign in with your Google account:

```bash
flowpilot login
```

This opens a plain Chrome window where you can sign in with Google. If Flow shows terms to accept, accept them. Close the window when done, then verify the setup:

```bash
flowpilot doctor
```

This checks that Chrome is running, the API connection works, and you're signed in.

## Generate

### Image generation

```bash
flowpilot image --prompt "A serene landscape at sunset" --model "Nano Banana 2" --ratio 1:1
```

### Video generation

```bash
flowpilot video --prompt "A cat walking through a sunny garden" --model "Veo 3.1 - Lite" --ratio 16:9
```

Read the prompt from a file instead of the command line:

```bash
flowpilot video --prompt-file prompt.md --model "Veo 3.1 - Lite"
```

### Omni (universal generation)

```bash
flowpilot video --prompt "A flowing waterfall" --model "Omni 1.1 Flash" --resolution 720p --duration 4
```

### Advanced options

- `--ratio 16:9`: Aspect ratio (image and video; default is model-dependent)
- `--resolution 720p`: Omni resolution, when Flow offers a choice (for example 360p or 720p)
- `--duration 4`: Video duration in seconds
- `--outputs 2`: Generate multiple outputs (1–4)
- `--start-frame path.jpg`: Starting frame for video continuation
- `--ingredient path.jpg`: Reference image for style
- `--character "Character Name"`: Reference character
- `--no-wait`: Submit the job and exit immediately (by default, the CLI waits for the job to finish)
- `--json`: Output JSON instead of human-readable text
- `--out ~/Downloads`: Save results to a custom folder (default: configured output folder)
- `--upscale 4k`: Upscale the result (1080p or 4k)
- `--max-credits 50`: Per-job credit limit (overridden by `--confirm`)

## Models and credits

Models and their credit costs as of October 2026:

**Video models:**

- **Omni 1.1 Flash**: 720p, durations 4/6/8/10 seconds, 7–15 credits (Flow sometimes also offers 360p, 4–7 credits; with a start/end frame only 720p and 4/6/8 seconds)
- **Veo 3.1 - Lite**: 720p, 8 seconds, 10 credits
- **Veo 3.1 - Fast**: 720p, 8 seconds, 20 credits
- **Veo 3.1 - Quality**: 720p, 8 seconds, 100 credits

All video models support audio.

**Image models:**

- **Nano Banana Pro**: 0 credits on Google AI Pro
- **Nano Banana 2**: 0 credits on Google AI Pro
- **Nano Banana 2 Lite**: 0 credits on Google AI Pro

### List available models

```bash
flowpilot models
```

This reads the live list from Flow.

### Credit guard

FlowPilot protects your account with two limits:

- **Per-job limit** (default 20 credits): Jobs that exceed this are rejected unless you pass `--confirm`
- **Monthly limit** (default 1000 credits): If you're approaching the monthly limit, jobs are rejected unless you pass `--confirm`

Check your spending:

```bash
flowpilot credits
```

## Jobs and the service

One Flow session runs at a time. Jobs run one at a time in a queue.

The CLI automatically starts the background service if it is not running. You can also manage it manually:

```bash
flowpilot service start
flowpilot service stop
flowpilot service status
```

### Manage jobs

List all jobs (newest first):

```bash
flowpilot jobs
```

Get details of a specific job:

```bash
flowpilot job <id>
```

Cancel a queued job:

```bash
flowpilot cancel <id>
```

Cancelling a job that is already running or downloading has no effect.

### Service shutdown

Stop the service and close the browser window:

```bash
flowpilot service stop
```

The service also stops automatically after being idle for a configured number of minutes (default 30; set to 0 to disable).

## Configuration

All settings can be read and changed with `flowpilot config`:

```bash
flowpilot config get                    # Show all settings
flowpilot config get outputDir          # Show one setting
flowpilot config set outputDir ~/Videos # Change a setting
```

| Key                  | Default               | Meaning                                           |
| -------------------- | --------------------- | ------------------------------------------------- |
| `outputDir`          | `Documents\FlowPilot` | Where to save generated files                     |
| `defaultVideoModel`  | (auto)                | Default model for `flowpilot video`               |
| `defaultImageModel`  | (auto)                | Default model for `flowpilot image`               |
| `outputs`            | 1                     | Number of outputs per job (1–4)                   |
| `maxCreditsPerJob`   | 20                    | Per-job credit limit                              |
| `monthlyCreditLimit` | 1000                  | Monthly credit budget                             |
| `locale`             | (auto)                | Language: `en` or `it`; auto-detect from system   |
| `port`               | 47820                 | HTTP API port                                     |
| `logLevel`           | info                  | Log level: debug, info, warn, error               |
| `acceptUploadRights` | true                  | Auto-accept rights dialog for uploads             |
| `idleMinutes`        | 30                    | Minutes before the service auto-stops (0 = never) |
| `showBrowser`        | false                 | Show the automation window (normally off-screen)  |

Changes to `idleMinutes` and `showBrowser` take effect the next time the service starts (after `flowpilot stop` or an idle shutdown).

## Languages

FlowPilot is available in English and Italian.

The interface language is chosen from:

1. `flowpilot config set locale en` or `locale it`
2. Environment variable: `FLOWPILOT_LANG=en` or `FLOWPILOT_LANG=it`
3. System language (if Italian, uses Italian; otherwise English)

## Use from other apps

### Local HTTP API

The local HTTP API on `http://127.0.0.1:47820` lets you integrate FlowPilot with other tools. Full reference: [docs/api.md](docs/api.md)

### MCP server for AI assistants

Run FlowPilot as an MCP server for Claude Code, Codex, Cursor and other AI assistants:

**Claude Code:**

```
claude mcp add flowpilot -- flowpilot mcp
```

Full reference: [docs/mcp.md](docs/mcp.md)

## Self-test and troubleshooting

Test the setup without spending credits:

```bash
flowpilot selftest
```

This checks that Flow's UI is responding and that selectors are correct.

### If Flow's UI changes

All DOM selectors for Flow live in one file: `src/flow/selectors.ts`. If Flow changes its layout, FlowPilot will fail at a specific step. The selectors can be updated without changing any other code.

### Logs

Logs are written to the data folder:

- **Windows**: `%LOCALAPPDATA%\FlowPilot\logs`
- **macOS**: `~/Library/Application Support/FlowPilot/logs`
- **Linux**: `~/.local/share/flowpilot/logs`

Logs are organized by day. A JSON summary is written next to every job result.

## Uploads and Google's rights confirmation

When a job uses reference files (start/end frame, ingredients), Flow asks you to confirm that you have the rights to each uploaded file and that you comply with Google's Prohibited Use Policy. FlowPilot clicks "I agree" automatically by default, so that queued jobs can run unattended. By using reference files you make that declaration yourself.

To turn this off, run `flowpilot config set acceptUploadRights false`. Jobs with uploads then stop with an explanation.

## Disclaimer

FlowPilot is unofficial. It is not affiliated with or endorsed by Google. It automates your own Google Flow session in your own browser, and you are responsible for complying with Google's Terms of Service.

## License

The code and documentation are released under the MIT License, see `LICENSE`.

**Logos and names are excluded:** the FlowPilot logo, the Rocco logo and the name Rocco™ (files in `assets/brand/`) are not covered by the MIT License. All rights reserved; they may not be reused without permission. See `assets/brand/NOTICE.md`.

## Credits

FlowPilot started from and was inspired by [gflow-cli](https://github.com/swissmarley/gflow-cli) by swissmarley (MIT License), which showed how to drive Google Flow through a real, signed-in Chrome session. Parts of the browser session and Flow automation code are derived from it; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

<p align="center"><img src="https://raw.githubusercontent.com/Rocco3D/FlowPilot/main/assets/brand/rocco-logo.png" alt="Rocco logo" height="40" align="absmiddle">&nbsp;<b>Rocco™</b></p>
