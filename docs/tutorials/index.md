# Tutorials

Tutorials are **lessons** — they walk a beginner through a complete, working example to
a known good outcome, without asking them to choose between paths. They are not the
place to explain why something works ([Explanation](../explanation/index.md)) and not a
lookup table ([Reference](../reference/index.md)).

A good tutorial here takes a reader from "I have a clone and an aboard project" to "the
board is in my sidebar, I can see which tabs an agent touched, and I answered one of
them."

## Available tutorials

- [Read your board in the sidebar](read-your-board-in-the-sidebar.md) — build the extension, install the `.vsix`, open a project with a board running, and work the tree: open the panel, watch a dot arrive, dismiss it.

## Planned tutorials

- **Answer a removal request.** An agent asks for a tab to be removed, the row goes red, and you approve or deny it from the sidebar — the clearest example of a write the server refuses from anyone but a human.
- **Release a parked session.** An agent blocks on `aboard wait`, the view-title button lights, you press it, and the session comes back. End state: an understanding of which direction the nudge button points.

## Writing a tutorial

- One linear path. No "if you want X, do Y instead" branches — the branches belong in [How-to guides](../how-to/index.md).
- Concrete commands the reader pastes, and **run every one of them before publishing**. A command in a doc is a claim.
- Verifiable checkpoints: the sidebar should show this, the output channel should say that.
- A clear end state, so the reader knows they are done.
- **Do not promise what nobody has watched.** [Observed in a real editor](../reference/observed-in-a-real-editor.md) is the list of what may be asserted as a checkpoint; anything not on it is a claim this repository has not earned.

See the [Diátaxis tutorials guide](https://diataxis.fr/tutorials/) for the full rubric.
