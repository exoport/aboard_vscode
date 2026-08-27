# aboard-vscode

A VS Code extension that gives the [`aboard`](https://github.com/exoport/aboard)
board a native home inside the editor: a `TreeView` of a project's tabs in the
sidebar, with the board itself rendered in a webview panel.

It is a **viewer**. No rendering, no state, and no schema knowledge live here, and
none should ever be added; everything it shows comes from the running `aboard` (or
`ape aboard`) server over plain HTTP, the same way any other client reads it. When
`aboard` grows a sixteenth renderer this extension needs zero changes — if it ever
does, something here is wrong.

> **Status: verified in a real VS Code on 2026-08-26 (M6 step 1); a dev `.vsix` packages
> as of 2026-08-27, and has not been installed from yet.** The human worked the hand-verification checklist (*What has been observed
> in a real VS Code*, below) through in an Extension Development Host against
> `/home/diegos/_dev/ai/borrar` on
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
> binary — and it has **since been looked at in a running host**: the board's own switch
> works inside the panel and the panel follows a VS Code theme change. A high-contrast
> LIGHT theme and `aboard.theme: board` are still unwatched.
>
> **Since 2026-08-27 there is a `.vsix`, and it has been installed and run.** The package
> step is `npm run package` (see *Install, and the publishing ladder*); it builds and
> produces `aboard-vscode-0.1.0.vsix` for installing into a real editor — which is a
> different test from F5 and catches different things. Installing it is what found the
> three theme and layout defects below, none of which any test had. The bell became
> `$(zap)` / `$(circle-slash)` and the three commands became `aboard.nudge*`: a bell says
> *notifications for you*, and this button means an agent is blocked on you and one click
> releases it. Nothing about the mechanism changed.
>
> **The palette took two passes after that, and both are now confirmed in a running
> host** (2026-08-27), high contrast included, in both variants. What the two failures had
> in common is worth more than either fix: every colour involved was individually valid,
> so nothing warned at either end. The board's palette is not a bag of colours — the four
> depth tokens are an ORDER and the eleven voices are a SET that must stay mutually
> distinguishable — and a host theme guarantees neither. See *The theme*.
>
> Still open, deliberately: the extension's own SSE backoff watched during a board that
> will not come back, the old-binary warning (which now needs an `aboard` built before
> 2026-08-26 03:34 to provoke), and Remote SSH / Codespaces. Publishing anywhere is still
> gated on the human.
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
| `POST /poke` · `GET /waiters` | the nudge channel: the view-title button, a status-bar item and a command. `/waiters` is read on every reload as well as followed on the stream, because the `waiters` frame is only sent when the count CHANGES — a session that parked before the window opened is invisible to the frame alone. |
| `#tab=<id>` on the board URL | navigation, and "copy link to this tab". |
| `{__aboard: 'active', tab}` posted OUT of the frame | the board announcing its own tab switches, so the sidebar highlight follows `[`, `]` and `1`–`9` pressed inside the panel. Authenticated by `event.source`, never by origin. |
| `{__aboard: 'theme', kind, tokens}` posted INTO the frame | the editor's colours, as the board's own 21 tokens. Per viewer, applied as inline custom properties, **written nowhere** — not the state file, not `localStorage`. Governed by the `aboard.theme` setting; see below. |
| `{__aboard: 'newtab'}` posted INTO the frame | the sidebar's **New Tab** button. `?chrome=notabs` hides the board's whole tab strip including its own `+`, so this is how the button reaches the sheet — which the BOARD draws. Nothing about types or empty states passes through here, which is what keeps this repository free of the board's schema. |

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

Both are specified in the `aboard` repo's `docs/reference/http-api.md` — `?chrome=` and
"What the shell posts to an embedder" — and both **shipped on 2026-08-26**. This
repository needed no change
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

Two more, found by the human working the rest of the verification list on 2026-08-26.
Same shape as the first two: the mechanism worked, the screen said nothing.

*(This section says "bell" throughout because that is what the button was on the day
these were found. It became `$(zap)`/`$(circle-slash)` on 2026-08-27 — see **What it
does** above for why. The mechanism below is unchanged; only the glyph and the command
ids moved.)*

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
- **New Tab** in the view title, because `?chrome=notabs` hides the board's own `+`
  along with the strip — it used to sit alone on a row of the panel, which is a whole
  line of a small viewer. The button posts `{__aboard: 'newtab'}` and the **board**
  opens its own sheet: the human names the tab and picks the type there, and the board
  switches to whatever is created. Deliberately not reimplemented here — the sheet knows
  every type the board has and what an empty state of each looks like, and a copy of
  that living in a viewer is exactly the coupling this repository exists without. Hidden
  until a board is actually answering (`aboard.hasBoard`), since with nothing running
  there is no panel for a sheet to open in.
- **Actions**, all writes the board permits from a human: dismiss a change,
  approve or deny a removal request, rename, set the note, notify a waiting
  session, and three separate copies — the id (`bb32`), the **reference**
  (`Migration review (bb32)`, the form the board's docs tell agents to write when
  they address a human) and the **link** (the deep link the board's own right-click
  menu builds). They were one command copying a URL until 2026-08-26; see below.
- **A nudge button that says whether anybody is listening.** The view-title button is
  `$(zap)` while an agent is parked on `aboard wait` and `$(circle-slash)` when none is,
  driven by the `aboard.waiting` context key. A board with nobody waiting is simply not
  listening, and the button says so rather than pretending.
  **It was a bell until 2026-08-27**, and the change is worth recording because the
  mechanism was never the problem. A bell in an editor means *notifications for you*, so
  the button read as the board having news to deliver — when what it means is the
  opposite direction: an agent is blocked, and you are the only one who can release it.
  `$(zap)` is the board's own word for that; the route this button calls is `POST /poke`.
  The idle state is `$(circle-slash)` rather than a fainter zap, because "nothing to
  nudge" is a different statement from "nudge", not a quieter one. The commands were
  renamed with it — `aboard.nudge`, `aboard.nudgeIdle`, `aboard.nudgeWaiting`, titled
  "Nudge Waiting Agent" — which was free, since nothing is published and no keybinding
  anywhere names the old ids. `test/manifest.test.ts` asserts that none of the three is a
  bell again, so restoring the familiar icon fails a test rather than a review.
- **More than one board** in one window — a multi-root workspace, or one project
  serving a named board beside its default — gets a row each, so the tree says
  which is which.
- **The board follows your VS Code theme**, so the panel is not a dark rectangle
  inside a light IDE. See below for what travels and what deliberately does not.

### Starting a board when there is not one

Discovery walks **up** from each workspace folder looking for
`.aboard/run/instance.json` (and `instance.<name>.json` for a named board on the same
project), mirroring aboard's own root-discovery loop rather than checking only the
folder's immediate root — a workspace opened on a subdirectory must still find its board.
Each candidate is confirmed with `GET /health`, keeping it only where `health.project`
equals the root it was found under, which rules out both realistic failures: a stale
instance file from a server that died, and another project's board answering on a port
somebody guessed.

When that finds **nothing running**, the welcome view offers to start one — and it picks
the command from what is actually on `PATH` rather than guessing:

1. `aboard` on `PATH` → offer **`aboard serve`** in a new terminal. Plain; there is no
   force-restart flag to reach for, and `aboard serve` refuses to start beside this
   project's own board on its own.
2. Otherwise `ape` on `PATH` → offer **`ape aboard serve`**.
3. Neither → an **error naming both commands**, never a silent nothing. An empty tree with
   no explanation is the worst version of this, and the human is one install away.
4. **Both present → prefer `aboard`.** This is a judgement call and it is recorded as one:
   aboard's own port plan states no preference between the two hosts when both are
   available. `aboard` wins because it is the dedicated binary and the whole HTTP contract
   above is written against it; `ape aboard` exists for projects that standardise on `ape`
   for everything, and is the right answer when it is the one that is there. Change it
   here and in `src/launch.ts` together, or the comment and the code drift.

After launching either, `/health` is polled for a few seconds rather than assumed
successful.

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

**The depth ramp is derived, not borrowed, and it is the one place this mapping
deliberately stops following the editor.** `--bg` is the editor's background; the
three layers above it — `--sunken`, `--surface`, `--raised` — are computed from
it using the board's own steps rather than read off VS Code roles.

They were borrowed until 2026-08-27, from `input.background`,
`sideBar.background` and `button.secondaryBackground`, and the result did not
survive contact with a real theme. The board's depth vocabulary is an ORDER —
`bg → sunken → surface → raised`, running upward from black in dark and downward
from white in light — and VS Code's registered colours have no ordering
relationship to each other, because they answer unrelated questions. Measured on
FireFly Pro, which is where the report came from:

| token | old source | value | board's own |
|---|---|---|---|
| `--bg` | `editor.background` | `#0a0f17` | `#000000` |
| `--sunken` | `input.background` | `#000000` | `#0a0a0a` — **below the ground** |
| `--surface` | `sideBar.background` | `#0e1421` | `#151515` |
| `--raised` | `button.secondaryBackground` | `#3a3d41` | `#202020` |

That last row is the loudest: FireFly Pro does not set
`button.secondaryBackground` at all, so VS Code's default mid grey decided it —
and `.icon-btn` paints with `--raised`, which made every Edit / Add / Dismiss /
Fit button in the panel a light grey pill where a browser draws it dark. The two
head strips went the other way and became recessed boxes. The panel and a browser
tab on the same board did not look like the same product.

Derived, the same ground gives `#141921`, `#1f242c`, `#2a2f37`: correctly ordered,
still that theme's blue-black, and the same *relationship* the browser draws. The
step is applied equally to r, g and b, which is what keeps the editor's tint. If
`--bg` cannot be parsed the ramp is not sent at all, and the board keeps its own
complete set of four — the same fail-closed rule the contrast guard follows.

One knock-on worth knowing: the guard now measures text against three grounds
that are always present, so it withholds text slightly more often than before. It
is measuring what will actually be painted, which is the point.

**Follow the editor's neutrals; keep the board's voices.** This is the rule, and
it took two rounds of looking at a real panel to arrive at it.

*Neutrals* — the ground, the three layers above it, the text hierarchy, the
hairlines (`--bg`, `--sunken`, `--surface`, `--raised`, `--text`, `--muted`,
`--dim`, `--line`, `--line-strong`, `--edge`) — follow the editor. They are what
make the panel belong in the window and they have no meaning to lose.

*Voices* — `--accent`, `--accent-ink`, `--accent-dim`, `--mark`, `--agent`,
`--focus`, `--danger`, `--drop` and the three `--status-*` — are the board's, in
the panel exactly as in a browser tab. They were mapped until 2026-08-27 and the
result was not a theme, it was a lost vocabulary.

Depth is an ORDER; the voices are a SET, chosen so no two can be mistaken for one
another. VS Code guarantees neither, because nothing asks a theme author to keep a
link distinguishable from a button. `views/markup.spec.json` is where it showed:
a mark may take one of five colours, drawn as five swatches side by side. Through
the old mapping, on FireFly Pro:

| swatch | mapped from | value | in a browser |
|---|---|---|---|
| `mark` | `editorWarning.foreground` | `#e6b450` amber | `#fb8c00` orange |
| `accent` | `button.background` | `#a4bd00` olive | `#a4bd00` |
| `focus` | `focusBorder` | `#292d36` — near-black, invisible | `#39bae6` cyan |
| `agent` | `textLink.foreground` | `#a4bd00` — **identical to `accent`** | `#a7adf4` periwinkle |
| `danger` | `errorForeground` *(FireFly sets none)* | `#f85149` salmon | `#ff0066` magenta |

Five choices rendered as three usable colours, one a repeat and one unusable. And
the board's voices are a language its own docs teach: periwinkle is what an agent
says, orange is what the human asks for, and every agent reads those sentences in
the skill. A panel that repaints them in an editor's colours is not following a
theme, it is discarding a vocabulary — quietly, with nothing on any console.

`test/theme.test.ts` pins the split both ways: nothing but a neutral may be sent,
and none of the five mark colours may be.

**What is deliberately left out of the neutrals, too.** A token whose VS Code
counterpart is absent is not sent, so the board's own value for it stands — a
colour somebody chose against a palette somebody checked, which a guess is not.
`contrastBorder` exists only in high-contrast themes, and a theme missing one
colour must not cost the board a whole palette.

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

## Decisions worth keeping

Six calls that shaped this repository. They are recorded because each one has a plausible
opposite that somebody will propose again.

**Three hard rules, and one of them is the whole point of the extension existing.**

- **Never touch `.aboard/aboard.json` on disk.** Every write goes through
  `POST /aboard.json` with compare-and-set — the mechanism that stops a concurrent agent's
  work from being destroyed with no error.
- **Never assume you should launch a new server.** Check the instance record and `/health`
  first; a second `aboard serve` on a project that already has one is two servers on two
  ports for one board, which is confusing for no benefit.
- **Write as `__by: "human"`, because a human clicked.** Never `agent-*`. Deleting a tab,
  dismissing a change marker and answering a removal request are gestures the server
  *refuses* from an agent — by carrying the old value forward, with a `200`. Offering them
  here is not a liberty this extension takes; it is the point of being the human's client.
  Get the field wrong and every one of them becomes a silent no-op.

**A separate repository, deliberately.** aboard is Go with an embedded web tree and a
dependency-light build; dropping `package.json`, `node_modules`, TypeScript and esbuild
into that tree would quietly repeal that choice. This extension also versions on a
different clock and has a different audience. What remains is a **contract, not a shared
file** — the table above — which is why either side can move without the other.

**A native `TreeView`, not a `WebviewView` reusing the board's stylesheet.** The webview
route buys pixel-identical colour and costs everything a native tree gets for free:
keyboard navigation, type-to-filter, collapse state, `TreeView.badge`, context menus,
`reveal`, and following the user's own VS Code theme. The one place a native tree pays a
real cost is colour fidelity for the two status dots, and that is paid with two 16×16 SVGs
carrying the board's own token values.

**Never duplicate without a test that breaks when the copy goes stale.** That is the rule,
and it is not "never duplicate" — this repository holds two copies of things aboard owns
and both are held to it. `src/tokens.ts` has the two dot colours and `test/tokens.test.ts`
fails when an SVG drifts from it; `src/theme.ts` has the board's 21 token names and
`test/integration.test.ts` asks the real binary for the list and fails on drift. Writing a
hex value into two SVGs and calling a paragraph the single source would have been a wish.

**And keep the two icon tests apart**, because they ask different questions.
`tokens.test.ts` asks whether the colour is *right*; `media.test.ts` asks whether there is
a colour *at all*. Reading a file as text and finding a hex string in it says nothing about
whether a browser will draw it — and for a while it did not, because both SVGs shipped as
malformed XML.

**`test/vscode-stub.ts` must never become a VS Code emulator.** It models only what the
extension actually depends on: a synchronous `EventEmitter`, a TreeView that re-walks
`getChildren`/`getTreeItem` when `onDidChangeTreeData` fires, `setContext`, notifications
and clipboard writes recorded rather than performed, the status-bar item, and the
provider's own node behind each rendered row — that last one because it is exactly what VS
Code hands a `view/item/context` command, so a test can press a menu item the way a human
does rather than calling the function under it. **`panel.ts` stays deliberately
uncovered**: covering it would mean a fake webview, and that is precisely where a stand-in
becomes an emulator.

## What has been observed in a real VS Code

Nothing below can be asserted headlessly. This is the record of what a human has
actually watched happen, with the date, and it is the honest half of every status claim
in this file. **`[x]`** was observed; **`[~]`** means the part that can be driven against
a real board is proven and the part that needs a human looking at VS Code is not — a full
tick there would claim more than anybody has seen; **`[ ]`** is still open.

The list was worked through twice on **2026-08-26**, both times in an Extension
Development Host against `/home/diegos/_dev/ai/borrar`. The first pass reached the top
four rows and stopped on two defects; the second went through everything left and passed
all of it but two, which are the two `[~]` rows. Both of those are fixed, and neither fix
has been looked at in a running host.

- [x] The extension activates and the tree lists every tab, in `aboard.json` order, each with its id as the description. (2026-08-26)
- [x] A board started AFTER the window was already open still appears — the `**/.aboard/run/instance*.json` watcher fires and discovery re-runs. (2026-08-26)
- [x] The board renders inside the panel. (2026-08-26)
- [x] Tab switching does not reload the page. (2026-08-26) This is the mechanism the whole navigation design rests on: a fragment-only `src` change fires `hashchange` without reloading, so no SSE stream drops and no renderer remounts.
- [x] The panel survives being dragged to another editor group, and being hidden and revealed — `retainContextWhenHidden`. (2026-08-26)
- [x] `html` tabs paint inside the panel, with a clean console. (2026-08-26) The webview console is the last word here and it was read: `connect-src 'none'` plus the `vscode-webview:` ancestor list is the containment, and neither showed up as a blocked request.
- [x] Dots appear within a second of an agent's write. (2026-08-26, third run) A periwinkle dot on a touched tab and a red one on a removal request, arriving with no Refresh after the stream fix. The first two runs needed Refresh — first the malformed SVGs, then Node 24's inspector killing the stream on every string chunk under F5. Dismiss from the sidebar was watched in the same session.
- [x] The board's own tab strip does NOT appear inside the panel on a current binary. (2026-08-26, against `aboard de7773f`)
- [x] A removal request shows red and both answers do what they say. (2026-08-26, fully) First through the board's own banner inside the panel, then through the sidebar's own Approve / Deny items. Both were proven headlessly first against a real spawned board — deliberately a server test rather than a unit one, because the same edit from an agent gets the tab RESTORED with a `pendingRemoval`, so a test that only checks what the edit does to a JSON object proves nothing about what the board does with it.
- [x] Rename and Set note from the sidebar. (2026-08-26) Both are ordinary writes; what is being checked is that they land as the HUMAN, since an agent renaming a tab is allowed and a wrong `__by` here would not fail visibly the way Dismiss does.
- [x] `]` inside the panel moves the tree highlight. (2026-08-26) The `{__aboard: 'active', tab}` message arriving and `reveal` acting on it.
- [x] Two viewers — the panel and a plain browser — open at once, disagreeing about chrome and agreeing about content, each on its own active tab. (2026-08-26) This row is the one that proves neither leaks into the state file.
- [x] Restarting the `aboard` server on the same root while the panel is open: the page reloads itself, the tree stays alive, no stale `app.css`. (2026-08-26)
- [x] A forced `409` — a write from the browser mid-edit — warns rather than clobbers. (2026-08-26)
- [x] The "Start the board" fallback: with nothing running the welcome view offers it, it picks the command from what is on `PATH`, and the tree fills in once the board answers. (2026-08-26)
- [x] The board follows the VS Code theme. (2026-08-26, and **high contrast both ways on 2026-08-27**) The board's own dark/light switch works inside the panel, and switching the VS Code theme recolours it. High-contrast **dark and light** were both worked through on 2026-08-27 and both came out right — which is the row that mattered most of the three, because HC light is the only place `themeKindFromBodyClass` can go wrong in a way no other theme reveals: a high-contrast light body carries `vscode-high-contrast` AND `vscode-high-contrast-light`, so testing the general class first would have rendered every one of them as a dark board inside a white editor. Machine-tested since it was written; now watched. It is also the only family that defines `contrastBorder`, so it is the only one where `--line-strong` comes from the theme at all. Still unobserved inside this row: `aboard.theme: board`. Note that full fidelity is **not** the expected result — on VS Code's own Dark+ the text colours are withheld by the contrast guard, so the backgrounds should match the editor while the type stays the board's. A panel whose text went grey-on-grey would be the guard failing, not the theme arriving.
- [~] **The nudge button lights only when a session is genuinely parked on `aboard wait`, and pressing it releases that session.** Failed on 2026-08-26 and fixed — see *What running it found*. Proven: `test/integration.test.ts` parks a REAL `aboard wait` against a real spawned board, asserts `aboard.waiting` flips true, presses the nudge command through the controller, and asserts the CLI exits 0 and the key flips back. Not proven: that VS Code draws the lit `$(zap)` entry from that key, which only a running host can show.
- [~] **Copy Reference copies a reference, and Copy Link copies a link.** Failed on 2026-08-26 and fixed. Both commands are pressed through their registered handlers with the tree node VS Code would hand them (`test/copy.test.ts`), and the two titles are asserted as manifest data (`test/manifest.test.ts`). Not proven: that both items appear on the right-click menu in that order, which is a `menus` contribution only a host evaluates.
- [ ] **Installed from the `.vsix`, rather than run under F5.** `npm run package && code --install-extension aboard-vscode-0.1.0.vsix --force`, then a normal window on a project with a board. This is the first time the extension runs with no debugger attached and from the packaged file list, so it is the only check that can catch a `.vscodeignore` that excludes something load-bearing — and the only one where the F5-only defects (Node 24's inspector killing the SSE stream, `cff655a`) are guaranteed absent.
- [x] **The panel and a browser tab on the same board look like the same product.** (2026-08-27) Both fixes in *The theme*, confirmed on FireFly Pro: the derived depth ramp (strips nearly flat, icon buttons dark rather than light grey pills) and the neutrals/voices split (the five mark swatches on a `markup` tab being five distinguishable colours, the same five a browser draws). Backgrounds still follow the editor's ground — that difference is the feature, not a miss. **It took two passes to get here and neither was caught by a test**, because both failures were made of individually valid colours: the first mapping inverted the depth order, the second collapsed two of five mark swatches to one colour and made a third invisible. A pure function over real theme values is now asserted for both, but the thing that found them was a human looking at the screen — which is what every row on this list is for.
- [x] **New Tab in the sidebar opens the board's own sheet, and the panel lands on the new tab.** (2026-08-27) The message hop is covered in `test/panelhtml.test.ts` and the board's half by `TestCreatingATabSwitchesToIt` in the aboard repo's browser suite; this row is the two of them meeting in a real host, which is the only place the `view/title` contribution, the webview `postMessage` and the board's `e.source` check are all real at once.
- [ ] **The nudge button, in both states, on a real toolbar.** `$(zap)` with an agent parked on `aboard wait` and `$(circle-slash)` with none. Asserted as manifest data in `test/manifest.test.ts` and pressed through its handler in `test/notify.test.ts`, but which glyph VS Code actually paints for a `view/title` entry is something only a host draws.
- [ ] The stream survives a board restart, and a board that will NOT come back stops being retried every second. Kill `aboard serve` and watch the Aboard output channel: the reconnect notices should space out, not tick once a second. The row about the page reloading covers the restart the *board* notices; this one is the extension's own backoff, which is a different mechanism and is still unwatched.
- [ ] *Optional:* the old-binary warning. A board served by a binary that predates `?chrome=` raises exactly one warning naming the board and its version. Asserted by `test/oldboard.test.ts`, including the in-flight-write case that used to fire it three times, but never seen in a real host — and increasingly hard to arrange, since it needs an `aboard` built before 2026-08-26 03:34.
- [ ] *Optional:* Remote SSH / Codespaces. `asExternalUri` + `portMapping` are coded and the webview CSP lists the externalised origin alongside both loopback spellings. Only a real remote window can confirm it, and nothing else here depends on it.

**Rebuild before pressing F5, and reload the dev-host window after an edit.**
`.vscode/launch.json` runs `npm: build` as a preLaunchTask, so the first is handled; the
second is not, because the build is one-shot rather than a watcher (a watcher never
"finishes" and VS Code would sit waiting for it). A dev host left open across an edit is
running the previous bundle, silently — which is the same class of mistake as every
defect in *What running it found*.

## What must be hardened before any public listing

The pure-logic half of this list is handled and unit-tested; the entries needing a real
host say so.

| Case | Status |
| --- | --- |
| No workspace open; multi-root workspaces; a folder with no `.aboard/` | **Handled.** Discovery over zero folders returns nothing, two folders under one project root count as one board, and a folder with no `.aboard/` yields nothing — with `aboard.hasProject` picking between "no board is running" and "no project here", each with its own welcome text, so the two silences are distinguishable. |
| `instance.json` present but the server is dead, or answering for another project | **Handled and kept.** A candidate whose `/health` names another project, or does not answer, is dropped with the reason written to the Aboard output channel. |
| The port is occupied by something that is not a board | **Handled.** `app` must be `aboard` or `ape-aboard`, and a non-JSON answer is refused by the same path. |
| Two boards for two folders open at once | **Handled.** With more than one board the tabs sit under a row per board, labelled by folder and by `--name` where a project serves a named board beside its default. With exactly one, the tabs are top-level — a single always-open parent row is a wasted line. |
| Schema drift | **Handled.** The document's `version` is compared against `/capabilities`.`schema`, both read from the same server, so no schema number is hardcoded here. A mismatch is a warning notification, once, plus `schema mismatch` on the board's row for as long as it is true. |
| Errors surfaced as notifications, never swallowed | **Handled.** Every action failure is a notification carrying the server's own sentence; background noise — a dropped stream, an ignored instance file — goes to the output channel rather than interrupting. |
| Remote SSH / Codespaces / vscode.dev | **Coded, UNVERIFIED.** `asExternalUri` and `portMapping` are set and the webview CSP's `frame-src` lists the externalised origin alongside both loopback spellings. On vscode.dev the framing origin is `https://*.vscode-cdn.net`, which aboard's CSP already lists. Only a real remote window can confirm it. |

Five things this list once called "handled" and were not, each found by review against a
real `aboard serve` rather than reasoned about, and all five fixed. They share the shape
everything here shares — **the failure mode is silence**, and every one left the sidebar
looking merely quiet, which is the same picture as a board with nothing new on it.

- **A request could never settle.** `httpRequest` listened for `data` and `end` and nothing else, so a response cut off mid-body left the promise pending forever — and `discover()` holds its re-entrancy flag across that await, so ONE truncated answer stopped every future discovery for the life of the window. Every path settles exactly once now, and `test/board.test.ts` asserts it with a real socket destroy under an explicit timeout, because before the fix that test did not fail — it hung.
- **A board that stopped left its tabs in the tree.** `discover()` only rendered from inside `reloadAll()`, which iterates the entries, so with zero boards it rendered nothing at all and the dead board's tabs stayed listed and clickable. The welcome view could not appear either, because a view with children never shows one.
- **A named board with a dot in its name was invisible.** The board's own name rule allows dots, so `--name v1.2` writes `instance.v1.2.json`; the discovery regex used `[^.]+` for the name segment and skipped it. Reproduced with two live servers on one project.
- **A sole board with no document showed a blank sidebar.** With exactly one board its tabs are top-level, so when `/aboard.json` failed there was nothing to draw and no row to carry the reason. The board's own row is shown now, with the problem as its description.
- **The waiter count started as a guess.** The `waiters` frame is only sent when the count CHANGES, so a session that parked before the window opened was invisible: the status bar said "nothing to notify" while somebody was blocked on exactly that button. `/waiters` is read once per refresh and the frames keep it current.

One hardening change came with them: `media/panel.html` accepts a `goto` only for a src
that starts with the one the frame was rendered with. The board's `html` tabs are
sandboxed frames that can reach `window.top`, and that handler is the only thing on the
page that navigates anything. The CSP already pinned the origin; this pins the base path
too. The invariant it rests on — that every `frameSrc()` value starts with the no-tab
form — is asserted in `test/model.test.ts`, since `panel.html` is a file no unit test can
load.

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

## Install, and the publishing ladder

**Today — a local `.vsix`, for testing in a real editor before anything is released.**
`@vscode/vsce` is a dev dependency and `npm run package` is the whole step:

```sh
npm run package                                      # → aboard-vscode-0.1.0.vsix
code --install-extension aboard-vscode-0.1.0.vsix --force
```

`package` runs `vsce package`, which runs `vscode:prepublish` → `npm run build` first, so
the bundle in the archive is always built from the tree it was packaged from. The result
is ~48 KB and ten files: `dist/extension.js`, the four things in `media/`, `package.json`,
`README.md`, `LICENSE.txt` and the two archive manifests. `src/`, `test/`, `out/`,
`node_modules/`, the esbuild config and every `.map` stay out, which is what
`.vscodeignore` is for — check that list in vsce's own output when you package, because a
`.vscodeignore` that stops matching is silent.

**An installed `.vsix` and F5 are not the same test**, and this is the reason to have
both. F5 runs an Extension Development Host with a debugger attached — which is what
turned Node 24's inspector instrumentation into a dropped SSE stream (`cff655a`), a defect
that exists only under F5. An installed build runs the way a user's does: no debugger, the
real activation events, and the packaged file list rather than the working tree. Anything
`.vscodeignore` wrongly excludes is invisible until this step.

The manifest already carried everything `vsce` demands — `name`, `publisher`, `version`,
`engines.vscode`, `main`, `contributes`, `activationEvents`, plus `README.md` and a
`LICENSE` (it complains without one) — so packaging needed no new metadata, only the tool.

**Later — Open VSX, if and only if somebody else wants it.** It needs an Eclipse
Foundation account with the Publisher Agreement signed, a namespace, and a token:

```sh
npx ovsx create-namespace <publisher> -p "$OVSX_TOKEN"
npx ovsx publish aboard-vscode-0.1.0.vsix -p "$OVSX_TOKEN"
```

**Not the VS Code Marketplace — deliberate, not an omission.** This extension is coupled
to a workspace that contains an `aboard` (or `ape aboard`) project. To a stranger it
installs, finds nothing, and does nothing, which is a bad thing to put in a store people
browse. Open VSX first, and only on request.

**The publisher is `exoport`**, matching the Go module path `github.com/exoport/aboard`.
It is only a namespace today — nothing is published anywhere — but it is baked into the
`.vsix` filename and would become an Open VSX namespace later, so it is recorded here
rather than left to whoever runs `vsce` first. The display name is **Aboard Panel** and
the extension id is `aboard-vscode`; both are judgement calls made when the scaffold
landed, and both should stay stable now that they are chosen. The alternative was leaving
the publisher out until publishing day, and `vsce package` refuses without one — so the
trade was "decide it now" against "decide it under time pressure".
