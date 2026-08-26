# aboard-vscode

A VS Code extension that gives the [`aboard`](https://github.com/exoport/aboard)
board a native home inside the editor: a `TreeView` of a project's tabs in the
sidebar, with the board itself rendered in a webview panel.

It is a **viewer**. No rendering, no state, and no schema knowledge live here, and
none should ever be added; everything it shows comes from the running `aboard` (or
`ape aboard`) server over plain HTTP, the same way any other client reads it. When
`aboard` grows a sixteenth renderer this extension needs zero changes — if it ever
does, something here is wrong.

> **Status: implemented, and UNVERIFIED in a real VS Code.**
> Every pure part is covered by `npm test` (105 assertions, `node --test`, no
> framework), and the HTTP client has been run
> against a live `aboard serve` (discovery from a nested directory and from a
> `--base-path` server, two boards on one project including a dotted `--name`,
> `/health` verification, `/capabilities`, `/aboard.json`, compare-and-set writes
> as `human`, dismiss, approve and deny, and SSE frames arriving with the `ui`
> frame dropped). **Nothing in this repository has been loaded into VS Code**: no Extension Development Host, no
> `.vsix`, no `code --install-extension`. The tree, the panel, the webview CSP,
> the port mapping and every menu contribution are unproven in the only place
> that can prove them. `docs/handoff.md` §11 is the hand-verification checklist,
> and it is entirely unticked.

## Build

```sh
npm ci
npm run build     # → dist/extension.js
npm test          # node --test, no framework
```

No runtime dependencies. Dev only: `typescript`, `esbuild`, `@types/vscode`,
`@types/node`.

## The contract it consumes

This is the whole coupling between the two repositories — a contract, not a shared
file. It is `docs/reference/http-api.md` in the `aboard` repo, reduced to the parts
a viewer uses.

| call | use |
|---|---|
| `<root>/.aboard/run/instance.json`, found by **walking up** from each workspace folder | port discovery, mirroring how `aboard` itself finds its project root. Never assume a port: it is derived from the discovered root's path. `instance.<name>.json` is a named board on the same project. |
| `GET /health` | liveness; `version` for the status bar; `project`, compared against the discovered root (a stale instance file from a dead server is otherwise indistinguishable from a live one); `app`, which is `aboard` or `ape-aboard`; `base`, the URL prefix when the server was started with `--base-path`. |
| `GET /aboard.json` | the tree: per tab `id`, `name`, `type`, `note`, `touched{by,at,note}`, `pendingRemoval{by,reason}`. |
| `GET /events` (SSE) | live refresh. Three frame kinds on one stream, told apart by key: `origin` → the state changed; `waiters` → the notify count changed; `ui` → the *page's* own code changed, which the board handles itself and **this extension ignores entirely**. |
| `GET /capabilities` | `{type, label, blurb, …}` per renderer, for tooltips, and `schema` for noticing drift — so no type label and no schema number is hardcoded here. |
| `POST /aboard.json` | writes: the whole document plus `__base`, `__by: "human"`, `__origin: "vscode"`. `409` → re-read, redo the edit, retry **once**, then tell the human. |
| `POST /poke` · `GET /waiters` | the notify channel: a status-bar item and a command. |
| `#tab=<id>` on the board URL | navigation, and "copy link to this tab". |

Three facts the design rests on:

- **`__base` is the `rev`**, a counter the server increments on every accepted
  write — *not* `updatedAt`. A millisecond timestamp is not a token: two writes
  inside one millisecond share a string, and a base built from the first still
  matched after the second had landed. A document with no `rev` at all predates
  the counter, and only then does this extension fall back to `updatedAt`.
- **An absent `__by` is `"unknown"`, which has agent powers only.** Dismissing a
  change marker, deleting a tab and answering a removal request are things the
  server refuses from an agent — by carrying the old value forward, with a `200`.
  Get `__by` wrong and every human-only action here becomes a silent no-op.
- **A fragment-only change to an iframe's `src` fires `hashchange` without
  reloading the page**, which is why switching tabs from the sidebar costs no
  reload, no dropped SSE stream and no lost zoom. A changing `r=` counter rides
  along because the board does not write the hash back when the human switches
  tabs inside it, so the URL can already read `#tab=bb71` while the page shows
  something else.

### Two things the board still owes this extension

Both are `handoff-board-for-vscode-panel.md` §4–§5 in the `aboard` repo, and
neither has landed. The extension codes for both anyway, because both are free to
send and cost a change here later:

- **`?chrome=notabs`** — hide the board's own tab strip. Until it lands the panel
  shows two tab strips, one above the other. Ugly, fully functional.
- **`{__aboard: 'active', tab}`** — the board announcing its own tab switches.
  Until it lands the sidebar highlight follows clicks that started in the tree and
  drifts when the human presses `[`, `]` or `1`–`9` inside the panel.

## What it does

- **Tree** in `aboard.json` order, always — the order is the human's. Label is the
  tab name (`(unnamed)` when empty, as the board itself says), description is the
  id, tooltip is `bb71 · Kanban` from `/capabilities` followed by the tab's `note`
  verbatim. A periwinkle dot for a changed tab, red for a removal request, removal
  winning when a tab has both. `TreeView.badge` counts the changed ones.
- **Panel**: one `<iframe>` on the running board, `retainContextWhenHidden`, and
  `portMapping` + `asExternalUri` so it works over Remote SSH and Codespaces.
- **Actions**, all writes the board permits from a human: dismiss a change,
  approve or deny a removal request, rename, set the note, notify a waiting
  session, copy an id or a deep link.
- **More than one board** in one window — a multi-root workspace, or one project
  serving a named board beside its default — gets a row each, so the tree says
  which is which.

## Layout

```
package.json            contributes, activation, commands, menus
esbuild.mjs             one bundle to dist/extension.js
src/
  extension.ts          activate(): discover, register the tree and the commands
  board.ts              HTTP client and the discovery walk — no `vscode` import
  model.ts              document → what the tree shows, and the edits — no `vscode` import
  sse.ts                frame parsing and the reconnect delay — no `vscode` import
  launch.ts             which start command, and the PATH probe — no `vscode` import
  messages.ts           the webview envelope, parsed rather than trusted
  tree.ts               TreeDataProvider, a translation of model.ts
  panel.ts              WebviewPanel host and the bridge
  tokens.ts             the ONE place a colour is copied from aboard's app.css
media/
  panel.html            the shell: CSP, one iframe, the ~20-line bridge
  dot-change.svg        --agent  #a7adf4
  dot-removal.svg       --danger #ff0066
  activity.svg          the activity-bar icon (currentColor; VS Code tints it)
```

The `vscode` import stops at `extension.ts`, `tree.ts` and `panel.ts` on purpose:
everything with a rule worth arguing about lives on the other side of that line,
where `node --test` can reach it.

## Install

There is no `.vsix` yet, deliberately — see `docs/handoff.md` §9. The loop today is
F5 from this repo, which opens an Extension Development Host. Open VSX later if
someone asks; never the Marketplace, because to anyone without an `aboard` project
this installs, finds nothing, and does nothing.

`docs/handoff.md` carries the full design, the milestone plan, and the reasoning
behind every decision summarised above.
