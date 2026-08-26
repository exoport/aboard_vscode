# Handoff — `aboard-vscode`: a VS Code extension that moves the tab strip into the sidebar

**Status:** M1–M5 **implemented, and UNVERIFIED in a real VS Code** (2026-08-26,
plan-2 item 8; reviewed and repaired the same day — see the end of §10). Every
pure part is covered by `npm test` (105 assertions, `node --test`, no framework)
and the HTTP client has been run against a live `aboard serve`; nothing in this repository has been loaded into VS Code — no
Extension Development Host, no `.vsix`. §11 below is the hand-verification
checklist and it is entirely unticked. **M6 (install, and running it in a real VS Code)
is not started because it is GATED ON THE HUMAN** — `§10` of
`development/planning/plan-2_finish-line.md` in the `aboard` repo, where the human decides
when. It is not the next thing to pick up; it is a question to ask.
**Rewritten from:** `handoff-vscode-extension-board-panel.md`, written 2026-08-24 on
the `board` spike by `agent-research`, stamped against spike commit `7e5a179`, VS Code
1.133, node 24.15, npm 11.12.
**Scope:** a thin VS Code extension — native `TreeView` of the board's tabs in the
sidebar, board content in a webview panel in the editor area. Local install from a
`.vsix`; Open VSX later if it earns it; never the Marketplace.
**Depends on:** `handoff-board-for-vscode-panel.md` (in the `aboard` repo) §4–§6.
Everything else it needs already exists or is settled by `aboard`'s own port plan
(`development/planning/plan-1_port-from-spike.md` there).

> This file is the repo's memory across sessions. Keep it current as milestones land;
> do not let it read like a proposal once half of it is built.

---

## 1. What this is, and what it must never become

A **viewer**. The `aboard` binary keeps serving the board; this extension adds a
second window onto it with better furniture. It owns exactly four things:

1. a sidebar tree of the board's tabs, with the change and removal-request dots;
2. a webview panel holding one `<iframe>` pointed at the running board;
3. navigation between the two;
4. a handful of human-only actions the board already permits over HTTP.

It owns **no** rendering, **no** state, **no** schema knowledge, and **no** copy of
anything in the `aboard` repo. When `aboard` grows a 16th renderer, this extension
should require zero changes — if it doesn't, something here is wrong. The state file
is the single source of truth and this extension reads it over HTTP like any other
client.

Three hard rules, inherited and re-checked against the ported project:

- **Never touch `.aboard/aboard.json` on disk.** All writes go through
  `POST /aboard.json` with compare-and-set — the mechanism that stops a concurrent
  agent's work from being destroyed.
- **Never assume you should launch a new server.** Check `.aboard/run/instance.json`
  and `GET /health` first; if a live server already answers for this project root,
  use it. `aboard` has no `--force`-restart concept to avoid here (unlike the spike,
  which had a `restart.sh -force` this document's predecessor explicitly warned
  against) — the risk in the ported world is simpler but still real: launching a
  second `aboard serve` against a project that already has one running just gets you
  two servers on two ports for one project, which is confusing for no benefit. Check
  before you start one.
- **Write as `__by: "human"`**, because a human clicked. Never `claude`, never
  `agent-*`. **This is stricter than it was on the spike**: the ported server no
  longer defaults an absent `__by` to `"human"` (a fixed bug — the build queue calls
  it `bb360`), so omitting `__by` now gets you `"unknown"` and agent-level powers
  only. Get this field right or every human-only action in §7 silently stops working.

## 2. Why a separate repo

`aboard` is Go with an embedded web tree, cobra CLI, otherwise dependency-light — a
deliberate choice recorded in its own `CLAUDE.md` and build plan. Dropping
`package.json`, `node_modules`, TypeScript and esbuild into that tree would quietly
repeal it. This extension also versions on a different clock (a `.vsix` reinstalled by
hand) and has a different audience (VS Code, not agents).

