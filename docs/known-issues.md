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

`flowpilot models` prints the live list at any time, and is the fastest way to find a name to put in the
configuration.

There is one automatic case. When the model a job uses is the one configured as default (`defaultVideoModel` or
`defaultImageModel`) and Flow offers the **next version of the same name**, FlowPilot uses that one, says so on the
job result (`note`), updates the configuration once and writes both steps to the log. `Nano Banana 2` becomes
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

## Only the results a job just produced

A job downloads the files Flow produced while it was running, matched to the results that appeared during that
window. FlowPilot has no way to fetch an older generation later: a video made yesterday, or one made in another
project, is not reachable from here. If you need those files, download them from Flow while they are there, or keep
the folder FlowPilot already wrote them to.

There is also no automatic retry. A failed job stays failed and the queue moves on to the next one; run it again
yourself once you know why it failed.

## Flow's Agent mode must be off

Flow's Agent mode replaces the prompt composer FlowPilot drives. When it is on, jobs stop with `agent_mode_on`
instead of touching a page that is not the one they were written for. Turn it off in Flow, then run the job again.
`flowpilot selftest` checks it without spending credits.

## Flow is driven in English

Flow follows the Google account language, and the selectors expect the English interface, so FlowPilot opens Flow with
`hl=en`. The language of FlowPilot's own messages is separate and is set by the `locale` configuration key or the
`FLOWPILOT_LANG` environment variable.

## The service stops when idle

The service shuts down after `idleMinutes` without traffic (30 by default, `0` disables it) and closes the Chrome it
opened. The CLI and the MCP server start it again on the next command, so nothing has to be kept running by hand;
the first command after the pause takes a few seconds longer while Chrome starts.

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
