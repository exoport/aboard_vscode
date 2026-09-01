# Why the project picks the start command

When the sidebar finds an `.aboard/` and nothing answering, it offers **Start the Board**.
Two commands can serve: `aboard serve` and `ape aboard serve`. Both drive the same
`.aboard/` — which is what makes the choice a *preference* rather than a constraint, and
also what makes it easy to get wrong without anybody noticing.

## The rule

If the folder holds an **`_apex/` directory**, the board is started with
`ape aboard serve`. Otherwise the dedicated binary wins.

An APEX project's sessions already run through `ape`, so its board starting the same way
keeps one toolchain in the terminal the human is looking at. Without `_apex/` there is no
reason to reach through ape at all.

## This reverses an earlier call

v0.1.1 said "`aboard` always wins when both are present." That call was made **before
there was any signal to tell the two kinds of project apart**, and with no signal, a
constant is the honest answer. `_apex/` is that signal, and once a signal exists a
constant stops being honest.

Recording the reversal matters more than the rule does. Somebody reading only the current
code would find a preference for `ape` in an APEX project and reasonably propose the
opposite, on the grounds that the dedicated binary is more direct. It is — and it is also
a second toolchain in a terminal where everything else says `ape`.

## One directory, no walk-up

The `_apex/` check does not walk up the tree the way board discovery does. The board is
started *in* this directory, and **a rule the human cannot check by looking at the folder
they opened surprises them.** A walk-up would mean a project three levels below an APEX
root silently starting through ape, with nothing visible in the workspace to explain it.

Discovery walks up because a board that already exists must be *found* wherever it is.
Starting one is a different question, asked about the folder in front of you.

## It breaks a tie; it never conjures a binary

An APEX project on a machine whose `ape` predates the aboard mount is offered
`aboard serve`, because that is what is there. The rule is a preference among usable
commands, applied after both have been shown to work.

## Which is why "on `PATH`" was the wrong question

`ape` being on `PATH` says nothing. **ape only grew the mount in v0.0.55**, and every ape
before that is on `PATH`, is perfectly real, and has no `aboard` subcommand. Offering it
anyway produced `unknown command "aboard"` in the terminal and then *"no board answered
within 10s"* from the poll — the symptom, and not one word of the cause. It was found by
checking the extension against a real `ape aboard` board rather than against the code, on
a machine whose `ape` was v0.0.52.

So the subcommand is asked — `ape aboard --version` — once, on the start path only, and
**exit status alone is the verdict**. The version string belongs to aboard, and parsing it
would couple this extension to a format neither repository promises.

Two properties of that probe are deliberate:

- **Once, and only when starting.** It is a process spawn; a board that is already running never pays for it.
- **No fallback from a named path.** `$ABOARD_BIN`-style "try this, then try that" reasoning does not apply here, but the same instinct does: a probe that quietly answers about a different binary than the one it was asked about is worse than no probe.

## When neither works

An **error naming both commands**, never a silent nothing. An empty tree with no
explanation is the worst version of this, and the human is one install away.

## See also

- [Discovery and starting a board](../reference/discovery-and-start.md) — the ladder as a list, in order.
- [How to start a board when there is not one](../how-to/start-a-board.md).
- `docs/explanation/why-two-identities.md` in the aboard repository — why `aboard` and `ape-aboard` share one `.aboard/` in the first place.
