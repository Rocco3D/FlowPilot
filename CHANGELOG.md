# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- A job can start a new Flow project, named or with the name Flow gives it: `--new-project [name]` on the command line, `newProject` in the HTTP API and the MCP server. In a terminal, a job with neither `--project` nor `--new-project` asks whether to continue the most recent project or start a new one; without a terminal it continues the most recent one, as before. The MCP tools tell the assistant to ask the user
- The Flow projects can be listed, most recent first: `flowpilot projects`, `GET /projects`, `list_projects`
- A Flow project can be deleted, by its exact name or its id: `flowpilot delete-project`, `DELETE /projects/:project`, `delete_project`. It always asks for confirmation: the CLI asks in the terminal (`--yes` without one), the HTTP API wants `confirm: true`, the MCP tool tells the assistant to ask the user
- Media already in a Flow project can be listed and downloaded again without generating anything (no credits on Google AI Pro, upscale included; other plans not checked): `GET /media` and `POST /media/download` in the HTTP API, `list_media` and `download_media` in the MCP server. The download is a job in the queue; the list waits for a running job and says so (`queued`). The file is saved as `<project>-media-<id>`
- An image job that fails after finding its results in Flow (for example while downloading them) lists their ids in the error, so they can be downloaded instead of generated again
- `upscale` accepts `original`, to ask for the file as generated

### Changed

- Without `upscale`, results are downloaded at the best quality the user's Flow plan offers: 4K when the plan has it, else the 1080p/2K upscale, otherwise the original. A quality asked for that Flow does not offer fails the job instead of downloading another one
- Results are downloaded from Flow's viewer, with its _Download media_ button
- With `showBrowser` on, the automation window opens on the left half of the screen, at full height, so you can watch FlowPilot work beside your other windows

### Fixed

- In a project with many media, a job could save an older result of the project instead of its own: Flow draws only part of the grid and draws other older results while the job waits, and the job took the first one it had not seen before. Now only the top of the grid counts, where Flow shows the newest results
- When Flow's home shows "Error loading projects", FlowPilot reloads it instead of reading an empty grid, which made a job without a project create a new one, and fails with `projects_unavailable` if the error stays
- Downloading an upscaled result works: Flow ignores a mouse click on the upscaled items of its quality menu, so the item is now selected from the keyboard. A quality Flow shows disabled is treated like one that needs a plan upgrade, instead of being picked and never arriving
- A download counts only when the file is on disk and not empty; otherwise the job fails with `download_failed` instead of reporting a file that is not there
- A project asked for by its exact name is found: the name read from Flow's project card included the text of the card's edit and delete icons, so only a partial match could work
- The CLI no longer waits forever for a service that does not answer: every request to the local API has a timeout (60 seconds for the plain requests, 300 for the ones that drive the browser and for the file downloads), and a service that stays silent ends the command with a `service_timeout` error instead of hanging
- The CLI starts the service from the build output (`dist/server/main.js`) whichever directory the CLI runs from: run from the sources it looked for `src/server/main.js`, and the service died with `Cannot find module` instead of starting. A missing build now says what to run
- `doctor` compares each configured default model with the models of its own mode, video or image, whichever mode Flow's composer is in
- `config get <key>` prints an empty line (`null` with `--json`) for a known key that is not set, and fails with `config_unknown_key` only for a key that does not exist
- `doctor`, `models` and `selftest` never touch the Flow page while a job is using it: `doctor` answers without the model check and says so, `models` returns the list already read, `selftest` and a `models` with nothing read yet fail with `job_running` (HTTP 409). A job asked for while one of them reads Flow waits for it

## [0.1.4] - 2026-10-17

### Changed

- FlowPilot is installed from a cloned repository (`git clone`, `npm install`, `npm run build`, `npm link`) instead of `npm install -g Rocco3D/FlowPilot`. npm 12 refuses packages fetched from git by default (`EALLOWGIT`), and npm 10 on Windows installed the package without its compiled files, so the old command left a `flowpilot` that did not start
- The update message of `doctor` says to run `git pull`, `npm install` and `npm run build` in the FlowPilot folder
- The `prepare` script is gone: npm 12 blocks it, and the build is now an explicit step of installing and updating

## [0.1.3] - 2026-10-16

### Added

- A configured default model that Flow no longer offers is replaced by the next version of the same name (`Nano Banana 2` to `Nano Banana 2.1`). The job result says so (`note`), the configuration is updated once and both steps are logged. A model asked for explicitly with `--model` is never replaced, and nothing is guessed when Flow does not offer the same family in a higher version
- `doctor` reports the configured default models that Flow no longer offers, with the successor that will be used, before any job fails on them
- The MCP tools `get_config` and `set_config`, so an assistant can read the configuration and change the default models, the outputs per job and the language. The credit limits are deliberately not writable from a tool call: a tool that could raise `maxCreditsPerJob` would be a way to spend without asking
- Every finished job reports the model it really ran with (`modelUsed`), which differs from the requested model when a retired configured model was replaced, so a client does not have to read it out of the note
- `--confirm` is a real flag on `video` and `image`, and it is what the credit limit messages tell you to use
- Results are matched to the job by their stable media id, so a job never picks up results left in the project by an earlier one

### Changed

- `--max-credits` can only lower the configured per-job limit, never raise it
- `defaultVideoModel`, `defaultImageModel`, `outputs` and `locale` are read as documented; the first three were documented but read by nothing
- The session status says when Chrome was already open on the profile and FlowPilot restarted it, instead of the user seeing a window disappear for no reason
- The MCP tools `generate_video` and `generate_image` no longer accept `confirm`, so an assistant cannot let a job exceed the credit limits on its own; `--confirm` and the HTTP API still can
- The MCP tools start the service again when they find it stopped, accept calls without arguments, and wait at most 45 seconds for a job before reporting it as still running

### Fixed

- The local HTTP API rejects requests whose `Host` is not the service port, so a page in the browser can no longer reach it
- The six HTTP errors answered with the name of the translation key instead of a sentence
- A Chrome opened by the user on the FlowPilot profile was invisible to FlowPilot: it is now found, closed and reopened with a debugging connection, instead of the launch landing in a tab of the running window and leaving no debugging port

## [0.1.2] - 2026-10-06

### Added

- `flowpilot credits`, the `get_credits` MCP tool and `GET /credits` show the real Google Flow credit balance, read from Flow's account panel (`flowBalance`)
- Every finished job reports the Google Flow balance left after the generation (`balance`)

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
