# Contributing

- Requires Node.js 22.12 or newer.
- Scripts: `npm run build`, `npm run dev`, `npm run typecheck`, `npm run lint`, `npm run format`, `npm run format:check`, `npm test`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).
- Every update raises the version in `package.json` by 0.0.1 (`npm version patch --no-git-tag-version`) and adds its changes to `CHANGELOG.md`. `flowpilot doctor` compares the installed version with `main` on GitHub to tell users an update is available.
- Everything is in English: code, comments, docs, commits.
- Every user-facing string goes through i18n (`t(key, params)`), never hard-coded.
- Never hard-code Google Flow selectors outside `src/flow/selectors.ts`.
