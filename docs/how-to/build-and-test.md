# How to build and test it

```sh
npm ci
npm run build     # → dist/extension.js
npm test          # node --test, no framework
npx tsc --noEmit  # the same typecheck `npm run build` runs first
```

**No runtime dependencies.** Dev only: `typescript`, `esbuild`, `@vscode/vsce`,
`@types/vscode`, `@types/node`.

`npm test` should end with `# fail 0`. **The counter to read is the failure one, not the
total** — a test count written into a document is a number that lies eventually, which is
why none appears here.

## What the integration suite needs

`test/integration.test.ts` spawns a **real `aboard` binary** on a throwaway project
(`mkdtemp`, so its derived port cannot collide with a board anybody is using, and it is
killed by pid afterwards). It looks for a binary in this order:

1. **`$ABOARD_BIN`, if you set one — alone.** There is no fallback from it, because falling back from a path somebody named on purpose would test a different binary and say nothing about it.
2. `aboard` on `PATH`.
3. A sibling checkout.

With none of those it **skips loudly**. A clone of this repository does not carry the
other one, and a suite that cannot pass without a second checkout is a suite people stop
running.

```sh
go install github.com/exoport/aboard/cmd/aboard@latest
```

is enough to have it run, and is what CI does.

Some of what it covers is only meaningful against the real thing: the 21 token names are
asked of the binary and compared, a REAL `aboard wait` is parked to prove the
`aboard.waiting` key flips both ways, and a board is **SIGKILLed** to prove the extension
notices an ungraceful death. That last one uses SIGKILL deliberately — SIGTERM would make
the board delete its own instance record and silently exercise the path that already
worked — and it asserts the record survives the kill *before* asserting anything else, so
the test cannot quietly stop testing the thing it is named for.

## What the tests deliberately do not do

- **Touch the real clipboard.** `copyImageToClipboard` takes an injectable tool table and the tests drive stand-ins built from `node` itself. The first version called the real `xclip`, and running `npm test` replaced whatever the developer had copied with a fake PNG. See [why the host copies images](../explanation/why-the-host-copies-images.md).
- **Emulate VS Code.** `test/vscode-stub.ts` models only what the extension depends on, and `panel.ts` stays uncovered rather than growing a fake webview. See [repository layout](../reference/layout.md#the-two-files-in-test-that-are-not-tests).

## What no test can tell you

Every defect of consequence in this extension was found by a human looking at a screen,
and not one was visible to `node --test`. A green suite is necessary and it is not
evidence that the thing on screen says anything. See [the failure mode is
silence](../explanation/the-failure-mode-is-silence.md), and
[run it](run-in-a-dev-host.md).

## Packaging

```sh
npm run package   # → aboard-vscode-<version>.vsix
```

The result is eleven files and well under 100 KB. Check that file list in vsce's own
output when you package — or run `npx vsce ls`, which prints it without building
anything. `.vscodeignore` is what keeps `src/`, `test/`, `docs/`, `out/`, `node_modules/`
and every `.map` out of the archive, and **a `.vscodeignore` that stops matching is
silent**.

## See also

- [How to install it](install.md).
- [Repository layout](../reference/layout.md) — which modules are pure, and why that is where the tests live.
