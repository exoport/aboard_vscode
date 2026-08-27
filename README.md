# aboard-vscode

A VS Code extension that gives the [`aboard`](https://github.com/exoport/aboard)
board a native home inside the editor: a `TreeView` of a project's tabs in the
sidebar, with the board itself rendered in a webview panel.

It is a **viewer**. No rendering, no state, and no schema knowledge live here, and
none should ever be added; everything it shows comes from the running `aboard` (or
`ape aboard`) server over plain HTTP, the same way any other client reads it. When
`aboard` grows a sixteenth renderer this extension needs zero changes — if it ever
does, something here is wrong.

> **Status: verified in a real VS Code on 2026-08-26 (M6 step 1); `.vsix` not yet
> packaged.** The human worked the hand-verification checklist (`docs/handoff.md` §11)
> through in an Extension Development Host against `/home/diegos/_dev/ai/borrar` on
> `aboard 93ba033`, and **everything on it passed but two**: the notify bell never lit,
> and "Copy Reference" copied a link. Both are fixed here — see *What running it found*
> below — and both fixes are covered by tests, including one that parks a real
> `aboard wait` against a real spawned board. **Neither fix has been looked at in a
> running host**, which is why those two rows are `[~]` rather than `[x]`.
>
> **Four defects have been found by running it, across two passes, and all four are
> fixed.** Every one of them was invisible to the suite at the time, and every one had
> the same shape: the mechanism worked and the thing on screen said nothing. That is the
> measure of how far `node --test` can stand in for a real host, and the reason the two
> rows above stay honest.
>
> **Since that pass, one feature: the board follows your VS Code theme** (see *The theme*
> below). Machine-verified — the mapping, the contrast guard, the page's bridge script run
> in `node:vm`, the setting as manifest data, and the token names checked against the real
> binary — and **not yet looked at in a running host**, which is why `docs/handoff.md` §11
> carries it as an open row rather than a tick.
>
> Still open, deliberately: the extension's own SSE backoff watched during a board that
> will not come back, the old-binary warning (which now needs an `aboard` built before
> 2026-08-26 03:34 to provoke), and Remote SSH / Codespaces. `.vsix` packaging is gated
> on the human; the loop is still F5.
>
> The rest is covered by `npm test` (`node --test`, no framework — the count is in the
> run, not written down here, because a hand-maintained one lies eventually), which
> includes an **integration test that spawns a real `aboard`** and drives `activate()`
> against it through a stand-in `vscode` module — so the tree refresh, the SSE frame,
> the debounce, the icon path, the removal answers and the notify round trip are
> executed rather than reasoned about.

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
| `POST /poke` · `GET /waiters` | the notify channel: the view-title bell, a status-bar item and a command. `/waiters` is read on every reload as well as followed on the stream, because the `waiters` frame is only sent when the count CHANGES — a session that parked before the window opened is invisible to the frame alone. |
| `#tab=<id>` on the board URL | navigation, and "copy link to this tab". |
| `{__aboard: 'active', tab}` posted OUT of the frame | the board announcing its own tab switches, so the sidebar highlight follows `[`, `]` and `1`–`9` pressed inside the panel. Authenticated by `event.source`, never by origin. |
| `{__aboard: 'theme', kind, tokens}` posted INTO the frame | the editor's colours, as the board's own 21 tokens. Per viewer, applied as inline custom properties, **written nowhere** — not the state file, not `localStorage`. Governed by the `aboard.theme` setting; see below. |

Four facts the design rests on:

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
- **The editor's colours exist only inside the webview.** VS Code puts the live
  theme on the webview document's root as `--vscode-*` custom properties; the
  extension-host API gives `ColorTheme.kind` and no values at all, and the board's
  iframe is cross-origin so it inherits none of them. That one fact decides the
  whole shape of the theme feature below.

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

## What running it found

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

### And the second pass through the checklist

Two more, found by the human working the rest of `docs/handoff.md` §11 on 2026-08-26.
Same shape as the first two: the mechanism worked, the screen said nothing.

- **The notify bell never lit.** *"The poke in the terminal exited ok, the notification
  icon was not lit."* The release was fine — the parked session came back and the CLI
  exited 0 — but the only half a human sees before pressing anything did not move. Only
  the status-bar item changed, and `aboard.notify` contributed one static `$(bell)`, so
  the button whose whole job is to say *a session is blocked on you* said the same thing
  either way. There is now an `aboard.waiting` context key and **two** `view/title`
  entries reading it: a menu item takes its icon *and* its tooltip from the command, with
  no per-entry override, so two states mean two command ids running one handler. Both
  sources feed the key — the `waiters` frame and the `/waiters` read — because they fail
  differently.
- **The bell believed the stream.** Found reviewing the fix above, not by running it.
  `waiters` frames are fanned out with a non-blocking send and dropped for anyone who is
  not listening, and a session parking during a gap produces no state change to trigger a
  re-read — so `/waiters` is now asked again when the stream reconnects, and again when
  the bell is pressed over a count the board turns out to disagree with. That second one
  used to show *"No session is waiting"* on top of a still-lit bell.
- **"Copy Reference" copied a link.** *"Copy id worked, there is no copy reference; there
  is copy link to this tab and it works."* The command id was `aboard.copyReference` and
  its title was "Copy Link to This Tab", so the sidebar had two ways to copy an address
  and none to copy the form the board's own documentation tells every agent to use: the
  name with the id beside it. Both exist now, named as two different things. The URL
  builder is called `linkFor` here even though the board's `views/menu.js` calls its
  equivalent `referenceFor` — on the board that word is already spent on the URL, and a
  `copyReference` command calling a function called `referenceFor` that returns a link is
  exactly how this happened.

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
  session, and three separate copies — the id (`bb32`), the **reference**
  (`Migration review (bb32)`, the form the board's docs tell agents to write when
  they address a human) and the **link** (the deep link the board's own right-click
  menu builds). They were one command copying a URL until 2026-08-26; see below.
- **A bell that says whether anybody is listening.** The view-title button is
  `$(bell-dot)` while a session is parked on `aboard wait` and `$(bell)` when none is,
  driven by the `aboard.waiting` context key. A board with nobody waiting is simply not
  listening, and the button says so rather than pretending.
- **More than one board** in one window — a multi-root workspace, or one project
  serving a named board beside its default — gets a row each, so the tree says
  which is which.
- **The board follows your VS Code theme**, so the panel is not a dark rectangle
  inside a light IDE. See below for what travels and what deliberately does not.

## The theme

`aboard.theme` is `follow` (the default) or `board`. Under `board` the extension
sends no colours at all and the board's own `.aboard/theme.json` and dark/light
switch decide — which is the right setting for someone who deliberately keeps the
board in the other variant from their editor.

Under `follow`, three hops, and the first one is why it is three:

1. **`media/panel.html` reads** `--vscode-*` off its own root and posts the raw
   values to the extension host. It is the only place they exist: the host API has
   `ColorTheme.kind` and no values, and the board's iframe is cross-origin.
2. **`src/theme.ts` maps** them onto the board's 21 tokens. It is a pure function
   with no `vscode` import, which is the whole reason the page hands its values
   out instead of mapping them itself — `media/panel.html` stays a bridge and
   learns no palette, and every rule below is reachable from `node --test`.
3. **The page posts `{__aboard: 'theme', kind, tokens}` into the frame**, which the
   board applies as inline custom properties for that viewer only. Nothing is
   written: not the board document, not `localStorage`. Two people can look at one
   board in the same second and disagree about colour while agreeing about content.

It re-reads on four signals, and each catches something the others cannot: the
frame's `load` (a board that reloaded itself has lost the properties), a
`MutationObserver` on the body class (a switch between light and dark), a second
one on the root's inline `style` (two themes of the same kind differ in their
VALUES and in nothing else), and `window.onDidChangeActiveColorTheme` on the host
side. The last two overlap on purpose: the host's notice travels theme service →
extension host → renderer → page while the new properties travel theme service →
page, and nothing orders the two — a notice that overtakes them reads the old
theme and the panel keeps the previous colours until something unrelated moves.

