---
id: api-layer
title: The API layer
files: [apps/api/src/app.ts, apps/api/src/cv/routes.ts]
related: [jwt, queue]
---
## What it is
An API is a set of doors other programs can knock on, like `GET /v1/cv` ("give me my CV") or `PUT /v1/cv` ("save my CV"). Resumora's API is its own small server, running on Cloudflare Workers.

## Why Resumora uses it
It's the one place for rules, AI calls with secret keys, and consistent error messages. The web app only knows the doors, not how the database works behind them.

## What would break without it
Secret AI keys would have to be in the browser, where anyone could copy them, and every rule would need to be repeated wherever data is changed.

## Connections
Each door checks the login token first, then does its work. Slow work, like imports, is handed off to the queue instead of being done behind the door.

## Check question
**Q:** The web app shows "This CV was saved somewhere else first." Which layer decided that?
**A:** The API (with the database's `save_base_cv` function). It answered the save with `409 version_conflict`, and the web app just showed the message.
