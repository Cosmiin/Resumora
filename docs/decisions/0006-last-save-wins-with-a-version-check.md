---
id: 6
title: Last save wins, but a save from an old version gets a warning
date: 2026-11-04
status: accepted
affects: [table:base_cvs, route:/v1/cv]
concepts: [version-check]
---
## What we decided
Every CV row has a `version` number. A save (`PUT /v1/cv`) sends the version it started from. If someone saved in between (another tab, another device), the API answers `409 Conflict` and the editor offers "Load latest" or "Keep my version".

## Options we considered
- **Last save simply wins.** Easy, but a forgotten tab could silently erase newer work.
- **Lock the CV while someone edits it.** Safe, but a closed tab could leave it locked.
- **Version check (chosen).**

## Why this one
It's almost as simple as "last save wins" and still never loses work without telling the user.

## What it means in practice
The check happens inside the database function `save_base_cv`, so two saves can't both slip through at the same moment.
