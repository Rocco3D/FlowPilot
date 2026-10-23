# FlowPilot Local HTTP API

The local HTTP API allows programmatic access to FlowPilot's job submission and management features.

## Base URL

All requests are made to `http://127.0.0.1:47820`. The port is configurable via:

```
flowpilot config set port <n>
```

The API is reachable only from the local machine (localhost).

## Authentication

All endpoints except `GET /health` require authentication via the `Authorization` header:

```
Authorization: Bearer <token>
```

The token is automatically created on first startup and stored at:

- **Windows**: `%APPDATA%\FlowPilot\token`
- **macOS**: `~/Library/Application Support/FlowPilot/token`
- **Linux**: `~/.config/flowpilot/token`

Missing or invalid tokens return HTTP 401.

Every request must also carry a `Host` header pointing at the service itself, that is `127.0.0.1:<port>` or `localhost:<port>`, where `<port>` is the port the service is listening on (see Base URL). This check runs before routing and before the token check, so a request aimed at some other `Host` is refused with HTTP 403 and error code `bad_host`, even on `GET /health` and even without a token.

## Response Format

All responses are JSON. Error responses use this format:

```json
{
  "error": {
    "code": "...",
    "message": "..."
  }
}
```

### Status Codes

- **201**: Created (successful `POST /jobs` or `POST /media/download`)
- **400**: Bad request (bad_request, config errors)
- **401**: Unauthorized (missing or invalid token)
- **403**: Forbidden (bad_host: the `Host` header does not match the service address)
- **404**: Not found (job_not_found, not_found, project_not_found)
- **409**: Conflict (job_not_cancellable, job_running, project_ambiguous)
- **413**: Payload too large (body over 1 MB)
- **500**: Server error (any other error code, e.g. chrome_not_found, internal)

## Endpoints

### GET /health

Health check. No authentication required.

**Response:**

```json
{
  "ok": true,
  "version": "0.1.3"
}
```

### POST /doctor

Checks the current session status including Chrome state, API connection, and authentication. It also checks whether a newer FlowPilot version is available on GitHub, and whether the configured default models are still offered by Flow. The model check needs the Flow page, so it opens the session like a job does; it is skipped, without failing the check, when the page cannot be read. While a job is using the Flow page, the check reads the page where it is, leaves the model check for after the job and says so in `message`; a job asked for during a full check waits for it to finish.

**Response:**

```json
{
  "chromeRunning": true,
  "connected": true,
  "signedIn": true,
  "profileDir": "C:\\Users\\me\\AppData\\Local\\FlowPilot\\profiles\\default",
  "message": "Chrome is running and FlowPilot is connected.",
  "update": {
    "installed": "0.1.1",
    "latest": "0.1.2",
    "message": "FlowPilot 0.1.2 is available (installed: 0.1.1). Update with: git pull, npm install and npm run build in the FlowPilot folder, then run: flowpilot service stop"
  },
  "configuredModels": [
    {
      "key": "defaultImageModel",
      "configured": "Nano Banana 2",
      "available": ["Nano Banana Pro", "Nano Banana 2 Lite", "Nano Banana 2.1"],
      "suggestion": "Nano Banana 2.1"
    }
  ]
}
```

**Fields:**

- `chromeRunning` (boolean): Whether the Chrome process is running.
- `connected` (boolean): Whether FlowPilot is connected to Chrome.
- `signedIn` (boolean): Whether the user is authenticated.
- `profileDir` (string, optional): Path to the Chrome profile directory.
- `message` (string): Human-readable status message.
- `update` (object, optional): Present only when the version in `package.json` on GitHub's `main` branch is newer than the installed one. Missing when FlowPilot is up to date or GitHub cannot be reached within 3 seconds.
  - `installed` (string): Installed version.
  - `latest` (string): Version available on GitHub.
  - `message` (string): Human-readable notice with the update commands.
