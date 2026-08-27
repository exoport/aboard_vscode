# Handoff — `aboard-vscode`: a VS Code extension that moves the tab strip into the sidebar

**Status:** M1–M5 implemented; **M6 step 1 is done** — the human worked §11 through in a
real Extension Development Host on **2026-08-26**, against `/home/diegos/_dev/ai/borrar`
on `aboard 93ba033`, and **everything on the list passed but two**. No `.vsix` is packaged
and none should be without the human's word: that is `§10` of
`development/planning/plan-2_finish-line.md` in the `aboard` repo.

**Since then, one feature: the board follows the VS Code theme** (§6, plan-2 item 23,
2026-08-26). The extension reads the editor's colours where they exist — inside the
webview — maps them onto the board's own 21 tokens and hands them over the frame
boundary, per viewer and written nowhere. It is machine-verified and **has not been
looked at in a running host**, so §11 carries it as an open row.

**Four defects have been found by running it, in two passes, and all four are fixed.**
The first pass found the missing status dots and the doubled tab strip (§10.1) — neither
was where it looked. Reviewing those fixes found two more (§10.2): the once-per-board
`?chrome=` warning fired three times under a slow shell, and the SSE backoff never backed
off. The second pass found the last two (§10.3): **the notify bell never lit**, and
**"Copy Reference" copied a link**. The shape is the same every time — the mechanism
works, and the thing the human LOOKS at says nothing.

Everything else is covered by `npm test` (`node --test`, no framework — the count is in
the run, not written down here, because a hand-maintained one lies eventually), which
includes an **integration test that spawns a real `aboard`** and drives `activate()`
against it through a stand-in `vscode` module (`test/vscode-stub.ts`) — so the SSE frame,
the reload debounce, `onDidChangeTreeData`, the icon path, the removal answers and a
really-parked `aboard wait` are executed rather than reasoned about.
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

**"The only place this extension duplicates anything" stopped being true on
2026-08-26**, and the sentence above is left standing because the correction is
the interesting part. `src/theme.ts` carries the board's **21 token names** so a
name the board does not have cannot be written: the mapping table in §6 is keyed
by a union derived from that list, so the mistake is a build that does not finish
rather than a colour that silently never arrives. It is a
second copy, and it is held to the same rule rather than to a promise:
`test/integration.test.ts` runs `aboard capabilities --format json` and fails if
the list has drifted. The rule is not "never duplicate" — it is **never duplicate
without a test that breaks when the copy goes stale**, which is what `tokens.ts`
established and what this follows.

**And a second test, added after the first real run: `test/media.test.ts`.** Reading a
file as text and finding a hex string in it says nothing about whether a browser will
draw it, and for a while it did not — both SVGs shipped as malformed XML because the
comment naming their source contained the token's own two leading hyphens. See §10.1.
Keep the two tests apart: one asks whether the colour is right, the other whether there
is a colour at all.

## 4. The contract it consumes

