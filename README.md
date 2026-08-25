# aboard-vscode

A VS Code extension that gives the [`aboard`](https://github.com/exoport/aboard)
board a native home inside the editor: a `TreeView` of a project's tabs in the
sidebar, with the board itself rendered in a webview panel. It is a viewer only — no
rendering, no state, and no schema knowledge live here, and none should ever be
added; everything it shows comes from the running `aboard` (or `ape aboard`) server
over plain HTTP, the same way any other client would read it.

This repository is empty at the time of writing. **Start with
[`docs/handoff.md`](docs/handoff.md)** — it carries the full design, the HTTP
contract this extension is built against, the milestone plan, and the two or three
small changes the `aboard` side still owes it before the sidebar highlight can stay
in sync with the panel.
