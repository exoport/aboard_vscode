# CHANGELOG

## v0.1.2 — 2026-08-28

Both changes are to one thing: which command the **Start a board** button runs.
Nothing else moved, and a board already running is unaffected either way.

- **fix: `ape` on `PATH` is no longer taken to mean `ape aboard` works.** ape only
  grew the mount in v0.0.55, and every ape before that is on `PATH`, is perfectly
  real, and has no `aboard` subcommand. The button offered it anyway, the terminal
  answered `unknown command "aboard"`, and the poll then reported *"no board
  answered within 10s"* — the symptom, with not one word of the cause. The
  subcommand is now asked (`ape aboard --version`), once, on the start path only,
  and exit status alone is the verdict: the version string belongs to aboard, and
  parsing it would couple this to a format neither repo promises. Found by
  checking the extension against a real `ape aboard` board rather than against
  the code, on a machine whose `ape` was v0.0.52.
- **feat: when both hosts are usable, the PROJECT decides.** A folder holding an
  `_apex/` directory is an APEX project, whose sessions already run through `ape`,
  so its board starts with `ape aboard serve` and the human keeps one toolchain in
  the terminal they are looking at. Without `_apex/`, the dedicated binary wins.
  Both hosts drive the same `.aboard/`, which is what makes this a preference
  rather than a constraint.
  - This **reverses** v0.1.1's "`aboard` always wins when both are present". That
    call was made before there was any signal to tell the two kinds of project
    apart; `_apex/` is that signal.
  - One directory, **no walk-up**: the board is started *in* this directory, and a
    rule the human cannot check by looking at the folder they opened surprises
    them.
  - The rule breaks a tie; it never conjures a binary. An APEX project on a machine
    whose `ape` predates the mount is offered `aboard serve`, because that is what
    is there.

The decision moved after the workspace-folder pick, since it now depends on which
project is answering. `README.md`, "Starting a board when there is not one",
carries the whole table.

## v0.1.1 — 2026-08-28

The first release. A viewer for a running [aboard](https://github.com/exoport/aboard)
board: a tree of the board's tabs in the sidebar, the board itself in a panel beside your
code, and the handful of writes only a human is allowed to make.

It is **not published to a marketplace**, which is a decision rather than an omission — to
anyone without an aboard project in their workspace the extension installs, finds nothing
and does nothing. Download the `.vsix` from the release and
`code --install-extension aboard-vscode-0.1.1.vsix --force`, then reload the window.

Why 0.1.1 rather than 0.1.0: every dev build carried 0.1.0, so "I reinstalled it" and "the
old one is still loaded" left identical evidence — which is half of why one clipboard
failure survived three rounds of reinstalling. The version moves per build now, and going
backwards would have put a release behind the build already installed.

### What it does

- **A tree of the board's tabs**, in the document's own order — the order is the human's, so it is never re-sorted. The label is the tab name, the description its id, the tooltip the type's label read from `/capabilities` rather than hardcoded, followed by the tab's note.
- **A dot per tab that needs attention** — periwinkle for a change an agent made, red for a pending removal request, removal winning when a tab has both.
- **The board in a webview panel**, framed with `?chrome=notabs` so the panel does not show two tab strips, with VS Code's port mapping so it works over Remote SSH.
- **More than one board at once** — a multi-root workspace, or one project serving a named board beside its default.
- **The human-only writes**: dismiss a change marker, approve or deny a removal request, rename a tab, set its note, copy a reference or a deep link.
- **A New Tab button**, because `?chrome=notabs` hides the board's own `+`. It asks the BOARD to open its own sheet; nothing about tab types passes through this extension, which is what keeps the board's schema out of it.
- **A nudge button** that releases every session parked on `aboard wait`. It was a bell until 2026-08-27, and a bell reads as notifications *about* the board — the opposite of poking an agent.
- **The editor's theme**, mapped onto the board's own tokens and sent into the frame. The four depth tokens are an ORDER and the eleven voices are a SET that must stay mutually distinguishable; a host theme guarantees neither, so this sends the ten neutrals and keeps the board's voices. Contrast is checked, and a mapping that fails is dropped rather than applied.
- **The clipboard**, which a webview cannot reach at all: Chromium blocks it under a permissions policy VS Code exposes no way to lift. The extension runs `xclip` (or `wl-copy`) on the host instead. With neither installed the board says so by name and offers the picture in a dialog.

### Known limits

- Not published to any marketplace; install from the `.vsix`.
- The reconnect backoff against a board that will not come back, the old-binary `?chrome=` warning, and Remote SSH / Codespaces have not been watched in a real editor — everything else in `README.md`'s checklist has.
- `xclip` or `wl-clipboard` must be installed for image copying to work.