| call | use |
|---|---|
| `<root>/.aboard/run/instance.json`, found by **walking up from the workspace folder** | port discovery — mirrors how `aboard` itself finds its project root (plan-1 decisions 4–5); never assume a port, it is derived from the discovered root's path |
| `GET /health` | liveness, `version` for the status bar, `project` (compare against the workspace folder — a stale instance file from elsewhere is otherwise indistinguishable from the real thing), and **`app`** — `"aboard"` or `"ape-aboard"`, see §6 |
| `GET /aboard.json` | the tree: per tab `id`, `name`, `type`, `note`, `touched{by,at,note}`, `pendingRemoval{by,reason}`; top-level **`rev`** is the CAS token |
| `GET /events` (SSE) | live refresh. Three frame kinds on one stream, told apart by key: `origin` → state changed, refresh the tree; `waiters` → notify count changed; `ui` → the *page's own* code changed, which `aboard` handles itself via its reload mechanism — this extension must ignore that frame kind entirely |
| `GET /capabilities` | `{type, label, blurb, gestures, …}` per renderer — use for tooltips instead of hardcoding type labels |
| `POST /aboard.json` | writes: whole document plus `__base` (the **`rev`** just read), `__by: "human"`, `__origin: "vscode"`. `409` means someone got there first: re-read, redo, retry once, then tell the user |
| `GET /` | the shell the panel frames — and, read once per board, the probe for whether this binary understands `?chrome=` (it stamps `document.body.dataset.chrome`). The manifest has no field for it; see below. |
| `POST /poke` · `GET /waiters` | the notify channel — a sidebar button and a badge |
| `#tab=<id>` on the board URL | navigation, see §6 |
| `{__aboard: 'active', tab}` posted OUT of the frame | the board announcing its own tab switch, so the sidebar highlight follows `[`, `]` and `1`–`9`. Authenticated by `event.source`, never by origin |
| `{__aboard: 'theme', kind, tokens}` posted INTO the frame | the editor's colours as the board's own tokens, applied per viewer and written nowhere. See §6 |

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
    theme.ts              VS Code's colours → the board's 21 tokens
  media/
    panel.html            the shell: CSP, one iframe, the bridge (goto, active, theme)
    dot-change.svg        --agent #a7adf4
    dot-removal.svg       --danger #ff0066
    activity.svg          the activity-bar icon (currentColor — VS Code tints it)
  test/                   node --test, no framework
    vscode-stub.ts        a stand-in `vscode` module. NOT a test file, never an emulator
    fakeboard.ts          a board-shaped HTTP server + activate() on top of it. Also not a test file
    integration.test.ts   spawns a real aboard and drives activate() against it
    oldboard.test.ts      a board predating ?chrome=, and the one warning it earns
    notify.test.ts        the aboard.waiting context key, and both ways it is fed
    copy.test.ts          Copy Reference and Copy Link, pressed as a human presses them
    manifest.test.ts      the contributions as data — the half no runtime test can see
    media.test.ts         the icon files parse, and the check can be seen failing
    …plus board/boundary/discovery/health/launch/messages/model/sse/tokens .test.ts,
     one per pure module, named after the file they cover
