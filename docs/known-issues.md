# Known issues and limits

What FlowPilot cannot do, and what it does when the Flow page changes underneath it. Everything here is something
a user can run into; the work still on the list lives in the repository issues.

## Flow renames or retires models

This is the one that breaks jobs most often. Model names are not stable: `Nano Banana 2` became `Nano Banana 2.1`,
and a model can disappear from the menu for a given account, plan or region.

When a job asks for a model Flow does not offer, the job fails with `option_not_available` and the message lists
every model that is actually available:

```
Flow does not offer model Nano Banana 2 with the current settings. Available: Nano Banana Pro, Nano Banana 2 Lite, Nano Banana 2.1.
```

`flowpilot models` prints the list Flow offers (read again after an hour), and is the fastest way to find a name to put in the
configuration.

There is one automatic case. When the model a job uses is the one configured as default (`defaultVideoModel` or
`defaultImageModel`) and Flow offers the **next version of the same name**, FlowPilot uses that one, says so on the
job result (`note`), updates the configuration once (unless it was changed while the job ran or could not be
written, which the note also says) and writes both steps to the log. `Nano Banana 2` becomes
`Nano Banana 2.1` this way. Nothing else is guessed: `Nano Banana 2` does not become `Nano Banana Pro`, a model
without a version is not replaced, and a model asked for explicitly with `--model` is never replaced, because you
asked for that one by name.

`flowpilot doctor` reports the same thing before you spend anything: the configured model, that Flow no longer offers
it, and the successor it will use.

## One session, one job at a time

FlowPilot drives one Chrome window with one Flow session, and jobs run one at a time in a queue. A second job
submitted while one is running waits; it does not run in parallel. This is deliberate: Flow only drives one composer
at a time, and two jobs sharing the page would read each other's results.

The consequence to know: two jobs cannot shorten each other's waiting time, and a long video blocks every image
queued after it.

While a job is using the page, the commands that read Flow do not touch it: `doctor` answers without the model
check and says so, `models` shows the list already read, or fails with `job_running` when there is none yet, and
`selftest` fails with `job_running`. Run them again when the job ends. A job asked for while one of them is reading
Flow waits for it to finish; for `doctor` that is about half a minute the first time, a few seconds after.

## Media already in Flow

A job downloads the files Flow produced while it was running, matched to the results that appeared during that
window. Anything else already in a Flow project, a video made yesterday or an image you uploaded, is reached through
the HTTP API (`GET /media`, `POST /media/download`) or the MCP tools (`list_media`, `download_media`): the list gives
each media's id, and the download fetches it without generating anything or spending credits. There is no CLI
command for it.

What to know:

- The list opens each media in Flow's viewer to read its id, so it takes about two seconds per media, and it waits
  for a running job first. Behind a long video the MCP server waits up to 45 minutes for it, but the assistant's own
  client may stop waiting sooner; asking again works.
- An image has two ids in Flow: the one in its viewer address, which the list gives and a finished job records, and
  the one the error of a failed job lists. The download accepts both, and the file name uses the one you asked with:
  `<project>-media-<id>`.
- Flow reuses titles, so the list can show two media with the same title. Use the id.

There is no automatic retry. A failed job stays failed and the queue moves on to the next one; run it again
yourself once you know why it failed.

## Download quality

Without `upscale`, FlowPilot downloads the best quality your Flow plan offers: it reads Flow's download menu and
takes 4K when the plan has it, else the 1080p/2K upscale, otherwise the original. An upscale that asks for a plan
upgrade, or that Flow shows disabled, counts as missing. If your plan charges credits for an upscale, the download
spends them: the credit limits apply to generating, not to downloading. `original` asks for the file as generated.

What has been measured, on the owner's plan in October 2026 only: the 2K and 1080p upscales cost no credits, 4K is
disabled, and Flow makes the upscale on request, so a download takes about 10 seconds longer for an image and up to a
minute for a video. Other plans may label, price or offer these qualities differently.

A quality you ask for is the only one tried: if Flow does not offer it, shows it disabled, or offers it only after a
plan upgrade, the job fails (`download_tier_locked`, `upscale_unavailable`) instead of downloading another one. A file
you uploaded to Flow has no quality to choose and is downloaded as it is. FlowPilot downloads from Flow's viewer; when the viewer cannot
be opened, the job fails with `viewer_not_opened`: the media stays in Flow and can be downloaded later.

A downloaded file counts only when it is on disk and not empty; otherwise the job fails with `download_failed`. When
an image job fails after Flow already generated its media, the error lists their ids (a video tile in Flow carries
no id), so they can be downloaded instead of generated again; otherwise `GET /media` or `list_media` finds them.

## A result Flow made but did not show

Once, in October 2026, an image job ended with `generation_timeout` after 15 minutes although Flow had generated the
image: it was in the project, but FlowPilot never saw it appear on the page. Image jobs ran fine on the next five
attempts, and the cause is not known. If it happens, the credits are already spent and the media is in Flow:
download it with `POST /media/download` or `download_media` instead of generating it again.

## Flow's Agent mode must be off

Flow's Agent mode replaces the prompt composer FlowPilot drives. When it is on, or its chat panel is open, FlowPilot
closes the panel and turns Agent mode off before reading models or running a job. When it cannot, the job stops with
`agent_mode_on` instead of touching a page that is not the one it was written for: turn it off in Flow, then run the
job again. `flowpilot selftest` checks it without spending credits.

## Flow is driven in English

Flow follows the Google account language, and the selectors expect the English interface, so FlowPilot opens Flow with
`hl=en`. The language of FlowPilot's own messages is separate and is set by the `locale` configuration key or the
`FLOWPILOT_LANG` environment variable.

## The service stops when idle

The service shuts down after `idleMinutes` without traffic (30 by default, `0` disables it) and closes the Chrome it
opened. The CLI and the MCP server start it again on the next command, so nothing has to be kept running by hand;
the first command after the pause takes a few seconds longer while Chrome starts.

Every CLI command and MCP tool call that talks to the service gives up if the service does not answer (60 seconds for the plain requests,
300 for the ones that drive Chrome, 45 minutes for the media list, which waits for a running job) and says so, instead
of waiting forever.

## Chrome on the FlowPilot profile

If you open Chrome yourself on the FlowPilot profile, FlowPilot will not use that window: Chrome only opens a
debugging port when it starts, and a second launch on the same profile only opens a tab in the window already
running. FlowPilot closes that Chrome, reopens the same profile with a debugging port, and tells you it did:

```
Chrome was already open on the profile, so FlowPilot closed it and reopened it with a debugging connection.
```

Tabs open in that window are lost. `flowpilot doctor` reports the same thing, so run it after opening the profile by
hand to see what FlowPilot did about it.

## Credits are Flow's decision

FlowPilot reads the cost Flow shows for the chosen settings, checks it against your limits, and records what the
generation actually cost. Flow is what charges the account, and it can change prices and plans: the costs in the
README are the ones observed in October 2026, not a promise. `flowpilot credits` shows what has been spent and what
is left.

## References and uploads

Reference images, start frames and end frames are uploaded through the Flow page, so they are subject to Flow's own
limits on number, size and format. Google's rights confirmation dialog is accepted automatically
(`acceptUploadRights`, on by default); if you turn it off, the dialog has to be accepted by hand while the job runs,
and the job fails if it is not.
