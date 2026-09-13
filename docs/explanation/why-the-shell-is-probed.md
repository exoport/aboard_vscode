# Why the shell is probed

The panel frames the board at `<base>?chrome=notabs&theme=<kind>#tab=<id>&r=<n>`.
`?chrome=notabs` tells the board to suppress its own tab strip for that viewer, so the
panel shows one strip rather than two.

**An older board silently ignores it**, because an unknown query parameter is not an
error. That is exactly what the human saw on 2026-08-26: two tab strips stacked, and
nothing anywhere saying why. So the extension checks for the feature and warns, once per
board, naming the board and its version.

## The manifest first, the shell when it is silent

The manifest is the obvious place to look, and **from aboard v0.2.0 it answers**:
`GET /capabilities` carries `embed.params`, the shell's URL parameters and the values each
accepts, declared in aboard's `pkg/aboard/embed.go` and checked against the shell by that
repository's own tests. A `chrome` entry listing `notabs` is the yes. It costs nothing
extra, because the extension already fetches the manifest for its tooltips.

**Every board before v0.2.0 declares nothing about the shell.** Its manifest carries `app`,
`schema`, `capsHash`, `types`, `commands`, `rootFlags` and `routes` — none of which
describes the shell's query parameters. And the two fields that look like they might serve
as a proxy do not:

- **`capsHash`** moves whenever any spec moves, so it can say *different* but never *older*.
- **`/health.version`** is `git describe --tags --always --dirty`, which on an untagged tree is a commit hash and does not order either.

So for those boards the extension reads `GET /` once and looks for
`document.body.dataset.chrome`, which the shell stamps in a classic script at the top of
`<body>`. **That line is the feature.** Testing the feature beats testing a proxy for it:
a proxy can be right about the version and wrong about the build, and a feature test
cannot.

Absent and "no" are kept apart on purpose. A manifest with no `embed` says nothing, so
the shell decides; a manifest that lists its parameters without `notabs` has said no, and
is believed. `declaresChrome` in `src/board.ts` returns the three answers, and
`test/oldboard.test.ts` pins the preference: a declaring board served with an OLD shell
raises no warning, and its shell is never fetched.

## The cost, and the exit

For a v0.2.0 board the cost is nothing. For an older one it is one extra GET, once, on a
response the panel is about to fetch anyway.

The exit used to read: *if aboard ever declares its shell parameters in the manifest, move
the probe there and delete `shellSupportsChrome`.* **The first half has happened; the
second has not, and cannot yet.** Released v0.1.x boards carry no declaration, and a board
that declares nothing is still one this extension frames. The fallback goes when boards
older than v0.2.0 stop being worth supporting, and not before.

## The warning fires once

Not once per write. An earlier version fired it three times when a write was in flight,
which is the sort of thing that teaches a person to dismiss warnings from this extension
without reading them. `test/oldboard.test.ts` covers both the warning and that
in-flight-write case.

It has never been seen in a real host, and is increasingly hard to arrange — it needs an
`aboard` built before 2026-08-26 03:34. That row is open in [observed in a real
editor](../reference/observed-in-a-real-editor.md) and marked optional.

## See also

- [The board contract](../reference/board-contract.md) — what the board owes this extension, and what each piece is for.
- [The failure mode is silence](the-failure-mode-is-silence.md) — the original sighting, among five others from the same two passes.
