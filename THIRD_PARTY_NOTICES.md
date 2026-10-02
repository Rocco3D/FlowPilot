# Third-party notices

FlowPilot contains code derived from the following project.

## gflow-cli

- Source: https://github.com/swissmarley/gflow-cli
- License: MIT
- Derived parts: the Chrome session handling (plain sign-in window, then a debugging-port session attached over the Chrome DevTools Protocol, language forcing, window visibility) in `src/browser/session.ts` and `src/browser/processes.ts`; overlay dismissal, click fallback, settings popover handling and ratio icon map in `src/flow/selectors.ts`, `src/flow/overlays.ts` and `src/flow/settings-read.ts`; result detection and the download path in `src/flow/results.ts` and `src/flow/download.ts`.

```
MIT License

Copyright (c) 2026 swissmarley

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
