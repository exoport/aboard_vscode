# How-to guides

How-to guides are **recipes** — they answer "how do I X?" for a reader who already knows
the basics. Each one solves a specific problem in a specific context. Unlike
[Tutorials](../tutorials/index.md) they assume competence and skip the hand-holding;
unlike [Reference](../reference/index.md) they are goal-oriented rather than exhaustive.

## Available guides

**Getting it running**

- [How to install it](install.md) — from a release `.vsix` or from a clone, and the one line that answers "did it land"
- [How to build and test it](build-and-test.md) — the four commands, and what the integration suite wants from a real `aboard` binary
- [How to run it in a development host](run-in-a-dev-host.md) — `F5`, the rebuild-and-reload rule, and why an installed build is a different test

**Using it**

- [How to start a board when there is not one](start-a-board.md) — the welcome view's button, what it runs, and the two ways it can decline
- [How to copy an image out of the panel](copy-an-image.md) — the tool to install, and where the failure is written down when it fails
- [How to make the board match your editor theme](match-the-editor-theme.md) — `aboard.theme`, and why matching is deliberately not total

**When it goes quiet**

- [How to troubleshoot a quiet sidebar](troubleshoot.md) — the output channel, the empty-tree cases, and the three warnings that belong to other extensions

**Shipping it**

- [How to publish a release](publish.md) — version, tag, `.vsix`, GitHub Release, and the Open VSX rung above it

## Writing a how-to guide

- Start with the problem in the reader's words, not the solution.
- One outcome per guide. Do not bundle unrelated tasks.
- Show only the path that works for the stated problem; if it branches into materially different cases, write separate guides.
- Do not teach concepts here — link to [Explanation](../explanation/index.md).
- **Run every command you write.** These are the pages readers paste from.

See the [Diátaxis how-to guide rubric](https://diataxis.fr/how-to-guides/).