```

**`test/vscode-stub.ts` is a change of posture and worth defending.** Until item 15 no
test imported `vscode` at all, which was the point: the pure half was covered and the
adapter — `extension.ts`, `tree.ts`, `panel.ts` — was reasoned about. The first real
run then produced a defect that looked exactly like an adapter bug and was not one, and
there was no way to rule the adapter out except to run it. The stub models only what the
extension actually depends on: an `EventEmitter` that fires synchronously, a TreeView
that re-walks `getChildren`/`getTreeItem` when `onDidChangeTreeData` fires, `setContext`,
notifications and clipboard writes recorded rather than performed, the status-bar item as
it currently reads, and — added for §10.3 — the provider's own NODE behind each rendered
row, because that object is exactly what VS Code hands a `view/item/context` command, so a
test can press a menu item the way a human does rather than calling the function under it.
It must not grow into a VS Code emulator —
the moment it needs a webview it has gone too far, and `panel.ts` is deliberately still
uncovered for exactly that reason.

**Five source files rather than the four this section originally listed**, and the
line they are split on is not tidiness: `board.ts`, `model.ts`, `sse.ts`,
`launch.ts` and `messages.ts` do not import `vscode`, so every rule worth arguing
about — the discovery walk, `/health` acceptance, icon precedence, badge count,
what "dismiss" actually writes, SSE framing, which start command — is reachable
from `node --test`. `extension.ts`, `tree.ts` and `panel.ts` are the adapter above
that line. Two of the three are now executed through the stub above — `panel.ts` is
the one that is still not, deliberately, because covering it would mean a fake
webview and that is where a stand-in becomes an emulator.

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

**When the board is too old to understand `?chrome=`.** It ignores the parameter — an
unknown query parameter is not an error — and draws its own tab strip inside the panel,
under the sidebar tree. That is what the human saw on the first real run. The extension
now probes the shell once per board (`Board.supportsChrome()`, `shellSupportsChrome()`
in `board.ts`) and raises exactly one warning naming the board and its version. Why the
shell and not `/capabilities`: §10.1.

### The theme (`src/theme.ts` + `media/panel.html` + `src/panel.ts`)

The human asked on 2026-08-26 whether the board's colours could come from the VS
Code theme in use. They can, and the shape is forced by one fact worth stating
before anything else:

**The colours exist only inside the webview document.** VS Code publishes the live
theme there as `--vscode-*` custom properties on the root and puts
`vscode-dark` / `vscode-light` / `vscode-high-contrast` (and, for a light
high-contrast theme, `vscode-high-contrast-light` alongside it) on the body. The
**extension-host** API has `ColorTheme.kind` and no values at all, and the board's
iframe is **cross-origin**, so it inherits none of it. Neither end of this
extension can read what the middle can see.

So: the page reads, the host maps, the page posts.

1. `media/panel.html` reads the names it is handed (`src/panel.ts` substitutes
   `__VARS__` from `VSCODE_VARS`) and posts `{type:'theme', vars, bodyClass}` out.
2. `src/panel.ts` calls `mapVscodeTheme()` and posts the result back in.
3. The page posts `{__aboard: 'theme', kind, tokens}` into the frame, and the
   board applies it as inline custom properties **for that viewer only** — nothing
   is written to the state file or to `localStorage` (the aboard side's own rule;
   `docs/reference/theme.md` there).

**Why the mapping is not in the page**, where the values are: `media/panel.html`
is a bridge and owns no palette, and a function in a `<script>` inside an HTML
file is reachable by neither `tsc` nor `node --test` without a `node:vm` harness
around it. It lives in `src/theme.ts` — no `vscode` import, the same line
`board.ts` and `model.ts` sit on — and the page is tested separately for the one
thing it does do (`test/panelhtml.test.ts`, which lifts the script out and runs it
in `node:vm`). The alternative considered and rejected was inlining a second
esbuild bundle of `theme.ts` into the page: it removes the round trip and adds a
build output that must be kept in step with the file that embeds it, to test a
function in a bundled form nobody reads.

**Four signals re-read the theme**, and each catches something the others do not:

- the frame's `load` — a board that reloaded itself (its own self-heal on a code
  change) has lost the inline properties, and nothing else says so;
- a `MutationObserver` on the body class — the human switched between a light and
  a dark theme;
- a second one on `document.documentElement`'s inline `style` — two themes of the
  same KIND differ in their values and in nothing else, and this is exactly where
  VS Code writes them;
- `window.onDidChangeActiveColorTheme` on the host, which posts `theme-probe`.

The last two look redundant and are not. The host's notice travels theme service
→ extension host → renderer → page; the new properties travel theme service →
page; **nothing orders the two**, so a notice that overtakes the properties reads
the OLD theme and the panel keeps the previous colours until something unrelated
moves. The observer cannot arrive early. The probe stays because it is the one
signal that survives a VS Code that stops writing those properties inline.

**Only the host may set the palette.** The board's `html` tabs are frames INSIDE
the frame and can reach `window.top`, which is this page — `e.source` is then
neither the board nor the host, so both theme branches would have taken the
message and an agent-authored widget could recolour the panel and flip its
light/dark variant. They are sandboxed `allow-scripts` without
`allow-same-origin`, so their opaque origin serialises to the literal string
`"null"`, and the page refuses that one origin before any host branch runs.
**By origin and not by `e.source`**: what `e.source` is for a host delivery is an
internal of the webview implementation, and a guard built on that is this bridge
failing silently on the VS Code version that changes it.

**And it guards the two theme branches only — `goto` is deliberately left on its
src-prefix pin.** The same rule would fit there, and the reason not to is the one
this file keeps re-learning: navigation has been watched working in a real host
(§11) and the theme has not. If the reasoning about `"null"` is wrong, the cost
has to be a colour that does not arrive — a feature §11 already says nobody has
looked at — and never a sidebar click that stops moving the panel. The prefix pin
is what confines the same grandchild there, and it is unchanged.

**The contrast guard, and why it is not optional.** The board pins text to WCAG
AAA (≥7:1) because most of its type is small; an arbitrary VS Code theme does not.
`--text`, `--muted` and `--dim` are measured against **every ground the mapping
produced** — `--bg`, `--sunken` and `--surface`, which is the set
`docs/reference/theme.md` names, `--raised` being outside the pin there too — and
travel as a group: if any pair misses AAA, none of the three is sent and the board
keeps its own. Reading only the page ground was the first version of this, and the
page ground is not the worst of the three: with an `editor.background` of
`#ffffff` and a `sideBar.background` of `#e8e8e8`, an `editor.foreground` of
`#545454` is 7.6:1 on the ground and 6.2:1 on `--surface` — so it shipped text
that missed the pin exactly where most of the board's small type sits, on panels
and cards. It fires on **VS Code's own Dark+**, where `descriptionForeground` is
~6.1:1 on the editor background. That is the feature working: the backgrounds, the
accent, the link and the error colour still follow the editor, so the panel
belongs in the window, and the type stays readable. A token whose VS Code
counterpart is absent is likewise left out rather than guessed, so the board's own
value stands.