**Location, decided for this rewrite:** `/home/diegos/_dev/exoport/aboard_vscode`.
**Extension id:** `aboard-vscode`. **Display name:** `Aboard Panel` — a judgement
call recorded here since neither the spike's version of this document nor the port
plan named one; change it before publishing if the human prefers otherwise, but
keep it stable once chosen the same way an artifact's favicon stays stable.
**Publisher: `exoport`** — chosen when the scaffold landed, matching the Go module
path `github.com/exoport/aboard`. It is only a namespace today (nothing is
published anywhere) but it is baked into the `.vsix` filename and into an Open VSX
namespace later, so it is recorded here rather than left to whoever runs `vsce`
first. The alternative was leaving it out until publishing: `vsce package` refuses
without one, so that trade is "decide it now" against "decide it under time
pressure".

The coupling that remains is a **contract, not a shared file**: the HTTP surface in
§4, plus the three items in `handoff-board-for-vscode-panel.md` §4–§6. Write that
contract into this repo's own `README.md` and the two projects can move independently.

## 3. Why a native `TreeView` (and what it costs)

Unchanged reasoning from the spike version. The alternative — a `WebviewView` in the
sidebar reusing `app.css` — gives pixel-identical colour but costs everything a native
tree gets for free: keyboard nav, type-to-filter, collapse state, `TreeView.badge`,
context menus, reveal, and following the user's own VS Code theme rather than
`aboard`'s dark palette.

The one place the native tree pays a real cost is colour fidelity for the two status
dots, solved by shipping two 16×16 SVGs using the board's own token values directly —
**`--agent` `#a7adf4`** for a change, **`--danger` `#ff0066`** for a removal request.
(**Corrected from the spike-era draft of this document**, which named `--claude` for
the first token — that token was renamed to `--agent` on the spike on 2026-08-24, the
same day this document was originally written, and the draft simply predated the
rename landing. `aboard` carries the renamed token forward; there is no `--claude`
anywhere to reference.) Keep those two hex values in one file with a comment pointing
at `pkg/aboard/web/app.css` in the `aboard` repo, since they are the only place this
extension duplicates anything from it.

**How "one file" was actually done**, since an SVG cannot import a constant: the
values live in `src/tokens.ts` with that comment, and `test/tokens.test.ts` reads
both SVGs and fails if either has drifted from it. Writing the hex into two SVGs
and calling a paragraph the single source would have been a wish; this is the
version that breaks when it stops being true. The rename that motivated the
correction above is exactly the event it is guarding against.

## 4. The contract it consumes

| call | use |
|---|---|
| `<root>/.aboard/run/instance.json`, found by **walking up from the workspace folder** | port discovery — mirrors how `aboard` itself finds its project root (plan-1 decisions 4–5); never assume a port, it is derived from the discovered root's path |
| `GET /health` | liveness, `version` for the status bar, `project` (compare against the workspace folder — a stale instance file from elsewhere is otherwise indistinguishable from the real thing), and **`app`** — `"aboard"` or `"ape-aboard"`, see §6 |
| `GET /aboard.json` | the tree: per tab `id`, `name`, `type`, `note`, `touched{by,at,note}`, `pendingRemoval{by,reason}`; top-level **`rev`** is the CAS token |
| `GET /events` (SSE) | live refresh. Three frame kinds on one stream, told apart by key: `origin` → state changed, refresh the tree; `waiters` → notify count changed; `ui` → the *page's own* code changed, which `aboard` handles itself via its reload mechanism — this extension must ignore that frame kind entirely |
| `GET /capabilities` | `{type, label, blurb, gestures, …}` per renderer — use for tooltips instead of hardcoding type labels |
| `POST /aboard.json` | writes: whole document plus `__base` (the **`rev`** just read), `__by: "human"`, `__origin: "vscode"`. `409` means someone got there first: re-read, redo, retry once, then tell the user |
| `POST /poke` · `GET /waiters` | the notify channel — a sidebar button and a badge |
| `#tab=<id>` on the board URL | navigation, see §6 |

**The CAS token is `rev`, not `updatedAt` — corrected here after reading the ported
server.** The two rows above said `updatedAt`, which was true on the spike and is
not true now: plan-2 item 2 replaced it with `rev`, a counter the server increments
on every accepted write. The reason is worth carrying, because it is the kind of
mistake that looks like it works: a millisecond timestamp is not a token, two
writes inside one millisecond share a string, and a base built from the first still
matched after the second had landed — measured at 4 collisions in 60 sequential
writes, each an accepted write that destroyed another. A non-numeric `__base` is
still accepted, but *only* while the live document has no `rev` of its own; this
extension therefore sends `rev` when there is one and falls back to `updatedAt`
only on a board that predates the counter.

