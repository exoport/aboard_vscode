# Reference

Reference docs are **information** — exhaustive, accurate, neutral. They describe what
exists; they do not teach (that is [Tutorials](../tutorials/index.md)) and they do not
recommend (that is [How-to guides](../how-to/index.md) and
[Explanation](../explanation/index.md)). A reader consults reference when they need a
specific fact.

For this extension the surface area is small and mostly borrowed: what it contributes to
VS Code, what it asks of a board, and what it has been seen doing.

## Available reference

- [what-it-does.md](what-it-does.md) — the tree, the panel, the view-title buttons, the context-menu actions and the status bar, surface by surface, including what each one deliberately does not do.
- [commands-and-settings.md](commands-and-settings.md) — every command, menu placement, context key, activation event and setting the manifest contributes, as tables.
- [board-contract.md](board-contract.md) — every call this extension makes against a board, the messages that cross the frame boundary in both directions, and the four facts the design rests on.
- [discovery-and-start.md](discovery-and-start.md) — how a board is found (walk up, read the record, verify with `/health`), how the port is *not* guessed, and the ladder that picks between `aboard serve` and `ape aboard serve`.
- [theme.md](theme.md) — the three hops from a VS Code colour to a board token, the 21 token names, which ten travel, the derived depth ramp, and the contrast guard's rule.
- [layout.md](layout.md) — every file in the repository and what it is for, including where the `vscode` import stops and why.
- [observed-in-a-real-editor.md](observed-in-a-real-editor.md) — the verification log: every row a human has watched, with its date, and every row still open.
- [edge-cases.md](edge-cases.md) — the cases that must hold before any public listing, each with its status, plus the five that were once called handled and were not.

## Planned reference

- **The Aboard output channel.** What is written to it, at what point, and which lines answer which question. It is named in several pages here; the lines it prints are not yet listed in one place.
- **The webview bridge.** `media/panel.html`'s message table already appears in [board-contract.md](board-contract.md) from the board's side; the page's own accept/refuse rules (origin pinning, the `goto` src-prefix rule) deserve a page once anything else needs to speak to it.

## Writing reference

- Match the structure of the thing you are documenting: commands → command-shaped tables, routes → route-shaped rows.
- Be exhaustive within the topic. Edge cases are the reason someone opened the page.
- Be neutral: no recommendations. Those go in [How-to](../how-to/index.md) or [Explanation](../explanation/index.md).
- **Prefer a fact that a test already pins.** The command titles, the token names and the two dot colours are all asserted somewhere in `test/`; a hand-copied fact with no test behind it is a fact that will disagree. See [duplication and drift](../explanation/duplication-and-drift.md).

See the [Diátaxis reference rubric](https://diataxis.fr/reference/).