**The setting is `aboard.theme`**: `follow` (default) or `board`. `board` posts
nothing and lets the board's `.aboard/theme.json` and its own switch decide.
Switching to it does not just go quiet — the board is holding the last tokens as
inline properties and nothing expires them, so the panel posts an empty `tokens`
map, which is the board's own "take them back off".

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
| Notify waiting session | `POST /poke`, with the bell drawn from `aboard.waiting` — §10.3 |
| Copy id | clipboard only |
| Copy reference (`Migration review (bb32)`) | clipboard only |
| Copy link to this tab (the deep link) | clipboard only |

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
  → **Step 1 done: §11 worked through in an Extension Development Host by the human on
  2026-08-26, twice.** Still no `vsce` and no `code --install-extension` — the packaging
  half remains gated on the human (plan-2 §10), and "used for a week" has not started.
  What the two runs established: everything on the checklist except the two rows now
  marked `[~]`, which failed, were fixed (§10.3), and have not been looked at since.
  What they broke: four defects total, §10.1 and §10.3.

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

### 10.1 What the first real run found, and why neither was where it looked

Two defects, one run, 2026-08-26. They share the shape everything in §10 shares:
**this extension's failure mode is silence.** Neither produced an error, a log line,
or anything on any console. The human found both by looking at the screen, which is
backwards — the agent that wrote the code is the one still holding the context to fix
it.

**1. The tree listed every tab and drew no dots**, on a board where every tab carried a
`touched` mark.

The suspect was the SSE refresh: the marks were written at 13:33 and the extension had
activated at 13:22, so a tree that never refreshed would look exactly like this. It was
not that, and the board's own journal says so — the write at 13:33:30 is the write that
CREATED all fifteen tabs (`before` is empty, and each mark's note is the server's own
`"new tab"`). The human could only have been looking at a tree that had already
refreshed. That excluded M3 before a line was changed, which is the argument for
reading the evidence rather than the likeliest story.

What it actually was: **both dot SVGs were not well-formed XML.** Each opened
`<!-- --agent, copied from … -->`, and the XML spec forbids `--` inside a comment.
Chromium — which is what the workbench is — refuses such a document outright instead of
recovering the way an HTML parser would, so `background-image` resolved to nothing and
the row had no icon. Confirmed by rendering both the broken and the repaired file in
Chromium and looking at the picture: `DECODE ERROR` against `decoded 16x16`.
`media/activity.svg` was unaffected only because its comment happens to contain no
double hyphen, which is why the activity-bar icon appeared and the dots did not.

The trap is worth keeping: the two CSS custom properties these values are copied from
are *spelled* `--agent` and `--danger`, so **naming the source accurately is what breaks
the file**. `test/tokens.test.ts` read both files and passed, because it was looking for
a hex string in text; nothing had ever asked whether they parse. `test/media.test.ts`
now does, and it asserts the check itself can fail.

**2. The board's own tab strip showed inside the panel.** Also not this extension:
`frameSrc()` asked for `?chrome=notabs` correctly, and that board was served by a binary
built at 00:20 on 2026-08-26 — before `?chrome=` landed at 03:34. An unknown query
parameter is not an error, so the board ignored it and said nothing.

Fixed by making the extension say it instead: after `/health`, it probes the shell and
raises one warning per board naming the board and its version. **It probes the shell
rather than the manifest, and that is a judgement call.** `GET /capabilities` carries
`app`, `schema`, `capsHash`, `types`, `commands`, `rootFlags` and `routes`, and **none
of them describes the shell's query parameters**; `capsHash` moves whenever any spec
moves, so it can say *different* but never *older*, and `/health.version` is
`git describe --tags --always --dirty`, which on an untagged tree is a commit hash and
does not order either. The shell stamps `document.body.dataset.chrome` in a classic
script at the top of `<body>`, and that line IS the feature — testing the feature beats
testing a proxy for it. If `aboard` ever declares its shell parameters in the manifest,
move the probe there and delete `shellSupportsChrome`.

