# aboard-vscode documentation

These docs follow the [Diátaxis](https://diataxis.fr/) framework, which splits
documentation into four quadrants by user need. Pick the quadrant that matches what you
are trying to do:

| If you want to…                                          | Read…                            |
| -------------------------------------------------------- | -------------------------------- |
| **Learn** the extension by following a walkthrough         | [Tutorials](tutorials/index.md)     |
| **Solve** a specific problem                               | [How-to guides](how-to/index.md)    |
| **Look up** a command, a route, a token or a setting       | [Reference](reference/index.md)     |
| **Understand** why the extension is the way it is          | [Explanation](explanation/index.md) |

Tutorials and how-to guides are practical; reference and explanation are theoretical.
Tutorials and explanation are study-oriented; how-to guides and reference are
work-oriented. See the [Diátaxis compass](https://diataxis.fr/compass/) if you are
unsure where a page belongs.

The board's own documentation lives in the [aboard
repository](https://github.com/exoport/aboard) under `docs/`. This set covers only the
VS Code extension; where the two meet, the meeting point is a contract and it is written
down in [the board contract](reference/board-contract.md).

## Status

**Released as v0.1.3 on 2026-08-29, installed from the `.vsix` and in daily use.** Not
published to any marketplace — see [why not a marketplace
listing](explanation/why-not-a-marketplace-listing.md) — so it is installed from the
`.vsix` on a GitHub Release, or from a clone. [How to install
it](how-to/install.md) is the whole procedure.

What a human has actually watched happen in a real editor, with dates, is
[observed in a real editor](reference/observed-in-a-real-editor.md). That page is the
honest half of every status claim in this documentation: the rows that are still open
are listed as openly as the ones that passed.

## Index

### Tutorials — _learning by doing_

- [Read your board in the sidebar](tutorials/read-your-board-in-the-sidebar.md) — clone → build → install the `.vsix` → open a project with a board → the tree, the panel, a dot, and a dismissal.

### How-to guides — _recipes for specific problems_

- [How to install it](how-to/install.md) — from a release `.vsix` or from a clone, and how to tell that the install actually landed
- [How to build and test it](how-to/build-and-test.md) — `npm ci`, `npm test`, and what the integration suite needs from a real `aboard`
- [How to run it in a development host](how-to/run-in-a-dev-host.md) — `F5`, the rebuild-and-reload rule, and why an installed `.vsix` is a different test
- [How to start a board when there is not one](how-to/start-a-board.md) — the welcome view's button, and what to do when it cannot find a command to run
- [How to copy an image out of the panel](how-to/copy-an-image.md) — install `xclip` or `wl-clipboard`, and read the Aboard output channel when it does not work
- [How to make the board match your editor theme](how-to/match-the-editor-theme.md) — the `aboard.theme` setting, and what full fidelity is not
- [How to troubleshoot a quiet sidebar](how-to/troubleshoot.md) — the output channel first, then the three warnings that are somebody else's
- [How to publish a release](how-to/publish.md) — the `.vsix`, the GitHub Release, and the Open VSX rung above it

### Reference — _technical descriptions_

- [What it does](reference/what-it-does.md) — the tree, the panel, the buttons and the actions, surface by surface
- [Commands and settings](reference/commands-and-settings.md) — every contributed command, menu, context key and setting, as a table
- [The board contract](reference/board-contract.md) — every call this extension makes, and the four facts the design rests on
- [Discovery and starting a board](reference/discovery-and-start.md) — the walk up, the `/health` check, and the ladder that picks a start command
- [Theme mapping](reference/theme.md) — the three hops, the 21 tokens, the derived depth ramp and the contrast guard
- [Repository layout](reference/layout.md) — what each file is for, and where the `vscode` import stops
- [Observed in a real editor](reference/observed-in-a-real-editor.md) — the verification log: what was watched, when, and what is still open
- [Edge cases and their status](reference/edge-cases.md) — the list that must be true before any public listing

### Explanation — _the why and the what_

- [What this extension is](explanation/what-this-extension-is.md) — a viewer, three hard rules, and why it is a separate repository
- [The failure mode is silence](explanation/the-failure-mode-is-silence.md) — every defect of consequence, how each was found, and why no test saw any of them
- [Why a native TreeView](explanation/why-a-native-treeview.md) — what a webview sidebar would have cost, and the one price paid instead
- [Why the shell is probed](explanation/why-the-shell-is-probed.md) — `?chrome=notabs`, and why `/capabilities` cannot answer for it
- [Why the project picks the start command](explanation/why-the-project-picks-the-start-command.md) — `_apex/` as the tiebreak, and the earlier call it reverses
- [Why the host copies images](explanation/why-the-host-copies-images.md) — a webview cannot reach the clipboard and never will
- [Why the theme splits neutrals from voices](explanation/why-the-theme-splits-neutrals-from-voices.md) — depth is an order, the voices are a set, and a host theme guarantees neither
- [Duplication and drift](explanation/duplication-and-drift.md) — the two copies of things aboard owns, and the tests that break when they go stale
- [Why not a marketplace listing](explanation/why-not-a-marketplace-listing.md) — an extension that installs, finds nothing, and does nothing

## Contributing to these docs

Place a new page in the quadrant that matches its **primary user need**, not its topic.
A page about the theme could live in any of the four depending on whether it is
teaching, recipe-giving, listing facts, or explaining a decision. If a page mixes two
purposes, split it.

Two conventions carried over from the aboard repository, and worth keeping here:

- **Every page is reachable from this index.** Link a new page from its quadrant's index **and** from the index above.
- **Do not link to source files from a doc page** — name them in backticks instead (`src/theme.ts`). A link into the source tree goes stale silently, and no link checker can tell a path that moved from a path that never existed.
