# How to run it in a development host

`F5` from this repository opens an **Extension Development Host** — a second VS Code
window with the extension loaded from the working tree. Open a project that has a board
running, and the sidebar should populate.

## Rebuild before pressing F5, and reload the dev host after an edit

`.vscode/launch.json` runs `npm: build` as a `preLaunchTask`, so **the first is handled**.

**The second is not**, because the build is one-shot rather than a watcher — a watcher
never "finishes" and VS Code would sit waiting for it. A dev host left open across an edit
is running the previous bundle, silently, which is the same class of mistake as every
defect in [the failure mode is
silence](../explanation/the-failure-mode-is-silence.md).

So after an edit: rebuild, then *Developer: Reload Window* **in the dev host**.

```sh
npm run watch   # if you would rather have the bundle rebuilt for you
```

— you still have to reload the dev host window.

## An installed `.vsix` and F5 are not the same test

This is the reason to have both, and it is not thoroughness for its own sake: defects have
been found only by each.

| | `F5` | installed `.vsix` |
|---|---|---|
| code | the working tree | the packaged file list |
| debugger | attached | none |
| activation | the dev host's | the real ones |
| catches | anything you can breakpoint | a `.vscodeignore` that excludes something load-bearing |

**F5's debugger is itself a hazard.** VS Code 1.134's extension host is Node 24, and with
the debugger attached Node's inspector network instrumentation adds a `data` listener to
every response that reports `dataLength: chunk.byteLength`. A string chunk has none, the
listener throws, and the parser destroys the socket — which is how a dropped SSE stream on
every write turned out to be a defect that **exists only under F5** (`cff655a`; the stream
reads Buffers now).

An installed build runs the way a user's does. [How to install it](install.md) is
`npm run install:dev`, and its last line is the one to read.

## Where to look when it appears to do nothing

The **Aboard** channel in the Output panel. It names the running version at activation and
logs each clipboard request with its outcome and timing, plus dropped streams, ignored
instance files and rejected discovery candidates.

**Expect to find bugs.** This extension's failure mode is silence: no error, no log line,
nothing on any console. If you are running it in a dev host, you are doing the thing that
has found every defect of consequence so far — and
[the verification log](../reference/observed-in-a-real-editor.md) is the list of rows
still open, which is where to start.

## What it can break

Every board request the extension makes is a read or a write the board already permits, so
the worst case is an empty sidebar or a failed action — it cannot corrupt a board that a
browser could not corrupt the same way.

The **Start the Board** button is the one thing that reaches outside that: it runs a
command in a terminal, where you can see it.

## See also

- [How to build and test it](build-and-test.md).
- [How to troubleshoot a quiet sidebar](troubleshoot.md) — including the three warnings in the dev host console that are not ours.