**3. The three warnings in the host's console are not ours.** `DEP0040 punycode`,
`DEP0169 url.parse` and `devbox.json ENOENT`. `dist/extension.js` requires exactly four
modules — `node:fs`, `node:http`, `node:path`, `vscode` — and there are zero runtime
dependencies, so there is nothing transitive to blame either. On the machine where they
were seen, dozens of installed extensions reference `punycode` and dozens use
`url.parse`, and `devbox.json` belongs to `jetpack-io.devbox`; all extensions share one
host process, so a deprecation warning names no extension at all. Written into README.md
under *Troubleshooting: what is not ours* so the next person does not chase them here —
with the command to count them rather than a number, because the first draft of this
carried "70" and "49" and neither could be reproduced by anyone re-running the grep.
A number in a document is a claim with a shelf life; a command is not.
(One correction to the brief that raised this: the Claude Code extension is **not** the
source. None of the JavaScript the host loads for it mentions either API. Its bundled
*native* binaries do contain the strings, which is why an unfiltered grep looks
incriminating — they are separate processes and cannot raise a `DeprecationWarning` in
this one. Saying which extension it is would be a guess either way.)

### 10.2 What the review of that work found

Two more, both in the code written to fix the two above, and both the same shape yet
again: they do the wrong thing quietly, and only under a timing the happy-path test
does not produce.

- **The `?chrome=` warning fired three times, not once.** `checkChromeContract` set its
  once-per-board guard on the FAR side of `await board.supportsChrome()`. `reload()`
  runs on every SSE frame, so an agent writing while the probe was in flight drove a
  second reload, which passed the guard and started a probe of its own — and a third.
  `test/oldboard.test.ts` asserted "exactly one" and passed, because its stub answered
  `GET /` instantly and the window to lose was microseconds wide. Give the stub a 600 ms
  shell and the count is three, measured. The guard is claimed before the await now, and
  an unreadable shell is retried three times and then dropped rather than re-fetching a
  whole page on every write for the life of the window. The board's key is also released
  when the board goes away, because that is the one moment the binary behind it can
  change without a Refresh.
- **The SSE backoff never backed off.** `attempt` was reset to 0 the moment the response
  HEADERS arrived, so a port that accepts a connection and immediately drops it — a
  board crash-looping, a proxy closing an idle stream, another process on the derived
  port — counted as a success every time and reconnected at the 1 s floor indefinitely,
  with an output-channel line each. Six connections in six seconds, measured. The reset
  now waits for the stream to stay up for ten seconds, which is the difference between
  "connected" and "working"; a genuine restart still reconnects in about a second,
  because the connection it replaced had been up for minutes. The same change made
  `reconnect` idempotent per connection: one dead socket can announce itself on both the
  response and the request, and each announcement used to schedule a reconnect of its
  own, which is two live streams delivering every frame twice with no way back to one.

### 10.3 What the SECOND pass through §11 found

The human worked the rest of the checklist in a real VS Code on 2026-08-26, against the
`borrar` board on `aboard 93ba033`. **Everything passed but two**, and both are the same
kind of defect as §10.1: the mechanism worked and the part the human LOOKS at did not.
Neither is a bug in a rule; both are bugs in what the sidebar says about itself.

**1. Notify: "the poke in the terminal exited ok, the notification icon was not lit."**

The release was never in doubt — the parked session came back and the CLI exited 0. What
did not happen is the only half a human can see before pressing anything: **the
view-title bell never changed.** Only the status-bar item did (`$(bell-dot) aboard ·
notify 1`), and the status bar is not where somebody looks when the question is about the
sidebar they are already staring at. `aboard.notify` contributed a single static
`$(bell)`, so the one affordance whose entire job is to say *a session is blocked on you*
said exactly the same thing whether one was or not.

The fix is a context key, `aboard.waiting`, set from the waiter count, with **two**
`view/title` entries reading it. Two, because a menu entry takes its icon *and* its
tooltip from the COMMAND — there is no per-entry override — so the lit and unlit states
have to be two command ids (`aboard.notifyWaiting` with `$(bell-dot)`, `aboard.notifyIdle`
with `$(bell)`) running the same handler. Their titles carry no backticks, because a
command title is rendered as plain text everywhere it appears and markdown there is two
stray characters on the screen. They sit in the same `navigation@2` group so the
bell does not move sideways when it lights, and the plain `aboard.notify` stays as the
one palette entry, with both decorated ids hidden from it.

