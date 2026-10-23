# What FlowPilot drives in Flow

FlowPilot has no Flow API: it opens the Flow web interface in your own signed-in Chrome and works on the page like a
person would. This is what it touches, what it assumes about it, and what to check when Google changes the layout.

## The pages

- **Home** (`https://flow.google.com/?hl=en`): where the sign-in state is read from. Signed in means the _New project_
  button or the prompt box is visible, not signed in means the _Sign in_ button is.
- **Project grid**: projects are found by their `/project/<uuid>` links, once the page's loading indicator is gone, in Flow's order, which is by creation, not by
  last use. A job without a project opens the first project on the grid, or creates one when the grid is empty. A job
  with a new project clicks _New project_ and, when a name is given, types it in the project title. When the home shows
  _Error loading projects_, FlowPilot reloads it, at most twice, instead of reading an empty grid; Flow shows that
  message when the home is reloaded right after a deletion.
- **Deleting a project**: _Delete project_ on the project's card, then _Delete project_ in Flow's confirmation dialog
  ("Are you sure you want to delete this project?"). Flow drops the card from the open home, which FlowPilot waits for
  without reloading the page.
- **Project page** (the composer): where a job runs.
- **Media viewer** (`/project/<project>/edit/<id>`): one media of the project, opened by clicking it or straight from
  its address. It has a _Download media_ button, a rail with the thumbnails of the media around the one open, and controls
  that tell the type: _Save frame_ for a video, the cropping button for an image.

`hl=en` is forced on every Flow URL. Flow follows the Google account language, and the selectors expect the English
interface.

## The elements

Every selector lives in `src/flow/selectors.ts`, with a description of what it locates and a list of fallbacks. Each one
is a CSS selector plus visible text, an accessible name, or a placeholder, because Flow rebuilds its DOM often.

What a job needs on the project page:

| Element                                                                                                 | Used for                                                                    |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Project title field (`Editable text`)                                                                   | Naming a new project; Flow then shows the name in the tab title             |
| Prompt box                                                                                              | Clearing the composer, typing the prompt                                    |
| Submit button                                                                                           | Starting the generation, and waiting for it to become available again       |
| Settings trigger                                                                                        | The summary line of the current settings (`Video · 720p · 8s crop_16_9 x1`) |
| Mode buttons                                                                                            | Video or image mode                                                         |
| Model dropdown and menu items                                                                           | Reading the available models and choosing one                               |
| Output chips (`x1`–`x4`), resolution chips (`720p`, `1080p`), duration chips (`4s`)                     | Reading the settings currently in effect                                    |
| Credit line (`Use N credits`)                                                                           | The cost, read before submitting                                            |
| Add media dialog, ingredient chips, frame slots                                                         | Reference images, characters, start and end frames                          |
| Viewer _Download media_ button                                                                          | Downloading each result                                                     |
| Quality menu (`1K Original size`, `2K Upscaled`, `720p Original size`, `1080p Upscaled`, `4K Upscaled`) | Choosing the download quality                                               |
| Viewer thumbnail rail                                                                                   | Listing the media of a project                                              |

## How a job runs

1. Open the project page, make sure Agent mode is off, and clear the composer.
2. Read the settings that are in effect, apply what the request asks for, then read them again and compare. Any
   difference stops the job with `settings_not_applied` **before** anything is submitted.
3. Read the cost and check it against your limits.
4. Upload the references, type the prompt, submit.
5. Wait for the results at the top of the grid, where Flow shows the newest first: the job is done when the first
   results, as many as it asked for, are all missing from what was on the page before submitting, matched by their
   `data-media-id` or, for a video, which has none, by its thumbnail address. Only the top counts because in a large
   project Flow draws just part of the grid and draws other older results later: they are new to the page, not to the
   project. A grid sorted otherwise than newest first is not supported: the job ends with `generation_timeout`.
6. Open each result in the viewer and download it from _Download media_ at the quality asked for, or by default at
   the best the plan offers (4K, else the 1080p/2K upscale, else the original), write a JSON summary next to it,
   record what was spent.

Step 2 is the reason FlowPilot is careful about the model: the model actually in effect is compared with the one
asked for, so a request that silently ran with another model is a failure, not a result.

## What the page does that matters

- **The quality menu ignores the mouse** on its upscaled items: a click does nothing. FlowPilot selects the item from
  the keyboard, which works for every item.
- **A quality the plan does not include** is marked _Upgrade_, shown disabled, or missing. FlowPilot never picks it:
  without a quality asked for, it takes the next one down.
- **A file you uploaded** has no quality menu: _Download media_ downloads it as it is.
- **The grid unmounts** the media that scroll out of view, and a video tile carries no media id. The media list walks
  the viewer's rail instead, one thumbnail after the other, because the rail renders only the thumbnails around the
  media open. Each id comes from the viewer's address.
- **Right after a generation**, the viewer opened from the media's address keeps _Download media_ disabled; opened by
  clicking the result on the grid, it has the button enabled at once. A job opens its results by clicking them.
- **An image has two ids**: the one in its viewer address, which the media list gives and a job records, and the one
  on its image in the project grid (`data-media-id`), which the error of a failed job lists. The viewer opens from
  either.

## What it does not do

- **Agent mode**: not driven. It is detected, and if it cannot be turned off the job fails with `agent_mode_on`.
- **Renaming results in Flow**: not done. Flow reuses titles and makes them unreadable; results keep the names
  FlowPilot gives them on disk. Only a new project is named, when the job asks for a name.
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