**Only the host may set the palette.** The board's `html` tabs are frames inside
the frame and can reach `window.top`, so `media/panel.html` refuses a *theme*
message whose origin is the string `null` — which is what an opaque origin
serialises to, and what `sandbox="allow-scripts"` without `allow-same-origin`
gives every one of them. It is checked by origin rather than by `event.source`
because what `event.source` is for a host delivery is an internal of the webview
implementation, and a bridge built on that fails silently on the version that
changes it. `goto` deliberately keeps only its src-prefix pin: navigation had been
watched working in a real host and the theme had not when this was decided (it has
since — 2026-08-26), so a wrong guess about
`null` must cost a colour rather than a click.

**What is deliberately left out.** A token whose VS Code counterpart is absent is
not sent, so the board's own value for it stands — a colour somebody chose against
a palette somebody checked, which a guess is not. `contrastBorder` exists only in
high-contrast themes, and a theme missing one colour must not cost the board a
whole palette.

**And the text is guarded.** The board pins its type to WCAG AAA (7:1) because most
of it is small; an arbitrary VS Code theme does not. `--text`, `--muted` and
`--dim` are measured against every ground the mapping produced — `--bg`, `--sunken`
and `--surface`, which is the set the board's own rule names — and if any pair
misses AAA, none of the three is sent. The page ground alone is not the worst of
the three and reading only it lets text through that misses the pin exactly where
most of the board's small type sits, on panels and cards: on a theme with an
`editor.background` of `#ffffff` and a `sideBar.background` of `#e8e8e8`, an
`editor.foreground` of `#545454` is 7.6:1 on the ground and 6.2:1 on `--surface`. They travel as a group because a hierarchy assembled
from two palettes is not a hierarchy — the host's `--text` above the board's
`--dim` leaves nobody able to tell which grey is the quiet one — and because the
guard has to fail closed when a value cannot be parsed at all.

