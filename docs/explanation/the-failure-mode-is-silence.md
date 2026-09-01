# The failure mode is silence

Fourteen defects have been found in this extension by a human looking at the screen,
across four rounds, and **not one was visible to `node --test`**. Every one had the same
shape: the mechanism worked and the thing on screen said nothing.

That is not a coincidence and it is not a gap in the suite that a bigger suite would
close. This is a viewer. Almost everything it does is *say something* — a dot, an icon, a
colour, a tooltip, a menu item — and a test can only assert that the saying happened, not
that it landed in front of a person as the thing they needed to know. A wrong `__by`
returns `200`. A malformed SVG resolves to no image. A bell means the opposite of a zap.
None of those is an error anywhere.

So this page is the log, in order, because the pattern is more useful than any single
entry.

## Round one and two: two `F5` passes, 2026-08-26

Six defects, including one in the *aboard* repository: the board called `window.confirm`,
which a webview swallows, so **Remove tab** did nothing at all.

**No coloured dots, on a board where every tab was marked.** Not a refresh problem,
though it looked exactly like one — the tabs themselves only existed because of the same
write that set the marks, so the tree had plainly refreshed. The dot SVGs were **not
well-formed XML**: both opened `<!-- --agent, copied from … -->`, and XML forbids `--`
inside a comment. A browser — which is what the VS Code workbench is — refuses such a
document outright instead of recovering the way an HTML parser would, so
`background-image` resolved to nothing and the row had no icon. `media/activity.svg` was
unaffected only because its comment happened to contain no double hyphen. The trap: the
CSS custom properties the values are copied from are *spelled* `--agent` and `--danger`,
so naming the source accurately is what breaks the file. `test/media.test.ts` now checks
the rule, and checks that the check can fail.

**The board's own tab strip inside the panel.** Not this extension either: that board was
served by a binary built before `?chrome=` landed. Hence [the
probe](why-the-shell-is-probed.md).

**The second run still needed Refresh for a dot to appear**, and the Output channel said
why: `event stream … dropped: Parse Error: JS Exception` at the exact second of every
write. VS Code 1.134's extension host is Node 24, and with F5's debugger attached Node's
inspector network instrumentation adds a `data` listener to every response that reports
`dataLength: chunk.byteLength` — a string chunk (from `res.setEncoding('utf8')`) has
none, the listener throws, and the parser destroys the socket. The stream reads Buffers
now (`cff655a`). **This defect exists only under F5**, which is half the argument for
[testing an installed build too](../how-to/run-in-a-dev-host.md).

The third run saw a dot arrive live with no Refresh, and `ss` showed the host's
connection to the board surviving a write.

## The second pass through the checklist, 2026-08-26

Two more, found by the human working the rest of the verification list. Same shape: the
mechanism worked, the screen said nothing.

*(This section says "bell" because that is what the button was on the day these were
found. It became `$(zap)`/`$(circle-slash)` on 2026-08-27 — see [what it
does](../reference/what-it-does.md#the-view-title-buttons). The mechanism is unchanged;
only the glyph and the command ids moved.)*

**The notify bell never lit.** *"The poke in the terminal exited ok, the notification icon
was not lit."* The release was fine — the parked session came back and the CLI exited 0 —
but the only half a human sees before pressing anything did not move. Only the status-bar
item changed, and `aboard.notify` contributed one static `$(bell)`, so the button whose
whole job is to say *a session is blocked on you* said the same thing either way. There is
now an `aboard.waiting` context key and **two** `view/title` entries reading it: a menu
item takes its icon *and* its tooltip from the command, with no per-entry override, so two
states mean two command ids running one handler. Both sources feed the key — the `waiters`
frame and the `/waiters` read — because they fail differently.

**The bell believed the stream.** Found reviewing the fix above, not by running it.
`waiters` frames are fanned out with a non-blocking send and dropped for anyone who is not
listening, and a session parking during a gap produces no state change to trigger a
re-read — so `/waiters` is now asked again when the stream reconnects, and again when the
bell is pressed over a count the board turns out to disagree with. That second one used to
show *"No session is waiting"* on top of a still-lit bell.

**"Copy Reference" copied a link.** *"Copy id worked, there is no copy reference; there is
copy link to this tab and it works."* The command id was `aboard.copyReference` and its
title was "Copy Link to This Tab", so the sidebar had two ways to copy an address and none
to copy the form the board's own documentation tells every agent to use: the name with the
id beside it. Both exist now, named as two different things. The URL builder is called
`linkFor` here even though the board's `views/menu.js` calls its equivalent
`referenceFor` — on the board that word is already spent on the URL, and a
`copyReference` command calling a function called `referenceFor` that returns a link is
exactly how this happened.

## Round three: installing the `.vsix`, 2026-08-27

Four more that F5 had not found — the purpose strip reading as a notification, the `+`
costing a row of a small panel, and the VS Code palette mapping wrong **twice**.

Both palette failures were built from **individually valid colours**, which is why nothing
warned at either end: the four depth tokens are an ORDER and the eleven voices are a SET
that must stay mutually distinguishable, and a host theme guarantees neither. That one has
[its own page](why-the-theme-splits-neutrals-from-voices.md), with the measurements.

The `+` is the smaller story and the more typical one: the board's own `+` sat alone on a
row of the panel, which is a whole line of a small viewer, and nothing about that is a
defect any assertion could hold. It became a view-title button.

## Round four: the clipboard round trip, 2026-08-28

Three, one of which the board could not even describe — it was discovering its host's
abilities **by timing out**, and a timeout cannot tell "nothing framed me" from "an old
host" from "a host that broke". Nor any of them from a working host a moment before it
succeeds. Hosts announce themselves now. The mechanism, and the `xclip` fork bug that came
with it, are in [why the host copies images](why-the-host-copies-images.md).

**And the install itself was one of them.** A clipboard failure survived three rounds of
"reinstalled, restarted, still broken" against an extension from three hours earlier,
while the board, the bridge and `xclip` were all correct. Two things made it invisible:
every dev build carried the same version, so the extensions view could not tell them
apart; and `npm run package` deletes the previous `.vsix`, so a shell-history command
naming the old filename fails on a missing file and scrolls away. There are three
independent answers to "which build is running" now — the version moves per dev build,
`install:dev` prints what actually landed, and the extension writes
`aboard-vscode <version> activated` to the **Aboard** output channel — because the
question kept getting the wrong one.

## Five more, found by review rather than by looking

These were not screen defects; they were found reading the code against a real
`aboard serve`. They are listed in full in [edge cases](../reference/edge-cases.md), and
they belong on this page because every one of them **left the sidebar looking merely
quiet** — the same picture as a board with nothing new on it. A request that could never
settle, a dead board's tabs staying in the tree, a named board with a dot in its name
being invisible, a sole board with no document showing nothing at all, and a waiter count
that started as a guess.

## What follows from this

- **Nothing about the screen is asserted headlessly, and the log of what has been watched is a document** — [observed in a real editor](../reference/observed-in-a-real-editor.md), with dates, including the rows still open.
- **The output channel exists for this.** It names the running version at activation and logs each clipboard request with its outcome and timing, because a hop that crosses three processes cannot say from one dialog which of the three went quiet.
- **A test that pins the shape is worth more than a test that pins the value**, when the failure is invisible. `test/media.test.ts` asks whether an SVG *parses*, not whether it contains a hex string, because for a while both SVGs contained the right hex string and drew nothing.
- **Run it before believing it.** An installed `.vsix` and an F5 dev host are two different tests, and defects have been found only by each.
