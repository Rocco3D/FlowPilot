# Rules for AI agents

- English only: code, comments, docs, commits.
- Every user-facing string goes through `t(key, params)` (`src/i18n`). Never hard-code it.
- `temp/` (scratch files) and `internal/` are git-ignored. Never reference them from tracked files.
- Never name or link third-party reference implementations in tracked files.
- Simplicity first: the least code that solves the task, nothing speculative.
- Never trigger a Google Flow generation that spends credits without explicit user approval. Image generations with Nano Banana models cost 0 credits on the owner's plan; video generations cost credits.
- Flow DOM selectors live only in `src/flow/selectors.ts`.
- Commits follow Conventional Commits.

## Folder ownership by work track

- A: `src/browser`, `src/flow`
- B: `src/core`, `src/server/http.ts`, `src/server/auth.ts`
- C: `src/cli`, `src/server/mcp.ts`
- D: `README*`, `docs/`, `examples/`, `CHANGELOG.md`, `src/i18n/it/`

Shared contract files (`src/core/schemas.ts`, `src/flow/driver.ts`, `package.json`) change only when the task says so.