Two further facts this design rests on, both true independent of the port: the
shell can be framed cross-origin, and changing only the fragment of an iframe's
`src` fires `hashchange` in the frame **without reloading it** — so switching tabs
from the sidebar costs nothing: no reload, no dropped SSE stream, no remounted
renderers, no lost zoom or scroll.

## 5. Repo layout

```
aboard-vscode/
  package.json            contributes, activation, commands, menus
  tsconfig.json           strict; tsconfig.test.json extends it and emits to out/
  esbuild.mjs             one bundle to dist/extension.js
  .vscodeignore
  LICENSE  README.md      README carries the contract from §4
  src/
    extension.ts          activate(): discover, register tree + commands
    board.ts              HTTP client: discovery, state(), write(), poke(), events()
    model.ts              document → tree items, and the edits each action writes
    sse.ts                SSE frame parsing, frame kinds, the reconnect delay
    launch.ts             the start-command choice and the PATH probe
    messages.ts           the webview envelope, parsed rather than trusted
    tree.ts               TreeDataProvider<Node>
    panel.ts              WebviewPanel host + message bridge
    tokens.ts             the two hex values, in one place
  media/
    panel.html            the shell: CSP, one iframe, ~20 lines of script
    dot-change.svg        --agent #a7adf4
    dot-removal.svg       --danger #ff0066
    activity.svg          the activity-bar icon (currentColor — VS Code tints it)
  test/                   node --test, no framework, no vscode import anywhere
```

**Five source files rather than the four this section originally listed**, and the
line they are split on is not tidiness: `board.ts`, `model.ts`, `sse.ts`,
`launch.ts` and `messages.ts` do not import `vscode`, so every rule worth arguing
about — the discovery walk, `/health` acceptance, icon precedence, badge count,
what "dismiss" actually writes, SSE framing, which start command — is reachable
from `node --test`. `extension.ts`, `tree.ts` and `panel.ts` are the adapter above
that line and are the part no unit test covers.

`media/activity.svg` is a third asset this section did not anticipate: a
`viewsContainers.activitybar` contribution has no icon without one, and the two
status dots are the wrong shape for it. It is deliberately `currentColor` and NOT
a board token — VS Code tints activity-bar icons itself, so a periwinkle here
would be overridden and then look wrong in a light theme.

No runtime dependencies. Dev only: `typescript`, `esbuild`, `@types/vscode`,
`@types/node`, and later `@vscode/vsce`.

## 6. The two moving parts

### Discovery (`board.ts`)

Walk up from each workspace folder looking for `.aboard/run/instance.json` (mirror
`aboard`'s own root-discovery loop, plan-1 decision 5, rather than only checking the
folder's immediate root — a workspace opened on a subdirectory must still find it).
For each one found, `GET /health` and keep it only if `health.project` equals that
project root. That comparison rules out the two realistic failure modes: a stale
instance file from a server that died, and another project's board answering on a
port this extension guessed at.

**Reading the identity, and choosing the fallback command.** `health.app` (or the
instance file's own `app` field, before a server is even confirmed live) is
`"aboard"` or `"ape-aboard"` — plan-1 decision 6. Accept either as a live board.
When discovery finds **nothing running**, the "Start the board" fallback must pick a
command based on which binary is actually available, not guess one:

1. Check whether `aboard` is on `PATH`. If so, offer **`aboard serve`** in a new
   terminal (plain — never a force-restart flag, there isn't one to reach for).
2. Else check whether `ape` is on `PATH`. If so, offer **`ape aboard serve`**.
3. If neither is found, do not silently do nothing — show an error naming both
   commands and let the human install one.
4. If **both** are found, prefer `aboard` — it is the dedicated binary for this and
   the one whose identity the rest of this contract is written against; `ape aboard`
   exists for projects that already standardise on `ape` for everything. (Judgement
   call: plan-1 does not state a preference between the two when both are present:
   record this choice here if changing it.)

After launching either, poll `/health` for a few seconds rather than assuming success
immediately — an empty tree with no explanation is the worst version of this.

### Navigation (`panel.ts` + `media/panel.html`)

Tree selection → extension → webview → iframe fragment:

```js
// media/panel.html — the whole mechanism
let n = 0;
window.addEventListener('message', (e) => {
  const m = e.data;
  if (m?.type === 'goto') {
    // A nonce is required, not decorative: the board does not write the hash back
    // when the human switches tabs from inside it, so the URL can already read
    // #tab=bb71 while the page shows something else. Without a changing value
    // there is no hashchange and the click does nothing.
    frame.src = `${BASE}?chrome=notabs#tab=${encodeURIComponent(m.tab)}&r=${++n}`;
  }
});