- `configuredModels` (array, optional): Present only when a configured default model is no longer offered by Flow. Missing when every configured model is still available, when none is configured, or when the model list could not be read.
  - `key` (string): Configuration key, `defaultVideoModel` or `defaultImageModel`.
  - `configured` (string): The model name in the configuration.
  - `available` (array of strings): The model names Flow offers right now.
  - `suggestion` (string, optional): The next version of the same name, when Flow offers one. A job using the configured model will use it and the configuration will be updated, unless it was changed while the job ran or could not be written; when missing, the job will fail and list what is available.

### POST /selftest

Checks the Flow UI without spending credits. Useful for verifying the setup works before running actual jobs. While a job is using the Flow page it fails with HTTP 409 and `job_running`: run it again when the job ends.

**Response:**

```json
{
  "ok": true,
  "checks": [
    {
      "name": "signed-in",
      "ok": true
    },
    {
      "name": "project",
      "ok": true,
      "detail": "opened project 594a8255-6729-4694-8725-3f41e7813c66"
    },
    {
      "name": "agent-mode-off",
      "ok": true
    },
    {
      "name": "model-menu",
      "ok": true,
      "detail": "Nano Banana Pro, Nano Banana 2 Lite, Nano Banana 2.1"
    }
  ]
}
```

The real report has more checks (selectors, settings popover, credit line, overlays); the example shows a few of them.

**Fields:**

- `ok` (boolean): Whether all checks passed.
- `checks` (array): List of individual checks.
  - `name` (string): Name of the check.
  - `ok` (boolean): Whether this check passed.
  - `detail` (string, optional): Additional details about the check.

### GET /models

Lists available generation models. The list is read from Flow and kept for an hour. While a job is using the Flow page, the list already read is returned; when none was read yet, the request fails with HTTP 409 and `job_running`.

**Response:**

```json
[
  {
    "name": "Omni 1.1 Flash",
    "kind": "video",
    "ratios": ["16:9", "9:16"],
    "resolutions": ["720p"],
    "durations": [4, 6, 8, 10],
    "credits": {
      "720p-4s": 7,
      "720p-6s": 10,
      "720p-8s": 12,
      "720p-10s": 15
    },
    "audio": true
  },
  {
    "name": "Veo 3.1 - Lite",
    "kind": "video",
    "ratios": ["16:9", "9:16"],
    "resolutions": ["720p"],
    "durations": [8],
    "credits": 10,
    "audio": true
  },
  {
    "name": "Nano Banana 2.1",
    "kind": "image",
    "ratios": ["16:9", "9:16", "4:3", "1:1", "3:4"],
    "durations": [],
    "credits": 0,
    "audio": false
  }
]
```

**Fields:**

- `name` (string): Model name as shown in Flow; pass it as `model` in `POST /jobs`.
- `kind` (string): Type of generation ("image" or "video").
- `ratios` (array of strings): Supported aspect ratios.
- `resolutions` (array of strings, optional): Resolutions offered by Flow (for example "720p").
- `durations` (array of integers): Supported durations in seconds (empty for images).
- `credits` (number or object): Cost of one output: a flat cost, or a cost per resolution and duration keyed like "720p-8s".
- `audio` (boolean): Whether audio is supported.

### POST /jobs

Submits a new generation job.

**Request Body:**

Provide a JSON object with the following fields (from `JobRequest`):

