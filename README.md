<p align="center"><img src="https://raw.githubusercontent.com/Rocco3D/FlowPilot/main/assets/brand/banner.png" alt="FlowPilot" width="100%"></p>

<p align="center"><b>English</b> &nbsp;|&nbsp; <a href="README.it.md">Italiano</a></p>

# FlowPilot

FlowPilot is a local service that drives Google Flow (AI image and video generation) through your own logged-in Chrome, using your own Flow subscription credits. It is usable from a CLI (`flowpilot`), a local HTTP API (127.0.0.1 only, protected by a token) and an MCP server for AI assistants (Claude Code, Codex, Cursor and others).

**Status:** beta

## Requirements

- Windows 10/11, or macOS/Linux (first-class Windows support)
- Node.js 22.12 or newer
- Git
- Google Chrome
- A Google account with access to Google Flow
- Google AI subscription credits for video generation (image generation with Nano Banana models costs 0 credits)

## Install

```bash
git clone https://github.com/Rocco3D/FlowPilot.git
cd FlowPilot
npm install
npm run build
npm link
```

After installation, `flowpilot` is available in your terminal. Keep the `FlowPilot` folder: the `flowpilot` command runs from it.

If you installed FlowPilot with `npm install -g Rocco3D/FlowPilot`, run `npm uninstall -g flowpilot-cli` first, then install it as shown above.

### Update

`flowpilot doctor` (and the `doctor` MCP tool) tells you when a newer version is available on GitHub. To update, run these commands in the `FlowPilot` folder:

```bash
git pull
npm install
npm run build
```

Then run `flowpilot service stop`: the next `flowpilot` command starts the new version. If you use FlowPilot from an AI assistant, restart the assistant too, so that its MCP server runs the new version.

Every update raises the version by 0.0.1 (for example 0.1.0 to 0.1.1). Changes are listed in [CHANGELOG.md](CHANGELOG.md).

## First sign-in

Sign in with your Google account:

```bash
flowpilot login
```

This opens a plain Chrome window where you can sign in with Google. If Flow shows terms to accept, accept them. Close the window when done, then verify the setup:

```bash
flowpilot doctor
```

This checks that Chrome is running, the API connection works, and you're signed in. It also tells you when a newer FlowPilot version is available.

## Generate

### Image generation