// The other direction: the board tells us when IT switched tabs ([ ] and 1-9 work
// inside the page). Authenticate by source window, not by origin — the frame is
// cross-origin by design. The envelope key is __aboard, not __board: the bridge
// was renamed outright (plan-1 decision 12), no alias kept.
window.addEventListener('message', (e) => {
  if (e.source !== frame.contentWindow) return;
  if (e.data?.__aboard === 'active') vscode.postMessage({ type: 'active', tab: e.data.tab });
});
```

`?chrome=notabs` and the `{__aboard:'active', tab}` message have **both landed on the
`aboard` side** (`handoff-board-for-vscode-panel.md` §4–§5, shipped 2026-08-26 as
plan-2 item 7), so what this section describes is the contract as it now is rather
than one waiting on another repo. Two details of the landed version are worth knowing
here, because they are what this page depends on:

- `?chrome=notabs` hides the tab BUTTON LIST and nothing else. The topbar (notify
  button, version badge), the `+` that opens the new-tab dialog and the tab note all
  stay — deliberately, so a human working inside this panel is not stranded and this
  extension never has to reimplement the board's own dialog. `?chrome=none` drops the
  whole head; an unrecognised value falls back to `full`.
- The `active` message is posted whenever the active tab CHANGES, including the tab
  the board picks for itself at load. So the tree learns what the panel is showing
  without the human clicking anything, which is the case the highlight used to be
  blind to. A change, not a redraw: the board re-activates the current tab on every
  repaint and repaints on every write that reaches it, and it deliberately says
  nothing when the id has not moved — so `revealTab`'s `reveal(node, { select: true })`
  cannot be fired at the human by an agent writing to a tab they are not looking at.
- The third item in that batch (`handoff-board-for-vscode-panel.md` §6) landed with
  them and is invisible from here, which is the point: the board's two `localStorage`
  call sites are wrapped, so a webview that refuses partitioned storage costs it a
  remembered tab rather than the ability to switch tabs at all. A failure there would
  have looked like this extension's bug, not the board's.

Panel options that matter: `enableScripts: true`, `retainContextWhenHidden: true`
(without it, hiding the panel destroys the page and rebuilds it on reveal — the board
rehydrates from `.aboard/aboard.json`, but the human's zoom, scroll and drafts do
not), and `portMapping: [{ webviewPort: port, extensionHostPort: port }]` so the same
code works over Remote SSH and Codespaces (paired with `vscode.env.asExternalUri`).

**Base path — the open question is answered upstream too, and it is `base`.** If the discovered
instance was started with `aboard serve --base-path /prefix` (plan-1 decision 7),
every request this extension makes — including the iframe's own `src` — needs that
prefix too. `GET /health` DOES expose it: the field is `base` on the instance
record (`Instance.Base` in `pkg/aboard/server.go`, and `http-api.md`'s `/health`
section now spells out what it means), `omitempty`, so it is simply absent in the
common case where no `--base-path` was given. Nothing was added upstream for this —
the field had been there since the port; it was only undocumented, which for a client
author is the same thing as absent. Every URL this extension builds goes through
`basePathOf()`, which normalises to `""` or `"/prefix"`. It also reads `basePath`
as a fallback, because that is the name plan-2's brief expected the field to land
under and reading both costs one `??`.

The one ordering trap: a prefixed board answers `/health` only at `<base>/health`, so
the prefix cannot be discovered from `/health` itself. `.aboard/run/instance.json`
carries the same field, and this extension reads it there first — which is what the
discovery walk already does.

Webview CSP: `default-src 'none'; frame-src http://localhost:<port>
http://127.0.0.1:<port>; script-src 'nonce-<nonce>'; style-src 'unsafe-inline'`.
Nothing else needs to load.

