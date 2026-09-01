# How to copy an image out of the panel

A `markup` tab can copy a cropped region, or the current view, to the system clipboard. In
a browser that needs nothing arranged. **In the panel it needs a tool installed on your
machine**, because a webview cannot reach the clipboard at all — Chromium blocks it under
a permissions policy VS Code exposes no way to lift, so the extension host runs a program
instead. The whole story is [why the host copies
images](../explanation/why-the-host-copies-images.md).

## Install a clipboard tool

```sh
sudo apt install xclip          # X11
sudo apt install wl-clipboard   # Wayland — provides wl-copy
```

`wl-copy` is tried **first** on a Wayland session, `xclip` otherwise.

**Linux only.** macOS and Windows are refused by name rather than guessed at.

## Then

Press **Copy region** (or the equivalent) on a `markup` tab in the panel, and paste
somewhere else.

## When it does not work

With neither tool installed, the board says so **by name** and offers the picture in a
dialog with a button that adds it to the tab as a new image — the one route that asks
permission from nobody.

For anything else, **read the Aboard output channel**. The hop crosses three processes —
the page, the extension host, and a program — and one dialog cannot say which of the three
went quiet. The channel logs the request with its size and the outcome with its timing, so
"the request never arrived" and "the tool refused" stop looking the same.

| what you see | what it means |
|---|---|
| no request logged at all | the message never left the page — check that the panel is the extension's, not a Simple Browser tab |
| a request logged, then a failure naming the tool | the tool is missing or refused; install it, or read its message |
| a request logged, then nothing | the tool wedged; the extension gives it five seconds and then answers |
| the dialog says the host never answered | you are on a build that predates the host announcement, or the extension is not the one you think it is — check the `activated` line for its version |

That last row is not hypothetical: a clipboard failure once survived three rounds of
reinstall-and-restart because "no host", "an older extension", "the host never answered"
and "the browser refused it" all arrived as the same six-second silence. The panel now
announces `{__aboard: 'host', name, clipboard}` on every frame load precisely so that each
gets its own sentence.

## What you cannot do, and why the menu is not lying to you

**Right-click → Copy image inside the panel does not exist.** The host owns the context
menu in a webview, and VS Code's has no *Copy image*. Use the board's own copy control.

## See also

- [Why the host copies images](../explanation/why-the-host-copies-images.md) — including the `xclip` fork bug, which reported a failure on a copy that had already succeeded.
- [The board contract](../reference/board-contract.md#messages-across-the-frame-boundary) — the four messages this uses.