```bash
flowpilot image --prompt "A serene landscape at sunset" --model "Nano Banana 2.1" --ratio 1:1
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
- `--upscale 4k`: Download quality: `original`, `1080p` (2K for images) or `4k`. Left out, FlowPilot downloads the best quality your Flow plan offers: 4K when the plan has it, else the 1080p/2K upscale, otherwise the original. A quality asked for that the plan does not offer fails the job
- `--max-credits 10`: Lower the per-job credit limit for this run (it can never raise it)
- `--confirm`: Allow the job to exceed the per-job and monthly credit limits

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
- **Nano Banana 2.1**: 0 credits on Google AI Pro
- **Nano Banana 2 Lite**: 0 credits on Google AI Pro

### List available models

```bash
flowpilot models
```

This reads the list from Flow; FlowPilot keeps it for an hour. While a job is running it shows the list already read, or asks you to try again when the job ends.

### A model Flow no longer offers

Model names change: `Nano Banana 2` became `Nano Banana 2.1`. Asking for a model Flow does not offer fails the job
with a message that lists what your account can use, and `flowpilot doctor` says the same before you spend anything.

There is one automatic case. When the job uses the model configured as default (`defaultVideoModel` or
`defaultImageModel`) and Flow offers the **next version of the same name**, FlowPilot uses that one, tells you on
the job result, and updates your configuration so it happens once:

```
The configured model Nano Banana 2 is no longer offered by Flow, so this job used Nano Banana 2.1. The configuration has been updated.
```

Nothing else is guessed. A model asked for explicitly with `--model` is never replaced, because you asked for that
one by name: it fails and lists the available models. See [docs/known-issues.md](docs/known-issues.md).

### Credit guard

FlowPilot protects your account with two limits:

- **Per-job limit** (default 20 credits): Jobs that exceed this are rejected unless you pass `--confirm`
- **Monthly limit** (default 1000 credits): If you're approaching the monthly limit, jobs are rejected unless you pass `--confirm`

Check your spending:

```bash
flowpilot credits
```

The spending and the limits are counted by FlowPilot itself. The same command also shows your real Google Flow balance, read from Flow's account panel. While a job is running, it shows the last balance read instead of touching the page. After each generation, the job result includes the balance left (`balance`).

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

### Media already in Flow

Images and videos already in a Flow project, from an earlier job, another tool or an upload, can be listed and
downloaded again without generating anything or spending credits, through the [HTTP API](docs/api.md) (`GET /media`,
`POST /media/download`) or the [MCP server](docs/mcp.md) (`list_media`, `download_media`). There is no CLI command for
it. The file is saved as `<project>-media-<id>`.

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

| Key                  | Default               | Meaning                                                                                                  |
| -------------------- | --------------------- | -------------------------------------------------------------------------------------------------------- |
| `outputDir`          | `Documents\FlowPilot` | Where to save generated files                                                                            |
| `defaultVideoModel`  | (auto)                | Model for video jobs without `--model`                                                                   |
| `defaultImageModel`  | (auto)                | Model for image jobs without `--model`                                                                   |
| `outputs`            | 1                     | Outputs per job when none is requested (1–4)                                                             |
| `maxCreditsPerJob`   | 20                    | Per-job credit limit                                                                                     |
| `monthlyCreditLimit` | 1000                  | Monthly credit budget                                                                                    |
| `locale`             | (auto)                | Language: `en` or `it`; auto-detect from system                                                          |
| `port`               | 47820                 | HTTP API port                                                                                            |
| `logLevel`           | info                  | Log level: debug, info, warn, error                                                                      |
| `acceptUploadRights` | true                  | Auto-accept rights dialog for uploads                                                                    |
| `idleMinutes`        | 30                    | Minutes before the service auto-stops (0 = never)                                                        |
| `showBrowser`        | false                 | Show the automation window on the left half of the screen, to watch FlowPilot work (normally off-screen) |

With no `defaultVideoModel` or `defaultImageModel` the model already selected in Flow is used.

Changes to `idleMinutes`, `showBrowser` and `locale` take effect the next time the service starts (after `flowpilot stop` or an idle shutdown). `defaultVideoModel`, `defaultImageModel` and `outputs` are read every time a job is created. FlowPilot writes `defaultVideoModel` and `defaultImageModel` back when Flow retires the configured model and offers the next version of the same name; `outputs`, the limits and the language are only ever changed by you.

## Languages

FlowPilot is available in English and Italian.

The interface language is chosen from:

1. `flowpilot config set locale en` or `locale it`
2. Environment variable: `FLOWPILOT_LANG=en` or `FLOWPILOT_LANG=it`
3. System language (if Italian, uses Italian; otherwise English)

The first one wins: `FLOWPILOT_LANG` is used only when `locale` is not set. Values other than `en` and `it` are ignored rather than reported. It covers the CLI and the error messages the service returns over the HTTP API; log files stay in English.

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

### Flow's Agent mode

FlowPilot uses Flow's classic prompt box. If Flow's Agent mode is on, or its chat panel is open on the right, FlowPilot closes the panel and turns Agent mode off before reading models or running a job. If it cannot, it stops with the error `agent_mode_on`: turn Agent mode off in Flow and try again.

### If Flow's UI changes

All DOM selectors for Flow live in one file: `src/flow/selectors.ts`. If Flow changes its layout, FlowPilot will fail at a specific step. The selectors can be updated without changing any other code. [docs/flow-ui.md](docs/flow-ui.md) describes what FlowPilot drives on the page, how a job uses it, and what a layout change looks like from the outside.

### If Chrome was already open on the profile

If you opened Chrome yourself on the FlowPilot profile, FlowPilot closes it and reopens the same profile with a
debugging connection, and `doctor` says so once:

```
Chrome was already open on the profile, so FlowPilot closed it and reopened it with a debugging connection.
```

Tabs open in that window are lost. This is expected, not a failure.

### Things that do not work

[docs/known-issues.md](docs/known-issues.md) lists the limits worth knowing: one job at a time, media already in
Flow reachable only from the HTTP API and the MCP server, download quality, no automatic retry, Flow driven in
English, and the idle shutdown.

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