## 7. The tree

- **Order**: exactly `aboard.json` order. No sorting, no grouping by type — the order
  is the human's, and reordering it silently would be a lie about the board.
- **Label**: `tab.name` (`(unnamed)` when empty, as the board itself does).
- **Description**: the id (`bb71`). It is how tabs get referred to in prose and chat,
  so it should be selectable at a glance.
- **Tooltip** (`MarkdownString`): `bb71 · Kanban` from `/capabilities`, then the
  `note` verbatim — what the tab is FOR, in the human's own words. Read-before-acting
  is a board convention this extension should honour by putting the note on hover.
- **Icon**: `dot-change.svg` when `touched`, `dot-removal.svg` when `pendingRemoval`
  (removal wins if both). No icon otherwise.
- **Badge**: `TreeView.badge` = count of `touched` tabs.
- **Selection** → `goto` message. **`active` message** →
  `treeView.reveal(item, {select: true})`, guarded against feeding back into a `goto`.

Actions worth having, all writes the board already permits from a human:

| action | write |
|---|---|
| Dismiss change | drop `touched` on that tab |
| Approve removal | drop the tab |
| Deny removal | drop `pendingRemoval` |
| Rename | set `name` |
| Set note | set `note` |
| Notify waiting session | `POST /poke` |
| Copy id / reference | clipboard only |

Deleting a tab and dismissing markers are gestures the server *refuses* from agents.
Offering them here is not a liberty — it is the point of being the human's client. Get
`__by: "human"` wrong (see §1) and this extension silently becomes an agent that
can't do any of it.

## 8. Milestones

Read the *Done when* clauses as still open: every one of them names something only
a running VS Code can show, and none has been observed. What follows each is what
was built and how far it has actually been taken.

- **M1 — see it.** Discovery, panel with the iframe, tree from `/aboard.json`, no
  live refresh, no navigation. *Done when:* the board renders in an editor tab and
  the tree lists the same tabs in the same order.
  → **Built.** Discovery and the tree mapping are proven against a live
  `aboard serve` (15 example tabs, document order, labels from `/capabilities`).
  The panel is unproven: nothing has rendered it.
- **M2 — navigate.** `goto` bridge with the nonce. *Done when:* clicking every row
  switches the panel and the page does **not** reload — verify by leaving a DAG
  panned and a source editor open in the board, switching away and back, and finding
  them as left.
  → **Built.** The nonce lives in `frameSrc()` in `model.ts` rather than in the
  page's script, so it is unit-tested; `media/panel.html` only assigns what it is
  handed. Whether the assignment reloads the frame is exactly what a real VS Code
  has to say.
