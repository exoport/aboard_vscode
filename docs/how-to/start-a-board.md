# How to start a board when there is not one

The extension starts nothing on its own — [never assume you should launch a new
server](../explanation/what-this-extension-is.md#never-assume-you-should-launch-a-new-server).
When discovery finds nothing answering, the **Aboard** view shows a welcome view with a
**Start the Board** button instead of an empty tree.

## Press the button

It runs `aboard serve` or `ape aboard serve` in a new terminal, picking between them by
what is usable and, when both are, by whether the folder holds an `_apex/` directory. The
full ladder is in [discovery and starting a
board](../reference/discovery-and-start.md#starting-a-board); the reasoning is [why the
project picks the start command](../explanation/why-the-project-picks-the-start-command.md).

You can see the command it chose, because it runs in a terminal you are looking at.

Afterwards the extension polls `/health` for a few seconds and the tree fills in.

## The two things it can tell you instead

### "No `.aboard/` project was found in this workspace"

There is no board here to start. Run `aboard init` in the folder you want a board for,
then press the button.

The two welcome texts exist so that *"no board is running"* and *"no project here"* are
distinguishable. An empty tree that could mean either is the worst version of this.

### An error naming both commands

Neither `aboard` nor `ape aboard` is usable on this machine. Install one:

```sh
go install github.com/exoport/aboard/cmd/aboard@latest
```

Note that **`ape` being on `PATH` is not enough**: ape only grew the `aboard` mount in
**v0.0.55**. An older ape is on `PATH`, is perfectly real, and answers
`unknown command "aboard"`. The extension asks `ape aboard --version` on the start path
and believes the exit status, so it will not offer a command that cannot work.

## When the button does not appear at all

Both welcome clauses are gated on `!aboard.hasBoard`, and a view with children never shows
a welcome view — so if the extension still believes a dead board is alive, there is
nothing to press.

That was the v0.1.3 fix: a board that dies **ungracefully** (SIGKILL, a crash, an OOM, a
suspended machine, a parent terminal taken out from under it) leaves its instance record
verbatim, so no filesystem event exists to notice it. A dropped event stream now arms a
`/health` re-check after three seconds.

If you are on an older build, or something else has gone wrong, *Developer: Reload Window*
clears it. **Refresh** in the view title re-runs discovery without a reload.

## Starting it yourself

Nothing about the button is privileged. In a terminal at the project root:

```sh
aboard serve        # or: ape aboard serve
```

The extension's file watcher on `**/.aboard/run/instance*.json` fires when the server
writes its record, discovery re-runs, and the tree fills in — a board started **after**
the window was open still appears.

## See also

- [Discovery and starting a board](../reference/discovery-and-start.md) — how a board is found, and why the port is never guessed.
- [How to troubleshoot a quiet sidebar](troubleshoot.md).
