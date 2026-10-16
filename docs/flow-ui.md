# What FlowPilot drives in Flow

FlowPilot has no Flow API: it opens the Flow web interface in your own signed-in Chrome and works on the page like a
person would. This is what it touches, what it assumes about it, and what to check when Google changes the layout.

## The pages

- **Home** (`https://flow.google.com/?hl=en`): where the sign-in state is read from. Signed in means the _New project_
  button or the prompt box is visible, not signed in means the _Sign in_ button is.
- **Project grid**: projects are found by their `/project/<uuid>` links; a job without `--project` opens the first
  project on the grid, in Flow's own order, or creates one when the grid is empty.
- **Project page** (the composer): where everything else happens.

`hl=en` is forced on every Flow URL. Flow follows the Google account language, and the selectors expect the English
interface.

## The elements

Every selector lives in `src/flow/selectors.ts`, with a description of what it locates and a list of fallbacks. Each one
is a CSS selector plus visible text, an accessible name, or a placeholder, because Flow rebuilds its DOM often.

What a job needs on the project page:

| Element                                                                             | Used for                                                                    |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Prompt box                                                                          | Clearing the composer, typing the prompt                                    |
| Submit button                                                                       | Starting the generation, and waiting for it to become available again       |
| Settings trigger                                                                    | The summary line of the current settings (`Video · 720p · 8s crop_16_9 x1`) |
| Mode buttons                                                                        | Video or image mode                                                         |
| Model dropdown and menu items                                                       | Reading the available models and choosing one                               |
| Output chips (`x1`–`x4`), resolution chips (`720p`, `1080p`), duration chips (`4s`) | Reading the settings currently in effect                                    |
| Credit line (`Use N credits`)                                                       | The cost, read before submitting                                            |
| Add media dialog, ingredient chips, frame slots                                     | Reference images, characters, start and end frames                          |
| Loading indicator                                                                   | Telling "still generating" from "finished"                                  |
| Download media item, more options menu                                              | Downloading each result                                                     |

## How a job runs

1. Open the project page, make sure Agent mode is off, and clear the composer.
2. Read the settings that are in effect, apply what the request asks for, then read them again and compare. Any
   difference stops the job with `settings_not_applied` **before** anything is submitted.
3. Read the cost and check it against your limits.
4. Upload the references, type the prompt, submit.
5. Wait for the results, matching each new result by its `data-media-id` so results from earlier jobs in the same
   project are never mistaken for this job's.
6. Download each result, write a JSON summary next to it, record what was spent.

Step 2 is the reason FlowPilot is careful about the model: the model actually in effect is compared with the one
asked for, so a request that silently ran with another model is a failure, not a result.

## What it does not do

- **Agent mode**: not driven. It is detected, and if it cannot be turned off the job fails with `agent_mode_on`.
- **Media list**: not read. Only the results produced by the running job are downloaded.
- **Renaming in Flow**: not done. Flow reuses titles and makes them unreadable; results keep the names FlowPilot
  gives them on disk.
- **Batch jobs**: one job per project page state, one at a time.

## When Flow changes

Run the self-test:

```bash
flowpilot selftest
```

It spends no credits. It checks the sign-in state, opens a project, checks that Agent mode is off, reads the model
menu, and waits for each selector to be visible, reporting each one by name:

```json
{
  "ok": false,
  "checks": [{ "name": "selector:modelMenuItems", "ok": false, "detail": "..." }]
}
```

A failing `selector:<name>` line means that element cannot be found any more: the fix is in `selectors.ts`, adding a
fallback that matches the new markup. `flowpilot doctor` is the lighter check: Chrome, the connection, the sign-in,
the version, and whether the configured models are still offered.
