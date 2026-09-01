# Read your board in the sidebar

By the end of this you will have the extension installed in a real editor, an example
board open in the sidebar and in a panel, and you will have watched an agent's write
arrive as a coloured dot and answered it — which is the whole loop this extension exists
for.

About ten minutes.

## Before you start

- **VS Code 1.90 or later.**
- **Node 20 or later**, to build the extension.
- **`aboard` on your `PATH`.** If you do not have it: `go install github.com/exoport/aboard/cmd/aboard@latest`
- **A clone of this repository**, and a terminal in it.
- `jq` and `curl`, for one step near the end.

## 1. Build and install the extension

```sh
npm ci
npm run install:dev
```

`install:dev` packages a `.vsix`, force-installs it, and prints the version that landed.

**Read that last line.** It should say something like:

```
exoport.aboard-vscode@0.1.3
```

An install that does not land looks exactly like a bug in whatever you test next, so this
line is the checkpoint, not the absence of an error.

Now reload VS Code: **⇧⌘P / Ctrl+Shift+P → *Developer: Reload Window***. A new version is
a new folder under `~/.vscode/extensions/`, and the extension host only picks it up on a
reload.

## 2. Make a board to look at

In a terminal, somewhere outside this repository:

```sh
mkdir aboard-demo && cd aboard-demo
aboard init --example
aboard serve
```

`--example` seeds fifteen tabs, one per renderer. Leave `aboard serve` running; it prints
the URL it is answering on.

**Checkpoint.** In a second terminal, in the same directory:

```sh
aboard status
```

It should print `aboard running at http://localhost:<port>` and the project path. That
port is derived from the project's path, which is why nothing ever has to guess it.

## 3. Open the folder in VS Code

```sh
code aboard-demo
```

Click the **Aboard** icon in the activity bar.

**Checkpoint.** The **Tabs** view lists fifteen rows, starting with *Plan* and ending with
*UI gallery*. Each row's label is the tab's name and its description is its id — `ab1`,
`ab13`, `ab14` and so on. The order is the board document's own; the extension never
re-sorts it.

Hover a row. The tooltip reads something like `ab13 · Kanban` — the id, then the type's
label, which the extension read from the board's `/capabilities` rather than knowing.

> **If the view is empty**, the folder you opened may not be the project root, or the
> board may not be running. `aboard status` in that folder is the arbiter — and [how to
> troubleshoot a quiet sidebar](../how-to/troubleshoot.md) is the next stop.

## 4. Open the board in a panel

Click the **Progress** row.

**Checkpoint.** The board opens in an editor panel beside your code, showing the *Progress*
kanban — and showing **one** tab strip, the extension's, not two. The panel asked the
board for `?chrome=notabs`, so the board suppressed its own strip for this viewer only. A
browser tab on the same board still has it.

Now click **Architecture** in the sidebar. The panel switches to the diagram.

**Checkpoint.** The panel did not reload — no flash, no reconnect. Switching tabs changes
only the URL fragment, which fires `hashchange`, which is why the live stream stays up and
a renderer does not remount.

Drag the panel to another editor group and back. It survives, because it is created with
`retainContextWhenHidden`.

## 5. Watch an agent's change arrive

This is the part worth doing slowly. In your second terminal, still in `aboard-demo`:

```sh
url=$(aboard status --output-format json | jq -r '.url')
curl -s "$url/aboard.json" \
  | jq '(.tabs[] | select(.id == "ab13") | .note) = "an agent was here"' \
  | aboard apply --by agent-1 --label "tutorial"
```

That reads the whole document, edits one tab's note, and writes it back through the
running board under compare-and-set — the same route the extension itself uses, as an
agent rather than as you. It prints `applied to http://localhost:<port> as "agent-1"`.

(The example board also prints a `sparkline` warning on stderr. It is the example's, not
yours.)

**Checkpoint, and do not press Refresh.** Within about a second, the **Progress** row
grows a **periwinkle dot**, and the view's badge — the little number on the Aboard icon —
goes to 1. Hover the row: the note you just wrote is at the end of the tooltip, verbatim.

Nothing polled for that. The extension is following the board's `/events` stream and
re-read the document when the write landed.

## 6. Answer it

Hover the **Progress** row and click the **✓** that appears at its right-hand end — *Dismiss
Change*.

**Checkpoint.** The dot goes, and the badge with it.

What just happened matters more than it looks: the extension wrote the whole document back
with `__by: "human"`. Dismissing a change marker is something the server **refuses from an
agent** — by carrying the old value forward, with a `200` and no error. If the extension
had identified itself wrongly, the dot would simply have come back, and nothing anywhere
would have said why.

## 7. Rename a tab

Right-click the **Progress** row → **Rename Tab**, type a new name, press Enter.

**Checkpoint.** The row's label changes, and so does the tab strip inside the panel. That
is one board, two viewers, one document.

The same menu carries **Copy Id** (`ab13`), **Copy Reference** (`Progress (ab13)` — the
form the board's docs tell agents to use when they address a human) and **Copy Link to
This Tab** (a deep link). Three different things, deliberately named as three.

## 8. Stop

Ctrl-C the `aboard serve` terminal.

**Checkpoint.** Within a few seconds the tree empties and the welcome view appears,
offering **Start the Board**. Press it: the extension runs `aboard serve` for you in a new
terminal — picking the command from what is actually on your machine — polls `/health`,
and the tree fills in again.

## What you have seen

A tree fed by `GET /aboard.json`, a panel framing the board's own shell, a live refresh
over SSE, a write that only a human is allowed to make, and a board started from inside
the editor. That is the whole extension; everything else is detail about doing those five
things without lying to you.

## Where to go next

- [What it does](../reference/what-it-does.md) — every surface, including the nudge button and the multi-board case this tutorial did not reach.
- [How to make the board match your editor theme](../how-to/match-the-editor-theme.md) — it already did, and the page explains what it deliberately did not match.
- [What this extension is](../explanation/what-this-extension-is.md) — why a viewer, and the three rules about writing.
- [The failure mode is silence](../explanation/the-failure-mode-is-silence.md) — read this before you conclude that something is working.
