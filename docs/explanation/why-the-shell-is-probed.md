# Why the shell is probed

The panel frames the board at `<base>?chrome=notabs#tab=<id>&r=<n>`. `?chrome=notabs`
tells the board to suppress its own tab strip for that viewer, so the panel shows one
strip rather than two.

**An older board silently ignores it**, because an unknown query parameter is not an
error. That is exactly what the human saw on 2026-08-26: two tab strips stacked, and
nothing anywhere saying why. So the extension probes for the feature and warns, once per
board, naming the board and its version.

## The probe reads the shell, not the manifest

This is the judgement call worth recording, because the manifest is the obvious place to
look and it cannot answer.

**`GET /capabilities` has no field a client can test for this.** It carries `app`,
`schema`, `capsHash`, `types`, `commands`, `rootFlags` and `routes` — none of which
describes the shell's query parameters. And the two fields that look like they might
serve as a proxy do not:

- **`capsHash`** moves whenever any spec moves, so it can say *different* but never *older*.
- **`/health.version`** is `git describe --tags --always --dirty`, which on an untagged tree is a commit hash and does not order either.

So the extension reads `GET /` once per board and looks for
`document.body.dataset.chrome`, which the shell stamps in a classic script at the top of
`<body>`. **That line is the feature.** Testing the feature beats testing a proxy for it:
a proxy can be right about the version and wrong about the build, and a feature test
cannot.

## The cost, and the exit

The cost is one extra GET per board, once, on a response the panel is about to fetch
anyway.

The exit is written down: **if aboard ever declares its shell parameters in the manifest,
move the probe there and delete `shellSupportsChrome`.** A feature test is the right
answer to an absent declaration, not the right answer in general.

## The warning fires once

Not once per write. An earlier version fired it three times when a write was in flight,
which is the sort of thing that teaches a person to dismiss warnings from this extension
without reading them. `test/oldboard.test.ts` covers both the warning and that
in-flight-write case.

It has never been seen in a real host, and is increasingly hard to arrange — it needs an
`aboard` built before 2026-08-26 03:34. That row is open in [observed in a real
editor](../reference/observed-in-a-real-editor.md) and marked optional.

## See also

- [The board contract](../reference/board-contract.md) — the two things the board owed this extension, and what each is for.
- [The failure mode is silence](the-failure-mode-is-silence.md) — the original sighting, among five others from the same two passes.