- `type` (string, required): "video" or "image"
- `prompt` (string, required): Generation prompt (non-empty)
- `model` (string, optional): Model name as listed by `GET /models` (e.g., "Nano Banana 2.1"). If omitted, `defaultVideoModel` or `defaultImageModel` from the configuration is used; with neither set, the model currently selected in Flow is used.
- `ratio` (string, optional): Aspect ratio (e.g., "16:9", "1:1", "9:16")
- `duration` (integer, optional): Video duration in seconds (videos only)
- `resolution` (string, optional): Resolution, when Flow offers a choice (e.g., "720p" for Omni)
- `outputs` (integer, optional): Number of outputs to generate (1–4). Defaults to the configured `outputs` (1), so a job that leaves it out follows `config.json`
- `startFrame` (string, optional): Path to a starting frame image
- `endFrame` (string, optional): Path to an ending frame image
- `ingredients` (array of strings, optional): Reference images or media
- `characters` (array of strings, optional): Reference characters
- `project` (string, optional): Name or id of an existing project, as listed by `GET /projects`; a name that matches no project exactly is looked for as part of a project name. With neither `project` nor `newProject`, the job runs in the most recent project, or in a new one when the account has none
- `newProject` (`true` or string, optional): Runs the job in a new project: `true` keeps the name Flow gives it (the date and time), a string names it. Not together with `project`: the request fails with HTTP 400. If Flow does not save the name, the job fails with `project_not_renamed`
- `outDir` (string, optional): Output directory path. Defaults to the configured output folder.
- `upscale` (string, optional): Download quality: "original", "1080p" (the 2K upscale for images) or "4k". Left out, the best quality the user's Flow plan offers: 4K when the plan has it, else the 1080p/2K upscale, otherwise the original. A quality asked for is the only one tried: if Flow does not offer it, shows it disabled, or offers it only after a plan upgrade, the job fails with `download_tier_locked` or `upscale_unavailable` instead of downloading another quality
- `maxCredits` (integer, optional): Per-job credit limit for this job; it can only lower `maxCreditsPerJob`, never raise it (raise it with `confirm`)
- `confirm` (boolean, optional): `true` lets this job exceed both the per-job and monthly credit limits, whatever `maxCredits` says

**Response (201):**

```json
{
  "id": "20261002-143000000-a1b2",
  "request": {
    "type": "image",
    "prompt": "A serene landscape",
    "model": "Nano Banana 2.1",
    "ratio": "1:1",
    "outputs": 1,
    "outDir": "C:\\Users\\me\\Documents\\FlowPilot",
    "modelFromConfig": false
  },
  "status": "queued",
  "createdAt": "2026-10-02T14:30:00.000Z",
  "results": []
}
```

**PowerShell Example:**

```powershell
$token = Get-Content "$env:APPDATA\FlowPilot\token"
$body = @{
    type = "image"
    prompt = "A serene landscape"
    model = "Nano Banana 2.1"
    ratio = "1:1"
    outputs = 1
} | ConvertTo-Json

$response = Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:47820/jobs" `
  -Headers @{ "Authorization" = "Bearer $token" } `
  -ContentType "application/json" `
  -Body $body

$response.id
```

**curl Example:**

```bash
TOKEN=$(cat ~/.config/flowpilot/token)
curl -X POST http://127.0.0.1:47820/jobs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "image",
    "prompt": "A serene landscape",
    "model": "Nano Banana 2.1",
    "ratio": "1:1",
    "outputs": 1
  }'
```

### GET /jobs

Lists all jobs, newest first.

**Response:**

```json
[
  {
    "id": "20261002-143000000-a1b2",
    "request": {
      "type": "image",
      "prompt": "A serene landscape",
      "model": "Nano Banana 2.1",
      "ratio": "1:1",
      "outputs": 1,
      "outDir": "C:\\Users\\me\\Documents\\FlowPilot",
      "modelFromConfig": false
    },
    "status": "done",
    "createdAt": "2026-10-02T14:30:00.000Z",
    "startedAt": "2026-10-02T14:30:00.020Z",
    "finishedAt": "2026-10-02T14:30:40.500Z",
    "credits": 0,
    "balance": 640,
    "results": [
      {
        "path": "C:\\Users\\me\\Documents\\FlowPilot\\20261002-143000000-a1b2-1.jpg",
        "type": "image",
        "mediaId": "70676be7-04f1-40d5-82b5-a84bb633d486"
      }
    ]
  }
]
```

### GET /jobs/:id

Retrieves details of a specific job.

**Response:**

```json
{
  "id": "20261002-143000000-a1b2",
  "request": {
    "type": "image",
    "prompt": "A serene landscape",
    "model": "Nano Banana 2.1",
    "ratio": "1:1",
    "outputs": 1,
    "outDir": "C:\\Users\\me\\Documents\\FlowPilot",
    "modelFromConfig": false
  },
  "status": "done",
  "createdAt": "2026-10-02T14:30:00.000Z",
  "startedAt": "2026-10-02T14:30:00.020Z",
  "finishedAt": "2026-10-02T14:30:40.500Z",
  "credits": 0,
  "balance": 640,
  "results": [
    {
      "path": "C:\\Users\\me\\Documents\\FlowPilot\\20261002-143000000-a1b2-1.jpg",
      "type": "image",
      "mediaId": "70676be7-04f1-40d5-82b5-a84bb633d486"
    }
  ]
}
```

**PowerShell Example:**

```powershell
$token = Get-Content "$env:APPDATA\FlowPilot\token"

