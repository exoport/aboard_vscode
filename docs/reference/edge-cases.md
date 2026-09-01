# Edge cases and their status

The list that must be true before any public listing. The pure-logic half is handled and
unit-tested; the entries needing a real host say so.

| Case | Status |
| --- | --- |
| No workspace open; multi-root workspaces; a folder with no `.aboard/` | **Handled.** Discovery over zero folders returns nothing, two folders under one project root count as one board, and a folder with no `.aboard/` yields nothing — with `aboard.hasProject` picking between "no board is running" and "no project here", each with its own welcome text, so the two silences are distinguishable. |
| `instance.json` present but the server is dead, or answering for another project | **Handled and kept.** A candidate whose `/health` names another project, or does not answer, is dropped with the reason written to the Aboard output channel. |
| A board that dies **ungracefully**, leaving its record behind | **Handled in v0.1.3.** A clean shutdown deletes the record and the watcher notices; a SIGKILL, a crash, an OOM or a suspended machine leaves it verbatim, so a dropped event stream now arms a throttled `/health` re-check instead of being logged and discarded. Until it did, `aboard.hasBoard` stayed stuck true and there was no **Start the Board** button to press. |
| The port is occupied by something that is not a board | **Handled.** `app` must be `aboard` or `ape-aboard`, and a non-JSON answer is refused by the same path. |
| Two boards for two folders open at once | **Handled.** With more than one board the tabs sit under a row per board, labelled by folder and by `--name` where a project serves a named board beside its default. With exactly one, the tabs are top-level — a single always-open parent row is a wasted line. |
| Schema drift | **Handled.** The document's `version` is compared against `/capabilities`.`schema`, both read from the same server, so no schema number is hardcoded here. A mismatch is a warning notification, once, plus `schema mismatch` on the board's row for as long as it is true. |
| A board older than `?chrome=` | **Handled.** Probed once per board by reading the shell, and reported in one warning naming the board and its version. See [why the shell is probed](../explanation/why-the-shell-is-probed.md). |
| Errors surfaced as notifications, never swallowed | **Handled.** Every action failure is a notification carrying the server's own sentence; background noise — a dropped stream, an ignored instance file — goes to the output channel rather than interrupting. |
| No clipboard tool installed | **Handled.** macOS and Windows are refused by name rather than guessed at; a missing tool is reported with the command to install it, and the board still offers the picture and **Add this picture to the tab**, which needs no permission at all. The path has not been watched — see [observed in a real editor](observed-in-a-real-editor.md). |
| Remote SSH / Codespaces / vscode.dev | **Coded, UNVERIFIED.** `asExternalUri` and `portMapping` are set and the webview CSP's `frame-src` lists the externalised origin alongside both loopback spellings. On vscode.dev the framing origin is `https://*.vscode-cdn.net`, which aboard's CSP already lists. Only a real remote window can confirm it. |

## Five this list once called "handled" and were not

Each was found by review against a real `aboard serve` rather than reasoned about, and
all five are fixed. They share the shape everything here shares — **the failure mode is
silence** — and every one left the sidebar looking merely quiet, which is the same
picture as a board with nothing new on it.

- **A request could never settle.** `httpRequest` listened for `data` and `end` and nothing else, so a response cut off mid-body left the promise pending forever — and `discover()` holds its re-entrancy flag across that await, so ONE truncated answer stopped every future discovery for the life of the window. Every path settles exactly once now, and `test/board.test.ts` asserts it with a real socket destroy under an explicit timeout, because before the fix that test did not fail — it hung.
- **A board that stopped left its tabs in the tree.** `discover()` only rendered from inside `reloadAll()`, which iterates the entries, so with zero boards it rendered nothing at all and the dead board's tabs stayed listed and clickable. The welcome view could not appear either, because a view with children never shows one.
- **A named board with a dot in its name was invisible.** The board's own name rule allows dots, so `--name v1.2` writes `instance.v1.2.json`; the discovery regex used `[^.]+` for the name segment and skipped it. Reproduced with two live servers on one project.
- **A sole board with no document showed a blank sidebar.** With exactly one board its tabs are top-level, so when `/aboard.json` failed there was nothing to draw and no row to carry the reason. The board's own row is shown now, with the problem as its description.
- **The waiter count started as a guess.** The `waiters` frame is only sent when the count CHANGES, so a session that parked before the window opened was invisible: the status bar said "nothing to notify" while somebody was blocked on exactly that button. `/waiters` is read once per refresh and the frames keep it current.

One hardening change came with them: `media/panel.html` accepts a `goto` only for a src
that starts with the one the frame was rendered with. See
[the board contract](board-contract.md#messages-across-the-frame-boundary).

## See also

- [Observed in a real editor](observed-in-a-real-editor.md) — the rows a human has watched, which is a different question from whether a case is coded for.
- [Why not a marketplace listing](../explanation/why-not-a-marketplace-listing.md) — the reason the bar above is not currently being cleared for a store.
