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
  "version": "0.1.0"
}
```

### POST /doctor

Checks the current session status including Chrome state, API connection, and authentication.

**Response:**

```json
{
  "chromeRunning": true,
  "connected": true,
  "signedIn": true,
  "profileDir": "/path/to/profile",
  "message": "All systems operational"
}
```

**Fields:**

- `chromeRunning` (boolean): Whether the Chrome process is running.
- `connected` (boolean): Whether FlowPilot is connected to Chrome.
- `signedIn` (boolean): Whether the user is authenticated.
- `profileDir` (string, optional): Path to the Chrome profile directory.
- `message` (string): Human-readable status message.

### POST /selftest

Checks the Flow UI without spending credits. Useful for verifying the setup works before running actual jobs.

**Response:**

```json
{
  "ok": true,
  "checks": [
    {
      "name": "Chrome process",
      "ok": true
    },
    {
      "name": "API connection",
      "ok": true,
      "detail": "Connected in 150ms"
    }
  ]
}
```

**Fields:**

- `ok` (boolean): Whether all checks passed.
- `checks` (array): List of individual checks.
  - `name` (string): Name of the check.
  - `ok` (boolean): Whether this check passed.
  - `detail` (string, optional): Additional details about the check.

### GET /models

Lists available generation models.

**Response:**

```json
[
  {
    "name": "flux-pro",
    "kind": "image",
    "ratios": ["16:9", "1:1", "9:16"],
    "resolutions": ["1024x576", "1024x1024", "576x1024"],
    "durations": [],
    "credits": {
      "1024x576": 5,
      "1024x1024": 8,
      "576x1024": 8
    },
    "audio": false
  },
  {
    "name": "kling-1.6",
    "kind": "video",
    "ratios": ["16:9", "1:1", "9:16"],
    "resolutions": [],
    "durations": [5, 10, 15],
    "credits": {
      "16:9-5s": 10,
      "16:9-10s": 20,
      "16:9-15s": 30
    },
    "audio": true
  }
]
```

**Fields:**

- `name` (string): Model identifier.
- `kind` (string): Type of generation ("image" or "video").
- `ratios` (array of strings): Supported aspect ratios.
- `resolutions` (array of strings, optional): Supported resolutions (images only).
- `durations` (array of integers): Supported durations in seconds (videos only).
- `credits` (number or object): Either a flat cost or keyed by option (e.g., "720p-8s").
- `audio` (boolean): Whether audio is supported.

### POST /jobs

Submits a new generation job.

**Request Body:**

Provide a JSON object with the following fields (from `JobRequest`):

- `type` (string, required): "video" or "image"
- `prompt` (string, required): Generation prompt (non-empty)
- `model` (string, optional): Model to use. If omitted, the default model for the type is used.
- `ratio` (string, optional): Aspect ratio (e.g., "16:9", "1:1", "9:16")
- `duration` (integer, optional): Video duration in seconds (videos only)
- `resolution` (string, optional): Resolution (e.g., "1024x1024") (images only)
- `outputs` (integer, optional): Number of outputs to generate (1–4, defaults to 1)
- `startFrame` (string, optional): Path to a starting frame image
- `endFrame` (string, optional): Path to an ending frame image
- `ingredients` (array of strings, optional): Reference images or media
- `characters` (array of strings, optional): Reference characters
- `project` (string, optional): Project identifier
- `outDir` (string, optional): Output directory path. Defaults to the configured output folder.
- `upscale` (string, optional): Upscale quality ("1080p" or "4k")
- `maxCredits` (integer, optional): Spend limit in credits

**Response (201):**

```json
{
  "id": "job-abc123",
  "request": {
    "type": "image",
    "prompt": "A serene landscape",
    "model": "flux-pro",
    "resolution": "1024x1024",
    "outputs": 1
  },
  "status": "queued",
  "createdAt": "2026-10-02T14:30:00Z",
  "results": [],
  "credits": null
}
```

**PowerShell Example:**

```powershell
$token = Get-Content "$env:APPDATA\FlowPilot\token"
$body = @{
    type = "image"
    prompt = "A serene landscape"
    model = "flux-pro"
    resolution = "1024x1024"
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
    "model": "flux-pro",
    "resolution": "1024x1024",
    "outputs": 1
  }'
```

### GET /jobs

Lists all jobs, newest first.

**Response:**

```json
[
  {
    "id": "job-abc123",
    "request": {
      "type": "image",
      "prompt": "A serene landscape",
      "model": "flux-pro",
      "resolution": "1024x1024",
      "outputs": 1
    },
    "status": "done",
    "createdAt": "2026-10-02T14:30:00Z",
    "startedAt": "2026-10-02T14:31:00Z",
    "finishedAt": "2026-10-02T14:35:00Z",
    "credits": 8,
    "results": [
      {
        "path": "/home/user/outputs/image-001.png",
        "type": "image",
        "mediaId": "media-xyz789"
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
  "id": "job-abc123",
  "request": {
    "type": "image",
    "prompt": "A serene landscape",
    "model": "flux-pro",
    "resolution": "1024x1024",
    "outputs": 1
  },
  "status": "done",
  "createdAt": "2026-10-02T14:30:00Z",
  "startedAt": "2026-10-02T14:31:00Z",
  "finishedAt": "2026-10-02T14:35:00Z",
  "credits": 8,
  "results": [
    {
      "path": "/home/user/outputs/image-001.png",
      "type": "image",
      "mediaId": "media-xyz789"
    }
  ]
}
```

**PowerShell Example:**

```powershell
$token = Get-Content "$env:APPDATA\FlowPilot\token"

$response = Invoke-RestMethod `
  -Method Get `
  -Uri "http://127.0.0.1:47820/jobs/job-abc123" `
  -Headers @{ "Authorization" = "Bearer $token" }

$response | ConvertTo-Json
```

**curl Example:**

```bash
TOKEN=$(cat ~/.config/flowpilot/token)
curl -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:47820/jobs/job-abc123
```

### DELETE /jobs/:id

Cancels a queued job. Only queued jobs can be cancelled; attempting to cancel a job in any other state returns HTTP 409.

**Response:**

Empty response with HTTP 204 on success.

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
  "monthTotal": 1000,
  "maxCreditsPerJob": 500,
  "monthlyCreditLimit": 10000,
  "remaining": 750
}
```

**Fields:**

- `monthTotal` (integer): Total credits used this month.
- `maxCreditsPerJob` (integer): Maximum credits allowed per job.
- `monthlyCreditLimit` (integer): Total monthly credit allocation.
- `remaining` (integer): Credits remaining this month.

### GET /config

Retrieves current configuration values.

**Response:**

```json
{
  "port": 47820,
  "outDir": "/home/user/outputs",
  "...": "..."
}
```

### PUT /config/:key

Updates a configuration value.

**Request Body:**

```json
{
  "value": "new_value"
}
```

**Response:**

```json
{
  "key": "port",
  "value": "47821"
}
```

### POST /shutdown

Gracefully shuts down the API server.

**Response:**

Empty response with HTTP 204 on success.

## Job Object

The `Job` object represents a generation task.

**Fields:**

- `id` (string): Unique job identifier.
- `request` (JobRequest): The original request that created this job.
- `status` (string): Current status (see below).
- `createdAt` (string): ISO 8601 timestamp when the job was created.
- `startedAt` (string, optional): ISO 8601 timestamp when generation started.
- `finishedAt` (string, optional): ISO 8601 timestamp when the job completed.
- `credits` (integer, optional): Credits spent on this job.
- `results` (array): List of generated files (empty until job completes).
- `error` (object, optional): Error details if the job failed.

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