$response = Invoke-RestMethod `
  -Method Get `
  -Uri "http://127.0.0.1:47820/jobs/20261002-143000000-a1b2" `
  -Headers @{ "Authorization" = "Bearer $token" }

$response | ConvertTo-Json
```

**curl Example:**

```bash
TOKEN=$(cat ~/.config/flowpilot/token)
curl -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:47820/jobs/20261002-143000000-a1b2
```

### DELETE /jobs/:id

Cancels a queued job. Only queued jobs can be cancelled; attempting to cancel a job in any other state returns HTTP 409.

**Response:**

The cancelled job (HTTP 200), with `status` set to `cancelled` and `finishedAt` set.

### GET /jobs/:id/files/:index

Retrieves the result file bytes for a specific output in a job.

**Parameters:**

- `index` (integer): The index of the output file (0-based, up to `outputs - 1`)

**Response:**

Raw file bytes with appropriate `Content-Type` header (e.g., `image/png`, `video/mp4`).

### GET /projects

Lists the Flow projects, most recent first: the order of Flow's project grid, which is by creation, not by last use. The
first one is where a job without `project` or `newProject` runs. While a job is using the Flow page, the request fails
with HTTP 409 and `job_running`.

**Response:**

```json
[
  { "id": "9fcb00a0-a732-4a37-9bd5-4e0a66bd1fc5", "name": "My project" },
  { "id": "a89ad790-6b93-40e3-8227-fca5bb13ef29", "name": "Oct 22 - 17:50" }
]
```

If Flow's home shows "Error loading projects" even after FlowPilot reloads it twice, the request fails with
`projects_unavailable` (HTTP 500): try again in a minute.

### DELETE /projects/:project

Deletes a Flow project with all its media. It cannot be undone.

**Path parameters:**

- `project` (string): The project's exact name (case aside) or its id. A partial name never matches (`project_not_found`,
  HTTP 404), and a name two projects share fails with `project_ambiguous` (HTTP 409), whose message lists their ids.

**Request Body:**

- `confirm` (boolean, required): Must be `true`; without it the request fails with HTTP 400 and deletes nothing.

FlowPilot clicks _Delete project_ on the project's card in Flow's home, confirms Flow's dialog, and waits for the card to
leave the page. If it stays, the request fails with `project_not_deleted`. While a job is using the Flow page, the
request fails with HTTP 409 and `job_running`.

**Response (200):** the deleted project.

```json
{ "id": "91c79037-7a77-4bfd-b0dd-c5aa13f17dd5", "name": "My project" }
```

**curl Example:**

```bash
TOKEN=$(cat ~/.config/flowpilot/token)
curl -X DELETE "http://127.0.0.1:47820/projects/My%20project" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "confirm": true }'
```

### GET /media

Lists the images and videos already in a Flow project, to download one of them with `POST /media/download` instead of
generating it again. It spends no credits.

**Query parameters:**

- `project` (string, optional): Project name or id. Left out, the most recent project.

The list drives the Flow page, so it never runs at the same time as a job: when a job is running, the request waits
for it to finish, then runs before the jobs still queued, and `queued` is `true`. FlowPilot opens each media in Flow's
viewer to read its id, so the list takes about two seconds per media.

**Response:**

