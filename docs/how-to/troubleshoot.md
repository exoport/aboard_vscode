# How to troubleshoot a quiet sidebar

**This extension's failure mode is silence.** No error, no log line, nothing on any
console — the mechanism works and the thing on screen says nothing. So the order below
starts with the two places that *do* say something.

## 1. Read the Aboard output channel

*View → Output → **Aboard***.

| line | what it answers |
|---|---|
| `aboard-vscode <version> activated` | which build is actually running — the extensions view has been wrong about this |
| a rejected discovery candidate, with its reason | why a board you can see running is not in the tree |
| `event stream … dropped` | the live refresh is not live; the tree needs Refresh until it reconnects |
| a clipboard request, with its size, outcome and timing | which of the three processes in that hop went quiet |

Every *action* failure is a notification carrying the server's own sentence, not a log
line. Background noise goes here instead of interrupting.

## 2. Ask the board directly

```sh
aboard status
```

in a terminal in the same folder. If that cannot find a board either, the extension is
right — see [how to start a board](start-a-board.md).

## The tree is empty

| what you see | likely cause |
|---|---|
| "No `.aboard/` project was found in this workspace" | the folder you opened is not at or under a project root. Discovery walks **up**, not down. |
| "This project has an `.aboard/` directory, but no board is answering" | nothing is running, or the record is stale — [start one](start-a-board.md) |
| a board's row with a problem as its description | the board answered `/health` but `/aboard.json` did not; the reason is on the row |
| `schema mismatch` on a board's row | the document's `version` and `/capabilities`.`schema` disagree — the extension is reading a board it may not fully understand |
| tabs that are gone from the board | a dead board that has not been noticed yet; **Refresh**, or reload the window |

A board's port is **derived from its project path and read from its instance record**,
never guessed, and a candidate is kept only when `/health.project` matches the root it was
found under. A stale record from a dead server and another project's board on a guessed
port are both dropped — with the reason in the output channel.

## The Start button is missing

Both welcome clauses are gated on `!aboard.hasBoard`, and a view with children never shows
a welcome view — so if the extension still believes a dead board is alive, there is
nothing to press. [How to start a board](start-a-board.md#when-the-button-does-not-appear-at-all)
has the detail; *Developer: Reload Window* clears it.

## The panel shows two tab strips

The board is served by a binary that predates `?chrome=notabs`, built before 2026-08-26
03:34. You should also have seen exactly one warning naming the board and its version.
Update `aboard`. See [why the shell is probed](../explanation/why-the-shell-is-probed.md).

## Dots do not appear until I press Refresh

The event stream is dropping. Check the output channel for `event stream … dropped`.

**Under F5 specifically**, this was Node 24's inspector instrumentation throwing on string
chunks and destroying the socket — fixed in `cff655a`, and worth knowing if you are
running an old build in a dev host.

## Three warnings in the dev host that are not ours

These appeared on the first real run and cost time before they were ruled out. **None
comes from this extension**, and the next person should not have to prove that again.

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

**Why they cannot be ours:** `dist/extension.js` requires exactly four modules —
`node:fs`, `node:http`, `node:path` and `vscode` — and there are **zero runtime
dependencies**, so there is no transitive package to blame either. `src/panel.ts` does use
`new URL(...)`, which is the WHATWG global that *replaced* `url.parse`, not the deprecated
function.

All extensions share one extension-host Node process, so **a deprecation warning names no
extension at all**. To find out whose a warning really is, relaunch the host with
`--trace-deprecation` and read the stack.

One correction to the brief that raised these: the Claude Code extension is not the
source. None of the JavaScript the host actually loads for it mentions either API —

```sh
grep -rl "punycode\|url\.parse(" --include="*.js" ~/.vscode/extensions/anthropic.claude-code-*/   # exits 1
```

— and dropping `--include` only turns up its bundled *native* binaries, which run in
processes of their own and cannot raise a `DeprecationWarning` in this one. Guessing at an
owner from the warning text is the mistake; the process boundary is why it cannot work.

## See also

- [How to copy an image out of the panel](copy-an-image.md) — that hop has its own failure table.
- [Edge cases and their status](../reference/edge-cases.md) — including five things once wrongly called handled, all of which looked exactly like a quiet sidebar.
