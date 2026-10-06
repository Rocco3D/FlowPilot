# MCP server

`flowpilot mcp` starts a [Model Context Protocol](https://modelcontextprotocol.io) server over stdio. It lets AI assistants (Claude Code, Codex, Cursor, ...) generate videos and images through FlowPilot. It talks to the local HTTP API and starts the FlowPilot service automatically if it is not running.

## Credit warning

Videos spend your Google Flow credits (Veo 3.1 Lite 10, Fast 20, Quality 100, Omni 1.1 Flash 4-15 depending on resolution and duration). Images with Nano Banana models cost 0 credits on the owner's plan. Jobs run one at a time. The tool descriptions tell the assistant to confirm with you before spending credits.

## Tools

| Tool             | What it does                                                                                                                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generate_video` | Creates a video job. Fields: `prompt` (required), `model`, `ratio`, `duration`, `resolution`, `outputs`, `startFrame`, `endFrame`, `ingredients`, `characters`, `project`, `outDir`, `upscale`, `confirm` (lets the job exceed the credit limits), `wait` (default true). |
| `generate_image` | Same as `generate_video`, for images.                                                                                                                                                                                                                                     |
| `get_job`        | Status and results of a job (`id`).                                                                                                                                                                                                                                       |
| `list_jobs`      | Recent jobs (`limit`, default 20).                                                                                                                                                                                                                                        |
| `cancel_job`     | Cancels a job (`id`).                                                                                                                                                                                                                                                     |
| `list_models`    | Available models with ratios, durations and credit costs.                                                                                                                                                                                                                 |
| `get_credits`    | Credits spent this month through FlowPilot, remaining credits and limits, plus the real Google Flow balance read from Flow (`flowBalance`).                                                                                                                               |
| `selftest`       | Runs the service self-test.                                                                                                                                                                                                                                               |
| `doctor`         | Checks Chrome and the Google Flow session. When a newer FlowPilot version is on GitHub, the result has an `update` field with a message for the user.                                                                                                                     |

With `wait` true the generation tools poll every 3 seconds, for up to 30 minutes, until the job ends, and return the job with the result file paths and the Google Flow balance left (`balance`). With `wait` false they return the job id and status. Errors are returned as MCP tool errors in the form `code: message`.

## Configuration

Claude Code:

```
claude mcp add flowpilot -- flowpilot mcp
```

Codex, Cursor and other clients that use a JSON configuration:

```json
{
  "mcpServers": {
    "flowpilot": {
      "command": "flowpilot",
      "args": ["mcp"]
    }
  }
}
```

Use `flowpilot --port <port> mcp` to target a service on a non-default port.
