# Production audit: update pipeline (2026-09-24)

Baseline: `6c2feb52ca25d94d490031cdeb0eda168bbdf789` (`main`, `tymo1985-debug/Circuit-Workspace`).

## Root causes and regression points

1. **Only previously registered modules were checked.** `checkAll()` used
   `getRegistrations()` as the complete inventory. Regression point:
   `6c4acf2c35a72ac9869aaadb4d381c4b6914b81e` (04.09.2026), which introduced
   Hub-wide orchestration without registering missing scopes.
2. **False success.** Since `74fa5483cede3f0f0af0469962286fcb9ab947ed`
   success meant only that `reg.waiting` disappeared. There was no contract for
   the version of `reg.active`, so mixed/failed activation could be reported as complete.
3. **Mixed caches and broken/plain UI.** Since module workers began importing
   the shared registry in `76386ac4` (29.08.2026), any Hub bump could install a
   new worker. Cache names still contained only the module version, so install
   could overwrite the cache currently used by the old active worker. This is
   the direct old/new asset mixing path behind broken UI and hard-refresh recovery.
4. **Changelog existed but was invisible.** The release banner added in
   `83e3165700e9839c54e79cc43c6ce0f7e23f662c` nested its list inside a node
   marked `data-i18n`; the subsequent `CWI18n.apply()` replaced `textContent`
   and deleted the list. In addition, automatic Hub `updatefound` raced the
   detailed orchestration and could replace it with a generic banner.
5. **Partial results were not durable or specific.** Failed scopes were not
   preserved in the post-reload marker, and activation was not verified against
   the registry version.

## Repair

- `CW_MODULES` now contains each worker URL. Hub registers every module scope
  before checking, including never-opened modules.
- Every worker implements the `CW_VERSION` MessageChannel handshake. Hub checks
  the actual active version after activation; mismatch is a failure.
- Module cache names include both module and Hub versions, isolating installing,
  waiting, and active releases.
- Hub worker returns the waiting release manifest. Automatic discovery dispatches
  the same full orchestration used by the toolbar instead of a competing generic flow.
- The i18n pass cannot erase a nested changelog. Partial check/apply results keep
  exact module/scope information across the Hub reload.

## Regression gates and live proof

- `scripts/check-update-orchestration.mjs`: delayed install, rejected update,
  confirmed activation, timeout, and active-version verification.
- `scripts/check-update-contract.mjs`: complete worker inventory, version
  responder, cache namespace, Hub release responder.
- `scripts/live-update-pipeline.mjs`: real Google Chrome, persistent profile,
  all seven workers/caches primed at version A, one-action upgrade to version B,
  exact active-version query, changelog assertion, six module-return checks,
  HTML Hub return, and no hard refresh.

Live result: PASS (`0.41.58 → 0.41.59` synthetic next release); seven active
versions matched, changelog visible before apply, no module showed a false
open-Hub banner after success, and Hub returned as `text/html` with its UI intact.