This fires on VS Code's own Dark+, where `descriptionForeground` is about 6.1:1 on
the editor background. That is the honest answer rather than a bug: the
backgrounds, the accent, the link and the error colour all still follow the
editor, so the panel belongs in the window, and the board keeps the type it can
prove is readable. High contrast maps to `dark` or `light` by the body class — a
high-contrast LIGHT theme carries both `vscode-high-contrast` and
`vscode-high-contrast-light`, so the specific class is tested first or every one
of them would come up black inside a white editor.

The 21 token names live in `src/theme.ts` so a name the board does not have
cannot be written: the mapping table is keyed by a union derived from that list,
so the mistake is a build that does not finish rather than a colour that silently
never arrives. That is a copy of something the `aboard` repo owns, and like
the two hex values in `src/tokens.ts` it is **checked rather than trusted**:
`test/integration.test.ts` asks the real binary for the list and fails on drift. A
name the board dropped or renamed arrives there as a warning on the board's own
console, which is not a console anybody working in VS Code is reading.

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
  theme.ts              VS Code's colours → the board's 21 tokens — no `vscode` import
  tree.ts               TreeDataProvider, a translation of model.ts
  panel.ts              WebviewPanel host and the bridge
  tokens.ts             the ONE place a colour is copied from aboard's app.css
media/
  panel.html            the shell: CSP, one iframe, and the bridge — goto, active, theme
  dot-change.svg        --agent  #a7adf4
  dot-removal.svg       --danger #ff0066
  activity.svg          the activity-bar icon (currentColor; VS Code tints it)
test/
  vscode-stub.ts        a stand-in `vscode` module — NOT a test file, and never an emulator
  fakeboard.ts          a board-shaped HTTP server, with activate() on top — also not a test file
  integration.test.ts   spawns a real aboard and drives activate() against it
  oldboard.test.ts      a board that predates ?chrome=, and the one warning it earns
  notify.test.ts        the aboard.waiting context key, and both ways it is fed
  copy.test.ts          Copy Reference and Copy Link, pressed as a human presses them
  manifest.test.ts      the contributions as data — the half no runtime test can see
  media.test.ts         the icon files parse, and the check can be seen failing
  panelhtml.test.ts     media/panel.html's bridge script, run in node:vm
  …plus board/boundary/discovery/health/launch/messages/model/sse/theme/tokens .test.ts,
   one per pure module, named after the file they cover
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