Both sources drive the key, and they fail differently, which is why both are tested: the
`waiters` SSE frame is only sent when the count CHANGES, so a session that parked before
the window opened is invisible to it, and the `/waiters` read on each reload is the only
thing that finds that one. The key is also pushed back to `false` when the last board
goes away — a lit bell that outlives its board is the same defect wearing the other
sign.

One deliberate extra: the bell goes out when the poke returns, rather than waiting for
the `waiters` frame to come back and confirm it. A poke releases every waiter on that
board, so zero is not a guess, and the frame is a round trip for the one repaint the
human is actually watching. The frame still arrives and still corrects it if a released
session immediately parks again.

**Two more found reviewing that fix, both the same missing half.** The first version
treated the `waiters` frame as reliable, and it is not: the server fans a payload out
with a NON-BLOCKING send and a `default:` (`fanout`, `pkg/aboard/server.go`), so a
client that is not there — or is not keeping up — is skipped and the frame is gone. The
tree survives that, because a `state` frame is followed by a re-read of the whole
document; the waiter count does not, because a session parking during the gap writes
nothing and produces no state frame at all. So the count needs asking for again, in the
two places where the extension knows it might be wrong:

- **On reconnect.** `onStatus(connected)` only logged the drop. It now re-reads
  `/waiters` when the stream comes back, which is the only thing that finds a session
  that parked while a restarted board was down. Without it the bell stays dark until
  something unrelated writes to the board — and the human presses Refresh precisely
  because the bell is dark.
- **When the bell is pressed over a stale count.** `notify()` re-reads `/waiters`, and
  on `0` it said *"No session is waiting on this board"* while leaving the bell lit and
  the status bar reading `notify 1` behind the notice. That is this section's own defect
  wearing the other sign: the mechanism was right, the screen contradicted it. The one
  moment the extension is certain of the count is the moment it has just asked, so that
  answer now reaches the bell.

Both are in `test/notify.test.ts` and both were watched failing first — the second
asserting the contradiction directly, the first by cutting the fake board's streams
(`dropStreams`) with the count changed behind them and timing out at 15s.

A third, smaller: `render()` now returns early on a disposed controller. A reload in
flight when the window closes still had an `entries` array and would push a context key
and a status bar for a board nobody is watching, over the top of whatever replaced it.

**2. Copy reference: "copy id worked, there is no copy reference; there is copy link to
this tab and it works."**

