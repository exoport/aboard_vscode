# Why the host copies images

The board's markup renderer copies a cropped region of an image as a PNG. In a browser it
uses `navigator.clipboard.write` and that is the end of it.

**In a webview it cannot, and never will.** Chromium refuses with *"The Clipboard API has
been blocked because of a permissions policy applied to the current document"*. The
webview document holds that policy, and VS Code exposes no way to lift it. This was
checked against `@types/vscode` rather than assumed:

- `WebviewOptions` offers `enableScripts`, `enableForms`, `enableCommandUris` and `localResourceRoots`, and **no permission field**.
- `vscode.env.clipboard` is `readText()` / `writeText(string)` — **text only, no image**.

`media/panel.html` does send `allow="clipboard-write"` on the iframe, which is necessary
and not sufficient: a frame can only be delegated a permission its parent already holds,
and the parent does not hold this one.

There is a related consequence that cost one more round of "it appears to do nothing":
right-click on the offered picture is a *browser* answer, not a panel one. The host owns
the context menu inside a webview, and it has no **Copy image**.

## So the extension host does it

Because an extension host is Node and can run a program.

1. The board posts `{__aboard: 'clipboard-image', id, dataUrl}` out of the frame.
2. `src/clipboard.ts` writes a temp PNG and runs `xclip` — or `wl-copy`, which is tried **first** on a Wayland session.
3. The answer goes back as `{__aboard: 'clipboard-result', id, ok, error}`.

The board does not know it is talking to VS Code and does not check: it asks whoever
framed it.

## It does not ask blind any more

The page announces `{__aboard: 'host', name: 'vscode', clipboard: true}` on every frame
load, so the board knows before the first copy whether there is anyone to ask.

**That is a diagnostic decision rather than a performance one.** On 2026-08-28 a
clipboard failure survived three rounds of reinstall-and-restart because every one of
"no host", "an older extension", "the host never answered" and "the browser refused it"
arrived as the same six-second silence and the same permissions-policy sentence — which
is *also* what a working host looks like a moment before it succeeds. Announced, each is
now its own message naming its own hop.

Two things the announcement is not:

- **`clipboard: true` promises an ANSWER, not a success.** The tool may be missing; the answer then says so by name.
- **An announcement explains a failure; it does not authorise the attempt.** The board asks any host at all, announced or not, and only skips one that has said `clipboard: false`. Gating the ask on the announcement was a regression that lasted about an hour in the aboard repository: a panel one build older announces nothing and copies perfectly well.

## The bug worth remembering, because it looked like the opposite of itself

**`xclip` takes ownership of the X selection by forking.** The foreground process reads
the image and exits `0` in about a millisecond, and a background process stays alive to
serve the selection — holding the stderr pipe it inherited.

Node's `close` event fires on exit **and** stdio EOF, so it never fired. The five-second
timeout then reported a failure on a copy that had already succeeded, and the human saw
the fallback dialog with the image correctly on their clipboard behind it.

**`exit` is the event that answers the question actually being asked.**

It had a second face: a live child's inherited pipe is an **active handle**, so the old
version kept `node --test` from exiting at all — the fails-before run had to be killed
after ten minutes. In a real extension host that is a leaked descriptor per copy. Our end
of the pipe is destroyed on exit now, and the timeout no longer kills the child, because
on these tools the process that matters is the one that already forked.

`wl-copy` behaves identically.

## The tests never touch the real clipboard

That rule was bought the hard way. The first version called the real `xclip`, so running
`npm test` replaced whatever the developer had copied with this file's fake PNG — eight
bytes of signature and sixty-four of `0x07`. On 2026-08-28 the human pasted it into their
board and reported an image that would not load; it was mine.

`copyImageToClipboard` takes an injectable tool table, and the tests drive stand-ins built
from `node` itself: one that **forks and exits** exactly as xclip does — which is what
proves the `exit`-not-`close` fix, with no X server needed — one that exits non-zero, one
that wedges, and one that does not exist.

**A unit test has no business changing the machine it runs on.**

## When it does not work, the output channel says where it stopped

This hop crosses three processes — the page, the extension host, and a program — and when
it fails the human sees one dialog that cannot say which of the three went quiet. The
**Aboard** output channel logs the request with its size and the outcome with its timing,
so "the request never arrived" and "the tool refused" stop looking the same.

macOS and Windows are refused **by name** rather than guessed at. A missing tool is
reported with the command to install it, and the board still offers the picture and **Add
this picture to the tab**, which needs no permission at all.

## See also

- [How to copy an image out of the panel](../how-to/copy-an-image.md) — the practical version.
- [The board contract](../reference/board-contract.md#messages-across-the-frame-boundary) — the four messages this hop uses.
- [The failure mode is silence](the-failure-mode-is-silence.md) — the round this came out of.
