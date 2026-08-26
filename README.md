# aboard-vscode

A VS Code extension that gives the [`aboard`](https://github.com/exoport/aboard)
board a native home inside the editor: a `TreeView` of a project's tabs in the
sidebar, with the board itself rendered in a webview panel.

It is a **viewer**. No rendering, no state, and no schema knowledge live here, and
none should ever be added; everything it shows comes from the running `aboard` (or
`ape aboard`) server over plain HTTP, the same way any other client reads it. When
`aboard` grows a sixteenth renderer this extension needs zero changes — if it ever
does, something here is wrong.

> **Status: verified once, partially.** The human ran it in a real Extension
> Development Host on **2026-08-26**, against `/home/diegos/_dev/ai/borrar`. **What was
> observed working:** activation, discovery of a board started *after* the window was
> already open, the tree listing every tab in document order with its id, and the panel
> rendering the board. **Two defects were found by that run and are fixed here** — see
> *What the first real run found* below. **What is still unobserved:** everything in
> `docs/handoff.md` §11 — tab switching without a page reload, the panel surviving a
> drag to another editor group, `html` tabs painting inside the webview, the removal-
> request answers, notify, a forced `409`, and Remote SSH / Codespaces.
>
> **So: treat this extension as UNVERIFIED in a real VS Code for everything not named
> in that one paragraph.** One run, one board, one machine, one platform. Most of what
> it does has never been watched working outside `node --test`, and both defects that
> single run turned up were invisible to the suite — which is the measure of how much
> the suite can be trusted to stand in for the real thing.
>
> The rest is covered by `npm test` (the whole suite, `node --test`, no framework), which
> now includes an **integration test that spawns a real `aboard`** and drives
> `activate()` against it through a stand-in `vscode` module — so the tree refresh,
> the SSE frame, the debounce and the icon path are executed rather than reasoned
> about. No `.vsix` is packaged yet; the loop is still F5.

## Build

```sh
npm ci
npm run build     # → dist/extension.js
npm test          # node --test, no framework
npx tsc --noEmit  # the same typecheck `npm run build` runs first
```

No runtime dependencies. Dev only: `typescript`, `esbuild`, `@types/vscode`,
`@types/node`.

`test/integration.test.ts` spawns a real `aboard` binary on a throwaway project
(`mkdtemp`, so its derived port cannot collide with a board anybody is using, and it
is killed by pid afterwards). It looks for `$ABOARD_BIN`, defaulting to
`/home/diegos/_dev/exoport/aboard/aboard`, and **skips loudly** when the binary is not
there — a clone of this repository does not carry the sibling one, and a suite that
cannot pass without a second checkout is a suite people stop running. Build it with
`make build` in the `aboard` repo to have it run.

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
| `GET /` | the shell the panel frames — and, read once per board, the probe for whether this binary understands `?chrome=` (it stamps `document.body.dataset.chrome`). The manifest has no field for it; see below. |
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

### Two things the board owed this extension — both landed

Both were `handoff-board-for-vscode-panel.md` §4–§5 in the `aboard` repo, and both
**shipped on 2026-08-26** (that repo's plan-2 item 7). This repository needed no change
to take them: it had coded for both from the start, because each was free to send and
would only ever have cost a change here later.

- **`?chrome=notabs`** — hides the board's own tab strip, so the panel shows one strip
  rather than two. `frameSrc()` has always asked for it, and now builds exactly
  `<base>?chrome=notabs#tab=<id>&r=<n>`, asserted as a whole string.
- **`{__aboard: 'active', tab}`** — the board announces its own tab switches, so the
  sidebar highlight follows `[`, `]` and `1`–`9` pressed inside the panel and not only
  clicks that started in the tree. `media/panel.html` has always listened for it.

**An older board silently ignores the first of these**, because an unknown query
parameter is not an error — which is exactly what the human saw on 2026-08-26, two tab
strips stacked and nothing anywhere saying why. So this extension now probes for it and
says so, once per board, in a warning that names the board and its version.

The probe reads the shell, not the manifest, and that is a judgement call worth
recording: **`GET /capabilities` has no field a client can test for this.** It carries
`app`, `schema`, `capsHash`, `types`, `commands`, `rootFlags` and `routes`, none of
which describes the shell's query parameters. `capsHash` moves whenever any spec moves,
so it can say *different* but never *older*; and `/health.version` is `git describe
--tags --always --dirty`, which on an untagged tree is a commit hash and does not order
either. The shell stamps `document.body.dataset.chrome` in a classic script at the top
of `<body>`, and that line **is** the feature — testing the feature beats testing a
proxy for it. If `aboard` ever declares its shell parameters in the manifest, move the
probe there and delete `shellSupportsChrome`.

## What the first real run found

Both defects had the same shape, and it is the shape to expect from this extension:
**the failure mode is silence.** Neither produced an error, a log line, or anything on
any console. The human found both by looking at the screen.

- **No coloured dots, on a board where every tab was marked.** Not a refresh problem,
  though it looked exactly like one — the tabs themselves only existed because of the
  same write that set the marks, so the tree had plainly refreshed. The dot SVGs were
  **not well-formed XML**: both opened `<!-- --agent, copied from … -->`, and XML
  forbids `--` inside a comment. A browser — which is what the VS Code workbench is —
  refuses such a document outright instead of recovering the way an HTML parser would,
  so `background-image` resolved to nothing and the row had no icon. `media/activity.svg`
  was unaffected only because its comment happened to contain no double hyphen. The
  trap: the CSS custom properties the values are copied from are *spelled* `--agent`
  and `--danger`, so naming the source accurately is what breaks the file.
  `test/media.test.ts` now checks the rule, and checks that the check can fail.
- **The board's own tab strip inside the panel.** Not this extension either: that board
  was served by a binary built before `?chrome=` landed. Hence the probe above.

### And the second and third runs

The second run (same day) still needed Refresh for a dot to appear, and the Output
channel said why: `event stream … dropped: Parse Error: JS Exception` at the exact
second of every write. VS Code 1.134's extension host is Node 24, and with F5's
debugger attached Node's inspector network instrumentation adds a `data` listener
to every response that reports `dataLength: chunk.byteLength` — a string chunk
(from `res.setEncoding('utf8')`) has none, the listener throws, and the parser
destroys the socket. The stream reads Buffers now (`cff655a`). The third run saw a
dot arrive live with no Refresh, and `ss` showed the host's connection to the board
surviving a write.

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
test/
  vscode-stub.ts        a stand-in `vscode` module — NOT a test file, and never an emulator
  integration.test.ts   spawns a real aboard and drives activate() against it
  oldboard.test.ts      a board that predates ?chrome=, and the one warning it earns
  media.test.ts         the icon files parse, and the check can be seen failing
```

The `vscode` import stops at `extension.ts`, `tree.ts` and `panel.ts` on purpose:
everything with a rule worth arguing about lives on the other side of that line,
where `node --test` can reach it.

## Troubleshooting: what is not ours

Three messages appeared in the Extension Development Host on the first real run and
cost time before they were ruled out. **None comes from this extension**, and the next
person should not have to prove that again.

| what you see | whose it is |
|---|---|
| `DeprecationWarning: The 'punycode' module is deprecated` (`DEP0040`) | Somebody else's extension in the same host process — dozens of the ones installed on the machine where this was seen reference `punycode`. |
| `DeprecationWarning: url.parse() behavior is not standardized` (`DEP0169`) | Same: dozens of them use `url.parse`. |
| `ENOENT … devbox.json` | The `jetpack-io.devbox` extension, looking for a config file this project does not have. |

Count them for yourself rather than trusting a number in a document — the answer is
whatever is installed on *your* machine today:

```sh
grep -rl "punycode" --include="*.js" ~/.vscode/extensions | sed 's|.*/extensions/||; s|/.*||' | sort -u | wc -l
```

Why they cannot be ours: `dist/extension.js` requires exactly four modules —
`node:fs`, `node:http`, `node:path` and `vscode` — and there are **zero runtime
dependencies**, so there is no transitive package to blame either. `src/panel.ts` does
use `new URL(...)`, which is the WHATWG global that *replaced* `url.parse`, not the
deprecated function; a grep for "url" finds it and it is not the source.

All extensions share one extension-host Node process, so a deprecation warning names
no extension at all. To find out whose a warning really is, relaunch the host with
`--trace-deprecation` and read the stack.

One correction to the brief that raised these: the Claude Code extension is not the
source. None of the JavaScript the host actually loads for it mentions either API —

```sh
grep -rl "punycode\|url\.parse(" --include="*.js" ~/.vscode/extensions/anthropic.claude-code-*/   # exits 1
```

— and dropping `--include` only turns up its bundled *native* binaries, which run in
processes of their own and cannot raise a `DeprecationWarning` in this one. Guessing at
an owner from the warning text is the mistake; the process boundary is why it cannot
work.

## Install

There is no `.vsix` yet, deliberately — see `docs/handoff.md` §9. The loop today is
F5 from this repo, which opens an Extension Development Host. Open VSX later if
someone asks; never the Marketplace, because to anyone without an `aboard` project
this installs, finds nothing, and does nothing.

`docs/handoff.md` carries the full design, the milestone plan, and the reasoning
behind every decision summarised above.
