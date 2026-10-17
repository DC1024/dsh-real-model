# dsh-real-model

A DeepSeek Harness (DSH) plugin that reveals the **real upstream model** behind each assistant reply — not the routing-group label (`group/smart-split`) the UI shows.

## What it does

- **UI chip**: adds a small tag at the tail of every completed turn showing the actual serving model for that turn (e.g. `deepseek-v4.1-flash`, `glm-5.3-flash`). Hover for details.
- **`real_model` tool**: callable from chat to inspect any session's per-reply real models, with per-model counts.

Data source: each `assistant/message` in the session log (`session.vN.jsonl.zstd`) records
`source.replayState.response.responseModel` — the model the provider actually served.
The UI label is only the magpie routing group. One session can mix models across turns/steps.

## Install

```
pnpm pack
```
Then in DSH: Settings → Plugins → install the tarball (or `plugin_manager install_bundle <tarball>`), restart DSH.

## How it works

- Host half (`lib/index.js`):
  - `root.inject(['tools'], …)` registers the `real_model` tool (multi-frame zstd session-log parser).
  - `root.inject(['webServer'], …)` registers `GET /dsh-real-model/turn-model?turn=N` returning the turn's real model (majority vote across the turn's steps).
- Client half (`lib/client.js`):
  - Registers a `conversation.chat.turnTail` slot entry rendering the per-turn chip, fetching from the route above.

## Notes

- Session log locations checked: `%APPDATA%/dsh-desktop/harness/sessions` and `$DSH_HOME/sessions`.
- Requires DSH restart after install (`restart-required`).