Exactly right, and the command id says how it happened: `aboard.copyReference` was
titled *Copy Link to This Tab* and put a URL on the clipboard. So the sidebar offered two
ways to copy an address and no way at all to copy the form the board's own documentation
tells every agent to use when addressing a human — the name, with the id beside it
(`Migration review (bb32)`, the skill's *Ids do not travel in both directions*).

Now both: **Copy Reference** (`referenceText`) and **Copy Link to This Tab**
(`linkFor`), in one context-menu group after Copy Id, narrowest to widest.

Two judgement calls inside that, both recorded because the brief for this work assumed
otherwise. **The board's own `views/menu.js` does not have a "Copy reference".** Its
`referenceFor()` builds a URL and the menu item above it reads *Copy link to this tab*
— so "reference" as a name is already taken by the URL there, while "reference" as a
FORM is the prose one the skill mandates. Rather than import that collision, the URL
builder here is called `linkFor` and `referenceFor` is gone; a `copyReference` command
calling `linkFor` is precisely the confusion the human found, and the function names are
where it would come back. **And the copied text carries no backticks**, though the
skill's own examples are markdown: this string goes on the system clipboard with no idea
where it lands — a commit message, a terminal, a chat box — and plain text reads
correctly in all of them where markdown arriving somewhere plain does not. A tab with no
name degrades to the bare id rather than to `(unnamed) (bb99)`.

**What the tests can and cannot say.** The bell is driven end to end in
`test/integration.test.ts` against a REAL spawned board with a REAL `aboard wait` parked
on it: the key flips true, notify is pressed through the controller, the CLI exits 0 and
the key flips back. A stub answering `{"waiting": 1}` could not have exited 0, which is
why that one is not in the fake-board file. `test/notify.test.ts` covers the transitions
that are awkward to provoke against a real binary (a count seeded from `/waiters` with no
frame, a board disappearing under a lit bell). `test/copy.test.ts` presses both copy
commands through their registered handlers with the tree node VS Code would hand them —
a test calling `referenceText()` directly would still pass with both menu items wired to
the wrong function. `test/manifest.test.ts` asserts the contributions as data, because
the bell fix is mostly a manifest change and nothing in `node --test` renders a title
bar. **What none of them can say** is that VS Code draws the right bell from that key, or
that the two copy items appear in that order on a right-click — which is why both rows in
§11 are `[~]` and not `[x]`.

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

Nothing below can be asserted headlessly **in a real host**. `[x]` was observed by a
human, with the date; `[ ]` is still open. `[~]` is the third state this list needed
once the integration test existed: the part that CAN be driven against a real board is
proven, and the part that needs a human looking at VS Code is not — a full tick there
would claim more than anybody has seen.

**The list was worked through twice on 2026-08-26.** The first pass (plan-2 item 15)
reached the top four rows and stopped on two defects. The second pass — the human
sitting in a real VS Code against the `borrar` board, `aboard 93ba033` — went through
everything that was left and **passed all of it but two**, which are the two rows now
carrying `[~]`. Both are fixed here (§10.3); neither fix has been looked at in a
running host, and until it is, the honest mark is not a tick.

- [x] The extension activates and the tree lists every tab, in `aboard.json` order,
      each with its id as the description. (2026-08-26)
- [x] A board started AFTER the window was already open still appears — so the
      `**/.aboard/run/instance*.json` watcher fires and discovery re-runs. (2026-08-26)
- [x] The board renders inside the panel. (2026-08-26)
- [x] Tab switching does not reload the page. (2026-08-26) The mechanism is the one
      the whole navigation design rests on: a fragment-only `src` change fires
      `hashchange` without reloading, so no SSE stream drops and no renderer remounts.
- [x] The panel survives being dragged to another editor group, and being hidden and
      revealed — `retainContextWhenHidden`. (2026-08-26)
- [x] `html` tabs paint inside the panel, with a clean console. (2026-08-26) The
      webview console is the last word here and it was read: `connect-src 'none'` plus
      the `vscode-webview:` ancestor list is the containment, and neither of them
      showed up as a blocked request.
- [x] Dots appear within a second of an agent's write — observed by the human on
      2026-08-26 (third run): a periwinkle dot on a touched tab and a red one on a
      removal request, and after the stream fix (`cff655a`) a new dot on
      Coordination arrived with no Refresh. The first two runs needed Refresh —
      first the malformed SVGs, then Node 24's inspector killing the stream on
      every string chunk under F5. Clearing from the sidebar (Dismiss) was
      observed working in the same session on 2026-08-26.
- [x] The tab strip does NOT appear inside the panel on a current binary — observed
      2026-08-26 against `aboard de7773f`.
- [x] A removal request shows red and both answers do what they say. **Fully observed
      on 2026-08-26**: first through the board's own banner inside the panel, and then
      — second pass — through the sidebar's own **Approve / Deny** context-menu items,
      which is the half that was still open. Both were proven headlessly first
      (`test/integration.test.ts`) against a real spawned board: `approveRemoval`
      written as `__by: "human"` makes the tab GONE, `denyRemoval` leaves the tab with
      its request cleared, and a second deny is skipped rather than posted.
      Deliberately a server test and not a unit one — the same edit from an agent gets
      the tab RESTORED with a `pendingRemoval` (guarantee 1), so a test that only
      checks what the edit does to a JSON object proves nothing about what the board
      does with it.
- [x] Rename and Set note from the sidebar. (2026-08-26) Both are ordinary writes, and
      the thing being checked is that they land as the HUMAN — an agent renaming a tab
      is allowed, so a wrong `__by` here would not fail visibly the way Dismiss does.
- [x] `]` inside the panel moves the tree highlight. (2026-08-26) This is the
      `{__aboard: 'active', tab}` message arriving and `reveal` acting on it, which
      until 2026-08-26 depended on a board-side change that had not landed.
- [x] Two viewers — the panel and a plain browser — open at once, disagreeing about
      chrome and agreeing about content, each on its own active tab. (2026-08-26)
      `?chrome=` is per viewer, and the active tab is per page: this row is the one
      that proves neither leaks into the state file.
- [x] Restarting the `aboard` server on the same root while the panel is open: the
      page reloads itself (its own self-heal mechanism, ported from the spike's
      `reload.go`), the tree stays alive, no stale `app.css`. (2026-08-26)
- [x] A forced `409` (write from the browser mid-edit) warns rather than clobbers.
      (2026-08-26)
- [x] The "Start the board" fallback: with nothing running, the welcome view offers it,
      it picks the command from what is on `PATH`, and the tree fills in once the
      board answers. (2026-08-26)
- [~] **Notify lights only when a session is genuinely parked on `aboard wait`, and
      pressing it releases that session.** *Failed on 2026-08-26 and is fixed here* —
      see §10.3. What is proven: `test/integration.test.ts` parks a REAL `aboard wait`
      against a real spawned board, asserts the `aboard.waiting` context key flips to
      true, presses notify through the controller, and asserts the CLI exits 0 and the
      key flips back. What is not: that VS Code draws the `$(bell-dot)` entry from that
      key, which only a running host can show.
- [~] **Copy Reference copies a reference, and Copy Link copies a link.** *Failed on
      2026-08-26 and is fixed here* — see §10.3. Both commands are pressed through
      their registered handlers with the tree node VS Code would hand them
      (`test/copy.test.ts`), and the manifest's two titles are asserted as data
      (`test/manifest.test.ts`). What is not proven: that both items appear on the
      right-click menu in that order, which is a `menus` contribution only a host
      evaluates.
- [ ] **The board follows the VS Code theme.** Switch the editor to a light theme
      and the panel goes light with it, on the next repaint and with no reload;
      switch to a high-contrast LIGHT theme and it goes light rather than dark
      (the body carries both HC classes, and reading the generic one first is the
      mistake that makes every HC light theme come up black); set
      `aboard.theme` to `board` and the panel returns to the board's own palette,
      back to `follow` and it follows again. Asserted headlessly as far as it
      goes: the mapping and the guard (`test/theme.test.ts`), the page's half in
      `node:vm` (`test/panelhtml.test.ts`), the setting as data
      (`test/manifest.test.ts`), and the 21 token names against the real binary
      (`test/integration.test.ts`). What none of that can show is a webview
      actually defining `--vscode-*`, or the colours landing on screen — and the
      expected result there is deliberately NOT full fidelity: on VS Code's own
      Dark+ the text colours are withheld by the contrast guard, so the board's
      backgrounds should match the editor while its type stays the board's. A
      panel whose text went grey-on-grey is the guard failing, not the theme
      arriving. Two things to watch for specifically, both added in review and
      both unobservable headlessly: switching between two DARK themes must
      recolour the panel (the root's inline `style` is watched for exactly that,
      and it is the signal that cannot arrive before the values do), and an
      `html` tab must still paint — its messages to `window.top` are now refused
      for the theme branches by their `"null"` origin, and nothing else it does
      goes through that path.
- [ ] The stream survives a board restart, and a board that will NOT come back stops
      being retried every second (kill `aboard serve` and watch the Aboard output
      channel: the reconnect notices should space out, not tick once a second). The
      row above it covers the restart the page notices; this one is about the
      extension's own backoff, which is a different mechanism and is still unwatched.
- [ ] **Optional: the old-binary warning.** A board served by a binary that predates
      `?chrome=` raises exactly one warning naming the board and its version. Asserted
      by `test/oldboard.test.ts`, including the in-flight-write case that used to fire
      it three times, but never seen in a real host — and increasingly hard to arrange,
      since it needs an `aboard` built before 2026-08-26 03:34.
- [ ] **Optional: Remote SSH / Codespaces.** `asExternalUri` + `portMapping` are coded
      and the webview CSP lists the externalised origin alongside both loopback
      spellings. Only a real remote window can confirm it, and nothing else in this
      list depends on it.

**Rebuild before pressing F5, and reload the dev-host window after an edit.**
`.vscode/launch.json` runs `npm: build` as a preLaunchTask, so the first is handled;
the second is not, because the build is one-shot rather than a watcher (a watcher never
"finishes" and VS Code would sit waiting for it). A dev host left open across an edit is
running the previous bundle, silently — the same class of mistake as everything in §10.1.
