# How to install it

The extension is **not published to any marketplace** — see [why not a marketplace
listing](../explanation/why-not-a-marketplace-listing.md) — so there are two routes: a
`.vsix` from a GitHub Release, or a build from a clone.

## From a release

Download `aboard-vscode-<version>.vsix` from the [GitHub
Release](https://github.com/exoport/aboard_vscode/releases), then:

```sh
code --install-extension aboard-vscode-<version>.vsix --force
```

Then **reload the window** — *Developer: Reload Window*. A new version is a new folder
under `~/.vscode/extensions/`; the old one stays on disk until VS Code cleans it up,
listed in `.obsolete`, and the extension host only picks up the new one on a reload.

## From a clone

```sh
npm ci
npm run install:dev
```

`install:dev` packages, force-installs, and **prints the version that landed**. It is the
three steps below in one:

```sh
npm run package                                      # → aboard-vscode-<version>.vsix
                                                     #   (removes the previous build first, so the
                                                     #    glob below always matches exactly one file)
code --install-extension aboard-vscode-*.vsix --force
code --list-extensions --show-versions | grep aboard-vscode
```

`package` runs `vsce package`, which runs `vscode:prepublish` → `npm run build` first, so
the bundle in the archive is always built from the tree it was packaged from.

## Read the last line

**An install that does not land looks exactly like a bug in whatever you were testing.**
On 2026-08-28 that cost four rounds of "reinstalled, restarted, still broken" against an
extension from three hours earlier — while the board, the bridge and `xclip` were all
correct.

Two things made it invisible: every dev build carried the same version, so the extensions
view could not tell them apart; and `npm run package` deletes the previous `.vsix`, so a
shell-history command naming the old filename fails on a missing file and scrolls away.

There are three independent answers to "which build is running" now, because the question
kept getting the wrong one:

1. the version moves per dev build,
2. `install:dev` prints what is actually installed, as its last line,
3. the extension writes `aboard-vscode <version> activated` to the **Aboard** output channel at activation.

## Check that it found your board

Open a folder that is at or under an aboard project root, with a board running. The
**Aboard** view in the activity bar should list the board's tabs.

If it is empty, run `aboard status` in a terminal in that folder. If that cannot find a
board either, the extension is right — see [how to start a board](start-a-board.md). If
it can, see [how to troubleshoot a quiet sidebar](troubleshoot.md).

## What it needs

- **VS Code 1.90 or later**, and Node 20+ to build it.
- **A running board.** The extension starts nothing on its own and shows a welcome view instead.
- **`xclip` or `wl-clipboard`**, only for copying images out of the panel — see [how to copy an image](copy-an-image.md).

## See also

- [How to build and test it](build-and-test.md).
- [How to run it in a development host](run-in-a-dev-host.md) — and why an installed build is a different test.
