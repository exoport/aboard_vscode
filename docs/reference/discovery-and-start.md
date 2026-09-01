# Discovery and starting a board

## Finding a board

Discovery walks **up** from each workspace folder looking for
`.aboard/run/instance.json` — and `instance.<name>.json` for a named board on the same
project — mirroring aboard's own root-discovery loop rather than checking only the
folder's immediate root. A workspace opened on a subdirectory must still find its board.

Each candidate is then confirmed with `GET /health`, and kept **only** where
`health.project` equals the root it was found under. That rules out both realistic
failures:

- a stale instance file from a server that died, and
- another project's board answering on a port somebody guessed.

`app` must also be `aboard` or `ape-aboard`, which is what rejects a port occupied by
something else; a non-JSON answer is refused by the same path. A candidate that is
dropped is dropped **with its reason written to the Aboard output channel** — never
silently.

**Never assume a port.** It is derived from the discovered root's path, by aboard's own
formula, and read out of the record rather than computed here.

Two folders under one project root count as **one** board. A project serving a named
board beside its default counts as two, and the tree labels them by folder and by
`--name`.

### Staying current

| signal | what it does |
|---|---|
| `**/.aboard/run/instance*.json` file watcher | re-runs discovery — this is how a board started *after* the window was open shows up, and how a board that shut down cleanly disappears |
| `GET /events` (SSE) | live refresh of the tree and the waiter count |
| a dropped event stream | arms a re-check of `/health` after **3 seconds**, throttled |
| reconnect backoff | 1s, doubling to a ceiling of 30s |

The re-check on a dropped stream is a **throttle, not a debounce**, and the distinction
is the correctness of it: a dead board drops its stream, the client retries, the retry
drops too — the signal repeats indefinitely, and a debounce pushes its deadline out on
every one and can starve forever. An already-pending re-check is therefore left alone.

It exists because only *ungraceful* deaths were ever the problem. A board that shuts down
properly deletes its own `instance.json`, the watcher fires, and discovery re-runs. A
board that is SIGKILLed, crashes, is OOM-killed, has its machine suspended or its parent
terminal taken out from under it leaves the record verbatim — so no filesystem event
exists, and the stream drop is the only signal left.

**Deleting the stale record was rejected.** This is a viewer; removing another tool's
runtime file is invasive, and a transient failure would destroy what `aboard status`
reads to say *"stale record: … is not answering"*.

## Starting a board

When discovery finds **nothing running**, the welcome view offers to start one — and it
picks the command from what is actually usable rather than guessing:

1. **`aboard` on `PATH`** → `aboard serve` in a new terminal. Plain; there is no force-restart flag to reach for, and `aboard serve` refuses to start beside this project's own board on its own.
2. **`ape aboard` available** → `ape aboard serve`. Available, not merely on `PATH`: see rule 5.
3. **Neither** → an **error naming both commands**, never a silent nothing. An empty tree with no explanation is the worst version of this, and the human is one install away.
4. **Both usable → the PROJECT decides.** If the folder holds an `_apex/` directory it is an APEX project, whose sessions already run through `ape`, so its board is started with `ape aboard serve` and the human keeps one toolchain in the terminal they are looking at. Without `_apex/` there is no reason to reach through ape, so the dedicated binary wins. Both hosts drive the same `.aboard/`, which is what makes this a preference rather than a constraint. One directory, **no walk-up** — see [why the project picks the start command](../explanation/why-the-project-picks-the-start-command.md).
5. **`ape` on `PATH` is not the question — `ape aboard --version` is.** ape only grew the mount in **v0.0.55**, and every ape before that is on `PATH`, is perfectly real, and has no `aboard` subcommand. The subcommand is asked once, on the start path only, and **exit status alone is the verdict**: the version string belongs to aboard, and parsing it would couple this to a format neither repository promises.

The `_apex/` rule breaks a tie; **it never conjures a binary.** An APEX project on a
machine whose `ape` predates the mount is offered `aboard serve`, because that is what is
there.

After launching either, `/health` is polled for a few seconds rather than assumed
successful.

The decision is made after the workspace-folder pick, since it depends on which project
is answering. Change this table and `src/launch.ts` together, or the comment and the code
drift.

## See also

- [How to start a board when there is not one](../how-to/start-a-board.md) — the same thing from the reader's side, including what to do when it declines.
- [The board contract](board-contract.md) — what `/health` carries and what is compared against what.
- [Edge cases and their status](edge-cases.md) — the discovery failures that have been handled, and the ones once wrongly called handled.