```json
{
  "project": { "id": "25b7a0e8-061b-479c-8044-acf421effd5f", "name": "My project" },
  "queued": false,
  "media": [
    {
      "id": "38ad2cc9-bd6e-459a-8a39-1bd35d4d887b",
      "type": "video",
      "title": "Red kite flying over hill"
    },
    { "id": "4f1f999f-3d8b-4f91-9415-718ba047dd2f", "type": "image", "title": "photo.jpg" }
  ]
}
```

**Fields:**

- `project` (object): The project listed, with its `id` and `name`.
- `queued` (boolean): `true` when the list had to wait for a running job.
- `media` (array): One entry per media, in Flow's order.
  - `id` (string): The id in the media's Flow address (`/project/<project>/edit/<id>`), the same a job records in `results[].mediaId`. An image also has a second id, the one the error of a failed job lists: `POST /media/download` accepts both.
  - `type` (string): "image" or "video".
  - `title` (string): The title Flow shows. Flow reuses titles, so two media can have the same one: use the id.

**PowerShell Example:**

```powershell
$token = Get-Content "$env:APPDATA\FlowPilot\token"

$list = Invoke-RestMethod `
  -Method Get `
  -Uri "http://127.0.0.1:47820/media?project=My%20project" `
  -Headers @{ "Authorization" = "Bearer $token" }

$list.media | Format-Table id, type, title
```

**curl Example:**

```bash
TOKEN=$(cat ~/.config/flowpilot/token)
curl -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:47820/media?project=My%20project"
```

### POST /media/download

Queues the download of a media already in a Flow project, as a job. It generates nothing and spends no credits: it is
the way to get a result back without generating it again, for example after a job that failed once Flow had already
generated (an image job that fails after finding its results in Flow (for example while downloading them) lists their ids in its error).

**Request Body:**

- `mediaId` (string, required): The media id, from `GET /media` or from a job (`results[].mediaId`, or the error of a failed job).
- `project` (string, optional): Project name or id. Left out, the most recent project.
- `outDir` (string, optional): Output directory path. Defaults to the configured output folder.
- `upscale` (string, optional): Download quality, as in `POST /jobs`. A file you uploaded to Flow has no quality to choose: it is downloaded as it is, unless a quality other than "original" is asked for, which fails with `upscale_unavailable`.

The file is saved as `<project>-media-<id>` with the extension Flow gives it; characters Windows does not allow in a
file name (`\ / : * ? " < > |`) become `-`.

**Response (201):**

The queued job. Follow it with `GET /jobs/:id`: when it is `done`, `results` holds the file.

```json
{
  "id": "20261022-133428292-cbb0",
  "request": {
    "type": "download",
    "mediaId": "38ad2cc9-bd6e-459a-8a39-1bd35d4d887b",
    "project": "My project",
    "outDir": "C:\\Users\\me\\Documents\\FlowPilot"
  },
  "status": "queued",
  "createdAt": "2026-10-22T13:34:28.292Z",
  "results": []
}
```

A media id that Flow does not show in the project fails the job with `media_not_found`.

**PowerShell Example:**

```powershell
$token = Get-Content "$env:APPDATA\FlowPilot\token"
$body = @{
    mediaId = "38ad2cc9-bd6e-459a-8a39-1bd35d4d887b"
    project = "My project"
} | ConvertTo-Json

$response = Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:47820/media/download" `
  -Headers @{ "Authorization" = "Bearer $token" } `
  -ContentType "application/json" `
  -Body $body

