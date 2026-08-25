# Handoff — `aboard-vscode`: a VS Code extension that moves the tab strip into the sidebar

**Status:** proposed, not started. This repository, empty at the time of writing.
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

**Location, decided for this rewrite:** `/home/diegos/_dev/exoport/aboard_vscode`
(already created, empty). **Extension id:** `aboard-vscode`. **Display name:**
`Aboard Panel` — a judgement call recorded here since neither the spike's version of
this document nor the port plan named one; change it before publishing if the human
prefers otherwise, but keep it stable once chosen the same way an artifact's favicon
stays stable.

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

## 4. The contract it consumes

| call | use |
|---|---|
| `<root>/.aboard/run/instance.json`, found by **walking up from the workspace folder** | port discovery — mirrors how `aboard` itself finds its project root (plan-1 decisions 4–5); never assume a port, it is derived from the discovered root's path |
| `GET /health` | liveness, `version` for the status bar, `project` (compare against the workspace folder — a stale instance file from elsewhere is otherwise indistinguishable from the real thing), and **`app`** — `"aboard"` or `"ape-aboard"`, see §6 |
| `GET /aboard.json` | the tree: per tab `id`, `name`, `type`, `note`, `touched{by,at,note}`, `pendingRemoval{by,reason}`; top-level `updatedAt` is the CAS token |
| `GET /events` (SSE) | live refresh. Three frame kinds on one stream, told apart by key: `origin` → state changed, refresh the tree; `waiters` → notify count changed; `ui` → the *page's own* code changed, which `aboard` handles itself via its reload mechanism — this extension must ignore that frame kind entirely |
| `GET /capabilities` | `{type, label, blurb, gestures, …}` per renderer — use for tooltips instead of hardcoding type labels |
| `POST /aboard.json` | writes: whole document plus `__base` (the `updatedAt` just read), `__by: "human"`, `__origin: "vscode"`. `409` means someone got there first: re-read, redo, retry once, then tell the user |
| `POST /poke` · `GET /waiters` | the notify channel — a sidebar button and a badge |
| `#tab=<id>` on the board URL | navigation, see §6 |

Two facts this design rests on, both true independent of the port: the shell can be
framed cross-origin, and changing only the fragment of an iframe's `src` fires
`hashchange` in the frame **without reloading it** — so switching tabs from the
sidebar costs nothing: no reload, no dropped SSE stream, no remounted renderers, no
lost zoom or scroll.

## 5. Repo layout

```
aboard-vscode/
  package.json            contributes, activation, commands, menus
  tsconfig.json
  esbuild.mjs             one bundle to dist/extension.js
  .vscodeignore
  LICENSE  README.md      README carries the contract from §4
  src/
    extension.ts          activate(): discover, register tree + commands
    board.ts              HTTP client: discover(), state(), write(), poke(), events()
    tree.ts               TreeDataProvider<TabItem>
    panel.ts              WebviewPanel host + message bridge
  media/
    panel.html            the shell: CSP, one iframe, ~20 lines of script
    dot-change.svg        --agent #a7adf4
    dot-removal.svg       --danger #ff0066
```

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

`?chrome=notabs` and the `{__aboard:'active', tab}` message are both build-queue
items on the `aboard` side (`handoff-board-for-vscode-panel.md` §4–§5) — **not yet
shipped as of this writing**. Until `?chrome=` lands, the panel shows two tab strips
(the board's own, plus this extension's tree) and is otherwise fully functional. Until
the `active` message lands, the tree highlight only updates on a click originating
from the tree itself, and drifts whenever the human uses `[`, `]`, or `1`–`9` inside
the panel.

Panel options that matter: `enableScripts: true`, `retainContextWhenHidden: true`
(without it, hiding the panel destroys the page and rebuilds it on reveal — the board
rehydrates from `.aboard/aboard.json`, but the human's zoom, scroll and drafts do
not), and `portMapping: [{ webviewPort: port, extensionHostPort: port }]` so the same
code works over Remote SSH and Codespaces (paired with `vscode.env.asExternalUri`).

**Base path.** If the discovered instance was started with `aboard serve
--base-path /prefix` (plan-1 decision 7), every request this extension makes —
including the iframe's own `src` — needs that prefix too. As of this writing it is
unclear whether `GET /health` exposes the configured base path for a client to read
back (flagged in `handoff-board-for-vscode-panel.md` §3); in the common case, no
`--base-path` is given and this is a non-issue. Do not build handling for it until
that question is answered on the `aboard` side.

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

- **M1 — see it.** Discovery, panel with the iframe, tree from `/aboard.json`, no
  live refresh, no navigation. *Done when:* the board renders in an editor tab and
  the tree lists the same tabs in the same order.
- **M2 — navigate.** `goto` bridge with the nonce. *Done when:* clicking every row
  switches the panel and the page does **not** reload — verify by leaving a DAG
  panned and a source editor open in the board, switching away and back, and finding
  them as left.
- **M3 — live.** SSE with reconnect/backoff; tree refresh on `origin` frames; `ui`
  frames ignored. *Done when:* an `aboard apply` shows up in the tree within a
  second, and a manual server restart leaves the extension working without a VS Code
  reload.
- **M4 — dots.** Icons, tooltips from `/capabilities`, badge, `active` message
  handling. *Done when:* an agent touches a tab and the row grows a periwinkle dot;
  pressing `]` inside the board moves the tree highlight (once `handoff-board-for-
  vscode-panel.md` §5 has landed on the `aboard` side).
- **M5 — act.** Dismiss, removal answers, rename, note, notify; `409` retry.
  *Done when:* dismissing from the sidebar clears the dot in a plain browser looking
  at the same board, and a forced conflict surfaces a warning instead of clobbering.
- **M6 — install.** `.vsix`, installed locally, used for a week. *Done when:* it
  survives a VS Code restart and a board restart without manual steps.

M2 still works with two tab strips if `?chrome=` has not landed. M4's highlight-drift
half can be dropped if the `active` message has not landed — accept a highlight that
drifts on `[`, `]`, `1`–`9` rather than blocking the milestone on the other repo.

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

- No workspace open; multi-root workspaces; a folder with no `.aboard/`.
- `instance.json` present but the server is dead, or answering for another project
  (the `/health.project` check in §6 covers this — keep it).
- Port occupied by something that isn't a board.
- Remote SSH / Codespaces / vscode.dev (`asExternalUri` + `portMapping`; on
  vscode.dev the framing origin is `https://*.vscode-cdn.net`, which `aboard`'s CSP
  already lists).
- Two boards for two folders open at once — the tree needs to say which is which.
- Schema drift — the board shows the human a "reload" notice on a schema mismatch
  today; this extension should degrade visibly too, not guess.
- Errors surfaced as notifications, never swallowed.

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
