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

- **201**: Created (successful `POST /jobs`)
- **400**: Bad request (bad_request, config errors)
- **401**: Unauthorized (missing or invalid token)
- **404**: Not found (job_not_found, not_found)
- **409**: Conflict (job_not_cancellable)
- **413**: Payload too large (body over 1 MB)
- **500**: Server error (any other error code, e.g. chrome_not_found, internal)

## Endpoints

### GET /health

Health check. No authentication required.

**Response:**

```json
{
  "ok": true,
  "version": "0.1.1"
}
```

### POST /doctor

Checks the current session status including Chrome state, API connection, and authentication. It also checks whether a newer FlowPilot version is available on GitHub.

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
    "message": "FlowPilot 0.1.2 is available (installed: 0.1.1). Update with: npm install -g Rocco3D/FlowPilot (in a cloned repository: git pull, then npm install), then run: flowpilot service stop"
  }
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

### POST /selftest

Checks the Flow UI without spending credits. Useful for verifying the setup works before running actual jobs.

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

Lists available generation models. The list is read live from Flow, so it follows Flow's current models.

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
- `model` (string, optional): Model name as listed by `GET /models` (e.g., "Nano Banana 2.1"). If omitted, the model currently selected in Flow is used.
- `ratio` (string, optional): Aspect ratio (e.g., "16:9", "1:1", "9:16")
- `duration` (integer, optional): Video duration in seconds (videos only)
- `resolution` (string, optional): Resolution, when Flow offers a choice (e.g., "720p" for Omni)
- `outputs` (integer, optional): Number of outputs to generate (1–4, defaults to 1)
- `startFrame` (string, optional): Path to a starting frame image
- `endFrame` (string, optional): Path to an ending frame image
- `ingredients` (array of strings, optional): Reference images or media
- `characters` (array of strings, optional): Reference characters
- `project` (string, optional): Project identifier
- `outDir` (string, optional): Output directory path. Defaults to the configured output folder.
- `upscale` (string, optional): Upscale quality ("1080p" or "4k")
- `maxCredits` (integer, optional): Per-job credit limit for this job, instead of `maxCreditsPerJob`
- `confirm` (boolean, optional): `true` lets this job exceed the per-job and monthly credit limits

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
    "outDir": "C:\\Users\\me\\Documents\\FlowPilot"
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
      "outDir": "C:\\Users\\me\\Documents\\FlowPilot"
    },
    "status": "done",
    "createdAt": "2026-10-02T14:30:00.000Z",
    "startedAt": "2026-10-02T14:30:00.020Z",
    "finishedAt": "2026-10-02T14:30:40.500Z",
    "credits": 0,
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
    "outDir": "C:\\Users\\me\\Documents\\FlowPilot"
  },
  "status": "done",
  "createdAt": "2026-10-02T14:30:00.000Z",
  "startedAt": "2026-10-02T14:30:00.020Z",
  "finishedAt": "2026-10-02T14:30:40.500Z",
  "credits": 0,
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

### GET /credits

Retrieves credit information for the account.

**Response:**

```json
{
  "monthTotal": 250,
  "maxCreditsPerJob": 20,
  "monthlyCreditLimit": 1000,
  "remaining": 750
}
```

**Fields:**

- `monthTotal` (integer): Total credits used this month.
- `maxCreditsPerJob` (integer): Maximum credits allowed per job.
- `monthlyCreditLimit` (integer): Total monthly credit allocation.
- `remaining` (integer): Credits remaining this month.

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

The `Job` object represents a generation task.

**Fields:**

- `id` (string): Unique job identifier, built from the creation time (e.g., "20261002-143000000-a1b2").
- `request` (JobRequest): The original request that created this job.
- `status` (string): Current status (see below).
- `createdAt` (string): ISO 8601 timestamp when the job was created.
- `startedAt` (string, optional): ISO 8601 timestamp when generation started.
- `finishedAt` (string, optional): ISO 8601 timestamp when the job completed.
- `credits` (integer, optional): Credits spent on this job.
- `results` (array): List of generated files (empty until job completes).
- `error` (object, optional): Error details if the job failed.
  - `code` (string): Error code (e.g., "credits_over_job_limit", "agent_mode_on").
  - `message` (string): Human-readable message.
  - `detail` (string, optional): First line of the original error when the failure was unexpected.

## Job Statuses

Jobs progress through the following statuses:

- `queued`: Waiting to start. Can be cancelled.
- `running`: Generation in progress.
- `downloading`: Downloading generated content.
- `done`: Completed successfully.
- `failed`: Generation failed.
- `cancelled`: Job was cancelled by the user.
- `interrupted`: Job was interrupted (e.g., server shutdown).

Jobs run one at a time. Only one job can be in `running` or `downloading` status at any moment.