$response.id
```

**curl Example:**

```bash
TOKEN=$(cat ~/.config/flowpilot/token)
curl -X POST http://127.0.0.1:47820/media/download \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "mediaId": "38ad2cc9-bd6e-459a-8a39-1bd35d4d887b", "project": "My project" }'
```

### GET /credits

Retrieves credit information for the account.

**Response:**

```json
{
  "monthTotal": 250,
  "maxCreditsPerJob": 20,
  "monthlyCreditLimit": 1000,
  "remaining": 750,
  "flowBalance": {
    "credits": 640,
    "readAt": "2026-10-06T21:22:36.933Z"
  }
}
```

**Fields:**

- `monthTotal` (integer): Credits spent this month through FlowPilot (FlowPilot's own ledger).
- `maxCreditsPerJob` (integer): Maximum credits allowed per job.
- `monthlyCreditLimit` (integer): Monthly credit budget configured in FlowPilot.
- `remaining` (integer): `monthlyCreditLimit` minus `monthTotal`.
- `flowBalance` (object, optional): Real Google Flow balance of the account, read from Flow's account panel. While a job is running, the last balance read. Missing when Flow cannot be read (for example Chrome not signed in).
  - `credits` (integer): Credits left on the account.
  - `readAt` (string): ISO 8601 timestamp of the reading.

### GET /config

Retrieves current configuration values. Optional keys that are not set (`defaultVideoModel`, `defaultImageModel`, `locale`) are omitted.

**Response:**

```json
{
  "outputDir": "C:\\Users\\me\\Documents\\FlowPilot",
  "outputs": 1,
  "maxCreditsPerJob": 20,
  "monthlyCreditLimit": 1000,
  "port": 47820,
  "logLevel": "info",
  "acceptUploadRights": true,
  "idleMinutes": 30,
  "showBrowser": false
}
```

### PUT /config/:key

Updates a configuration value. The value is always sent as a string; numeric and boolean keys are converted.

**Request Body:**

```json
{
  "value": "47821"
}
```

**Response:**

The whole configuration after the change, in the same format as `GET /config`.

### POST /shutdown

Gracefully shuts down the API server.

**Response:**

```json
{
  "ok": true
}
```

## Job Object

The `Job` object represents a generation task, or the download of a media already in Flow (`POST /media/download`).

**Fields:**

- `id` (string): Unique job identifier, built from the creation time (e.g., "20261002-143000000-a1b2").
- `request` (object): The request that created this job. For a download, the body of `POST /media/download` with `type` set to "download" and `outDir` filled in. For a generation, the `JobRequest`, with what it left out filled in from the configuration (`model`, `outputs`, `outDir`), plus one field the service sets itself:
  - `modelFromConfig` (boolean): `true` when `model` came from `defaultVideoModel` or `defaultImageModel`, the only case in which a model Flow no longer offers may be replaced by its successor. A value sent by the client is ignored.
- `status` (string): Current status (see below).
- `createdAt` (string): ISO 8601 timestamp when the job was created.
- `startedAt` (string, optional): ISO 8601 timestamp when generation started.
- `finishedAt` (string, optional): ISO 8601 timestamp when the job completed.
- `credits` (integer, optional): Credits spent on this job.
- `balance` (integer, optional): Google Flow credits left on the account after the job, read from Flow. Missing when Flow could not be read.
- `results` (array): List of downloaded files (empty until the job completes), each with `path`, `type` and, when known, `mediaId`. A file counts only when it is on disk and not empty; otherwise the job fails with `download_failed`.
- `modelUsed` (string, optional): The model the job really ran with. It differs from `request.model` when a configured default model Flow no longer offers was replaced by its successor, so a client can read what ran without parsing the note.
- `note` (string, optional): Something worth telling the user about how the job ran, in words. Present when a configured default model Flow no longer offers was replaced by its successor, so the client can show why the job used a different model.
- `error` (object, optional): Error details if the job failed.
  - `code` (string): Error code (e.g., "credits_over_job_limit", "agent_mode_on").
  - `message` (string): Human-readable message. When a generation fails after finding its results in Flow (for example while downloading them), the message lists their ids for an image job (a video tile in Flow carries no id), to download them with `POST /media/download` instead of generating them again; `GET /media` finds them otherwise.
  - `detail` (string, optional): First line of the original error when the failure was unexpected.

## Job Statuses

Jobs progress through the following statuses:

- `queued`: Waiting to start. Can be cancelled.
- `running`: Generation in progress, or a download job opening its project.
- `downloading`: Downloading the content.
- `done`: Completed successfully.
- `failed`: The job failed.
- `cancelled`: Job was cancelled by the user.
- `interrupted`: Job was interrupted (e.g., server shutdown).

Jobs run one at a time. Only one job can be in `running` or `downloading` status at any moment.
