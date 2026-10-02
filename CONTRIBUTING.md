# Contributing

- Requires Node.js 20 or newer.
- Scripts: `npm run build`, `npm run dev`, `npm run typecheck`, `npm run lint`, `npm run format`, `npm run format:check`, `npm test`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).
- Everything is in English: code, comments, docs, commits.
- Every user-facing string goes through i18n (`t(key, params)`), never hard-coded.
- Never hard-code Google Flow selectors outside `src/flow/selectors.ts`.
