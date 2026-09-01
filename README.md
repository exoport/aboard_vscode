# aboard-vscode

A VS Code extension that gives the [`aboard`](https://github.com/exoport/aboard) board a
native home inside the editor: a `TreeView` of a project's tabs in the sidebar, with the
board itself rendered in a webview panel beside your code.

It is a **viewer**. No rendering, no state and no schema knowledge live here, and none
should ever be added; everything it shows comes from the running `aboard` (or
`ape aboard`) server over plain HTTP, the same way any other client reads it. When
`aboard` grows a sixteenth renderer this extension needs zero changes — if it ever does,
something here is wrong.

## What it puts on screen

- **A tree of the board's tabs**, in the document's own order — the order is the human's, so it is never re-sorted. A periwinkle dot marks a tab an agent changed, red a pending removal request, and the view's badge counts them.
- **The board itself in a panel**, framed with `?chrome=notabs` so you see one tab strip rather than two, and switched from the sidebar with no page reload.
- **The writes only a human is allowed to make** — dismiss a change marker, approve or deny a removal request, rename a tab, set its note, copy its id, its reference or a deep link.
- **A nudge button** that says whether an agent is actually parked on `aboard wait`, and releases it when one is.
- **A New Tab button** that asks the *board* to open its own sheet, so nothing about tab types passes through this extension.
- **Your editor's theme**, mapped onto the board's own tokens for your viewer only — with the board's colour vocabulary and its contrast floor both kept.
- **More than one board at once** — a multi-root workspace, or one project serving a named board beside its default.

## Requirements

- **VS Code 1.90 or later.**
- **A running board.** The extension starts nothing on its own; when it finds a project with nothing answering it offers a **Start the Board** button instead.
- **Node 20 or later**, to build it.
- **`xclip` or `wl-clipboard`**, only for copying an image out of the panel — a webview cannot reach the system clipboard, so the extension host runs the tool instead.

## Install

**It is not published to any marketplace.** That is a decision rather than an omission: to
a stranger it installs, finds nothing, and does nothing.

### From a release

Download `aboard-vscode-<version>.vsix` from the
[Releases page](https://github.com/exoport/aboard_vscode/releases), then:

```sh
code --install-extension aboard-vscode-<version>.vsix --force
```

### From a clone

```sh
npm ci
npm run install:dev     # package, force-install, and PRINT the installed version
```

**Either way, reload the window** — *Developer: Reload Window* — and **read the version
that landed**. An install that does not land looks exactly like a bug in whatever you were
testing; there are three independent ways to check which build is running, and the reason
there are three is [written down](docs/how-to/install.md#read-the-last-line).

## Build

```sh
npm ci
npm run build     # → dist/extension.js
npm test          # node --test, no framework
npx tsc --noEmit  # the same typecheck `npm run build` runs first
```

No runtime dependencies. Dev only: `typescript`, `esbuild`, `@vscode/vsce`,
`@types/vscode`, `@types/node`. The integration suite spawns a **real `aboard`** and
drives `activate()` against it; it skips loudly when it cannot find one, and
`go install github.com/exoport/aboard/cmd/aboard@latest` is enough to have it run.

## Documentation

**[docs/index.md](docs/index.md)** — the full documentation, in
[Diátaxis](https://diataxis.fr/) quadrants.

- **[Tutorials](docs/tutorials/index.md)** — [read your board in the sidebar](docs/tutorials/read-your-board-in-the-sidebar.md), from a clone to answering an agent's change.
- **[How-to guides](docs/how-to/index.md)** — [install](docs/how-to/install.md), [build and test](docs/how-to/build-and-test.md), [run in a dev host](docs/how-to/run-in-a-dev-host.md), [start a board](docs/how-to/start-a-board.md), [copy an image](docs/how-to/copy-an-image.md), [match your theme](docs/how-to/match-the-editor-theme.md), [troubleshoot](docs/how-to/troubleshoot.md), [publish](docs/how-to/publish.md).
- **[Reference](docs/reference/index.md)** — [what it does](docs/reference/what-it-does.md), [commands and settings](docs/reference/commands-and-settings.md), [the board contract](docs/reference/board-contract.md), [discovery and starting a board](docs/reference/discovery-and-start.md), [theme mapping](docs/reference/theme.md), [repository layout](docs/reference/layout.md), [what has been observed in a real editor](docs/reference/observed-in-a-real-editor.md), [edge cases](docs/reference/edge-cases.md).
- **[Explanation](docs/explanation/index.md)** — [what this extension is](docs/explanation/what-this-extension-is.md), [the failure mode is silence](docs/explanation/the-failure-mode-is-silence.md), and the six other decisions with a plausible opposite.

The whole coupling with the board is a **contract, not a shared file**: it is
`docs/reference/http-api.md` in the aboard repository, reduced to the parts a viewer uses
in [the board contract](docs/reference/board-contract.md).

If you are reading this inside the extensions view, `docs/` is not in the `.vsix` — the
pages are in [the repository](https://github.com/exoport/aboard_vscode/blob/main/docs/index.md).

## Status

**Released as v0.1.3 on 2026-08-29. Installed from the `.vsix` and in daily use.**
[CHANGELOG.md](CHANGELOG.md) has what is in each release.

Fourteen defects have been found here by a human looking at the screen, and **not one was
visible to `node --test`** — every one had the same shape: the mechanism worked and the
thing on screen said nothing. So the record of what has actually been *watched* in a real
editor is a document with dates, including the rows still open:
[observed in a real editor](docs/reference/observed-in-a-real-editor.md). Why that is the
failure mode, and what follows from it, is [the failure mode is
silence](docs/explanation/the-failure-mode-is-silence.md).

## Licence

Apache-2.0. See [LICENSE](LICENSE).