- **M3 — live.** SSE with reconnect/backoff; tree refresh on `origin` frames; `ui`
  frames ignored. *Done when:* an `aboard apply` shows up in the tree within a
  second, and a manual server restart leaves the extension working without a VS Code
  reload.
  → **Built and proven at the client level:** a real `aboard apply` produced
  `origin` frames on the live stream and the `ui` frame is dropped. Refreshes are
  coalesced with a 120 ms debounce, because one write measurably produces two
  frames (the POST broadcast and the file watcher's).
- **M4 — dots.** Icons, tooltips from `/capabilities`, badge, `active` message
  handling. *Done when:* an agent touches a tab and the row grows a periwinkle dot;
  pressing `]` inside the board moves the tree highlight.
  → **Built.** An agent write against the live board produced exactly the expected
  models: a change dot on the renamed tab, a removal dot on the dropped one, and
  removal winning on the tab that had both. The `active` message is parsed and
  wired to `reveal`, and **§5 has now landed on the aboard side** (2026-08-26), so
  the board really does post `{__aboard:'active', tab}` on `[`, `]`, `1`–`9` and at
  load. The drift this milestone allowed for is gone; what is left is the same
  thing left everywhere else here — nobody has watched the highlight move in a
  running VS Code.
- **M5 — act.** Dismiss, removal answers, rename, note, notify; `409` retry.
  *Done when:* dismissing from the sidebar clears the dot in a plain browser looking
  at the same board, and a forced conflict surfaces a warning instead of clobbering.
  → **Built and proven at the client level:** against the live board, dismiss
  cleared a marker only a human may clear (`lastEditedBy` came back `human`), deny
  kept a tab and dropped its request, approve deleted one. The `409` path is
  covered against a stub that refuses: one retry rebuilt on the fresh document,
  then an error naming what happened.
- **M6 — install.** `.vsix`, installed locally, used for a week. *Done when:* it
  survives a VS Code restart and a board restart without manual steps.
  → **Not started, out of scope for plan-2 item 8, and gated on the human** (that plan's
  §10) — no `vsce`, no `code --install-extension`, no Extension Development Host. The
  human says when, and §11 below is the checklist to run when they do.

Both of the "if it has not landed" allowances this section used to carry are spent:
`?chrome=` and the `active` message shipped on the `aboard` side on 2026-08-26, so M2
no longer has to tolerate two tab strips and M4 no longer has to tolerate a drifting
highlight. Neither was ever a change to this repo — `frameSrc()` has always asked for
`?chrome=notabs`, and `media/panel.html` has always listened for `__aboard === 'active'`
— so nothing here needs editing to take advantage of them. What is unproven is
unchanged and is the same sentence as before: nothing has been observed in a running
VS Code.

## 9. Install, and the publishing ladder

**Now — no packaging at all.** F5 from the repo opens an Extension Development Host.
This is the whole loop for M1–M5.

**Then — local `.vsix`.**

```sh
npm i -D @vscode/vsce
npx vsce package                                     # → aboard-vscode-0.1.0.vsix
code --install-extension aboard-vscode-0.1.0.vsix --force
```

Needs only: `package.json` with `name`, `publisher`, `version`, `engines.vscode`
(`^1.90.0` a safe floor), `main`, `contributes`, `activationEvents`; plus
`README.md`, a `LICENSE` (vsce complains without one), and a `.vscodeignore` keeping
`src/`, `node_modules/` and the esbuild config out of the package.

**Later — Open VSX, if and only if someone else wants it.** Requires an Eclipse
Foundation account with the Publisher Agreement signed, a namespace, and a token:

```sh
npx ovsx create-namespace <publisher> -p "$OVSX_TOKEN"
npx ovsx publish aboard-vscode-0.1.0.vsix -p "$OVSX_TOKEN"
```

**Not the Marketplace.** Deliberate: this extension is coupled to a workspace that
contains an `aboard` (or `ape aboard`) project; to a stranger it installs, finds
nothing, and does nothing. Open VSX first, and only on request.

## 10. What must be hardened before any public listing

The pure-logic half of this list is handled and unit-tested. The two entries that
need a real host are marked.

- No workspace open; multi-root workspaces; a folder with no `.aboard/`. →
  **handled**: discovery over zero folders returns nothing; two folders under one
  project root count as one board; a folder with no `.aboard/` yields nothing and
  the view says which of the two silences it is (`aboard.hasProject` picks between
  "no board is running" and "no project here", each with its own welcome text).
- `instance.json` present but the server is dead, or answering for another project
  (the `/health.project` check in §6 covers this — keep it). → **handled and
  kept**: a candidate whose `/health` names another project, or does not answer, is
  dropped with the reason written to the Aboard output channel.
- Port occupied by something that isn't a board. → **handled**: `app` must be
  `aboard` or `ape-aboard`, and a non-JSON answer is refused by the same path.
- Remote SSH / Codespaces / vscode.dev (`asExternalUri` + `portMapping`; on
  vscode.dev the framing origin is `https://*.vscode-cdn.net`, which `aboard`'s CSP
  already lists). → **coded, UNVERIFIED**: both are set, and the webview CSP's
  `frame-src` lists the externalised origin alongside both loopback spellings.
  Only a real remote window can confirm it.
- Two boards for two folders open at once — the tree needs to say which is which. →
  **handled**: with more than one board the tabs sit under a row per board, labelled
  by folder (and by `--name` when a project serves a named board beside its
  default). With exactly one, the tabs are top-level — a single always-open parent
  row is a wasted line.
- Schema drift — the board shows the human a "reload" notice on a schema mismatch
  today; this extension should degrade visibly too, not guess. → **handled**: the
  document's `version` is compared against `/capabilities`.`schema`, both read from
  the same server, so this extension still hardcodes no schema number. A mismatch
  is a warning notification, once, plus `schema mismatch` on the board's row.
- Errors surfaced as notifications, never swallowed. → **handled**: every action
  failure is a notification carrying the server's own sentence; background noise
  (a dropped stream, an ignored instance file) goes to the output channel instead
  of interrupting.

### Five things this list called "handled" that were not (found in review)

Each was verified against a real `aboard serve`, not reasoned about. They share a
shape worth naming: **the extension's failure mode is silence.** Every one of them
left the sidebar looking merely quiet — no notification, no output line, nothing
on any console — which is the same picture as a board with nothing new on it.

- **A request could never settle.** `httpRequest` listened for `data` and `end`
  and nothing else, so a response cut off mid-body (a board killed while
  answering) left the promise pending forever. `discover()` holds its
  re-entrancy flag across that await, so ONE truncated answer stopped every
  future discovery for the life of the window. Now every path settles exactly
  once — `aborted`, `error` on the response, and `close` on the request as the
  last resort — and `test/board.test.ts` asserts it with a real socket destroy,
  under an explicit `{timeout: 5000}` because before the fix that test did not
  fail, it hung.
- **A board that stopped left its tabs in the tree.** `discover()` only rendered
  from inside `reloadAll()`, which iterates the entries — so with zero boards it
  rendered nothing at all, and the dead board's tabs stayed listed and clickable
  with the badge still counting them. The welcome view could not appear either,
  because a view with children never shows one. `render()` now runs on the new
  entry list before any read.
- **A named board with a dot in its name was invisible.** `boardNameRe` in
  `pkg/aboard/layout.go` allows dots, so `--name v1.2` writes
  `instance.v1.2.json`; the discovery regex used `[^.]+` for the name segment and
  skipped it. Reproduced with two live servers on one project: the tree showed
  one and said nothing about the other.
- **A sole board with no document showed a blank sidebar.** With exactly one
  board its tabs are top-level, so when `/aboard.json` failed there was nothing
  to draw and no row to carry the reason. The board's own row is now shown
  instead, with the problem as its description — and `schema mismatch` stays on
  that row for as long as it is true, rather than being cleared by the same
  once-only guard that suppresses the repeat notification.
- **The waiter count started as a guess.** The `waiters` frame is only sent when
  the count CHANGES, so a session that parked on `aboard wait` before the window
  opened was invisible: the status bar said "nothing to notify" while somebody
  was blocked on exactly that button. `/waiters` is now read once per refresh and
  the frames keep it current.

One hardening change came with them: `media/panel.html` accepts a `goto` only for
a src that starts with the one the frame was rendered with. The board's `html`
tabs are sandboxed frames that can reach `window.top`, and that handler is the
only thing on the page that navigates anything. The CSP already pinned the
origin; this pins the base path too. The invariant it rests on — that every
`frameSrc()` value starts with the no-tab form — is asserted in
`test/model.test.ts`, since `panel.html` is a file no unit test can load.

## 11. Hand-verification checklist

Nothing below can be asserted headlessly:

- [ ] Tab switching does not reload the page (pan a DAG, leave a source editor open,
      come back).
- [ ] The panel survives being dragged to another editor group, and being hidden and
      revealed (`retainContextWhenHidden`).
- [ ] `html` tabs paint inside the panel — the webview console is the last word, not
      a headless run.
- [ ] Dots appear within a second of an agent's write, and clear from the sidebar.
- [ ] A removal request shows red and both answers do what they say.
- [ ] Notify lights only when a session is genuinely parked on `aboard wait`, and
      pressing it releases that session.
- [ ] Board and plain browser open simultaneously, disagreeing about chrome,
      agreeing about content, each on its own active tab.
- [ ] Restarting the `aboard` server on the same root while the panel is open: the
      page reloads itself (its own self-heal mechanism, ported from the spike's
      `reload.go`), the tree stays alive, no stale `app.css`.
- [ ] A forced `409` (write from the browser mid-edit) warns rather than clobbers.
