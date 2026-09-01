# What it does

Surface by surface. Everything below is fed by [the board contract](board-contract.md);
nothing here is computed from knowledge of the board's schema.

## The tree

In `aboard.json` order, always — **the order is the human's**, so it is never re-sorted.

- **Label** — the tab name, or `(unnamed)` when it is empty, as the board itself says.
- **Description** — the tab id.
- **Tooltip** — `ab71 · Kanban`: the id, then the type's label read from `/capabilities` rather than hardcoded, then the tab's `note` verbatim.
- **Dots** — a periwinkle dot for a changed tab, red for a removal request, **removal winning** when a tab has both.
- **Badge** — `TreeView.badge` counts the changed tabs.

**More than one board** in one window — a multi-root workspace, or one project serving a
named board beside its default — gets a row each, so the tree says which is which. With
exactly one board the tabs are top-level: a single always-open parent row is a wasted
line.

## The panel

One `<iframe>` on the running board, with `retainContextWhenHidden`, and `portMapping` +
`asExternalUri` so it works over Remote SSH and Codespaces (coded, not yet verified — see
[edge cases](edge-cases.md)).

The framed URL is `<base>?chrome=notabs#tab=<id>&r=<n>`, so the panel shows one tab strip
rather than two. Switching tabs from the tree changes only the fragment, which fires
`hashchange` without reloading the page — no dropped SSE stream, no remounted renderer,
no lost zoom.

## The view-title buttons

| button | command | when |
|---|---|---|
| `$(window)` Open Board Panel | `aboard.open` | always |
| `$(add)` New Tab | `aboard.newTab` | `aboard.hasBoard` |
| `$(zap)` / `$(circle-slash)` Nudge | `aboard.nudgeWaiting` / `aboard.nudgeIdle` | by `aboard.waiting` |
| `$(refresh)` Refresh | `aboard.refresh` | always |

**New Tab** exists because `?chrome=notabs` hides the board's own `+` along with the
strip — it used to sit alone on a row of the panel, which is a whole line of a small
viewer. The button posts `{__aboard: 'newtab'}` and the **board** opens its own sheet:
the human names the tab and picks the type there, and the board switches to whatever is
created. Deliberately not reimplemented here — the sheet knows every type the board has
and what an empty state of each looks like, and a copy of that living in a viewer is
exactly the coupling this repository exists without. Hidden until a board is actually
answering, since with nothing running there is no panel for a sheet to open in.

**The nudge button says whether anybody is listening.** It is `$(zap)` while an agent is
parked on `aboard wait` and `$(circle-slash)` when none is, driven by the
`aboard.waiting` context key. A board with nobody waiting is simply not listening, and
the button says so rather than pretending. Two states mean two command ids running one
handler, because a menu item takes its icon *and* its tooltip from the command with no
per-entry override.

It was a **bell until 2026-08-27**. A bell in an editor means *notifications for you*, so
the button read as the board having news to deliver — when what it means is the opposite
direction: an agent is blocked, and you are the only one who can release it. `$(zap)` is
the board's own word for that; the route this button calls is `POST /poke`. The idle
state is `$(circle-slash)` rather than a fainter zap, because "nothing to nudge" is a
different statement from "nudge", not a quieter one. `test/manifest.test.ts` asserts that
none of the three commands is a bell again, so restoring the familiar icon fails a test
rather than a review.

## The actions

All of them writes the board permits **from a human**, and the extension writes as
`__by: "human"` because a human clicked — see [the three hard
rules](../explanation/what-this-extension-is.md#three-hard-rules).

| action | command |
|---|---|
| Dismiss a change marker | `aboard.dismissChange` |
| Approve a removal request | `aboard.approveRemoval` |
| Deny a removal request | `aboard.denyRemoval` |
| Rename a tab | `aboard.rename` |
| Set a tab's note | `aboard.setNote` |
| Nudge a waiting session | `aboard.nudge` |
| Copy the id — `ab32` | `aboard.copyId` |
| Copy the **reference** — `Migration review (ab32)` | `aboard.copyReference` |
| Copy the **link** — the deep link the board's own right-click menu builds | `aboard.copyLink` |

The three copies were **one command copying a URL** until 2026-08-26: the id was
`aboard.copyReference` and its title was "Copy Link to This Tab", so the sidebar had two
ways to copy an address and none to copy the form the board's own documentation tells
every agent to use — the name with the id beside it. Both exist now, named as two
different things. The URL builder is called `linkFor` here even though the board's
`views/menu.js` calls its equivalent `referenceFor`: on the board that word is already
spent on the URL, and a `copyReference` command calling a function called `referenceFor`
that returns a link is exactly how this happened.

## The welcome view

When discovery finds nothing, the view shows one of two texts, chosen by the
`aboard.hasProject` context key — so "no board is running" and "no project here" are
distinguishable rather than both being an empty tree. Both offer **Start the Board**; see
[how to start a board](../how-to/start-a-board.md) and
[discovery and starting a board](discovery-and-start.md).

## The status bar

A right-aligned item whose command is `aboard.nudge`. It reads
`$(zap) aboard · nudge <n>` while sessions are parked, and
`$(circuit-board) aboard <version>` — the board's `version` from `/health` — when none
is. It is hidden when no board is answering.

Both sources feed it and the `aboard.waiting` key — the `waiters` frame and the
`/waiters` read — because they fail differently: frames are fanned out with a
non-blocking send and dropped for anyone not listening, and the frame is only sent when
the count CHANGES, so a session that parked before the window opened is invisible to the
stream alone.

## The output channel

**Aboard**, in the Output panel. It carries `aboard-vscode <version> activated` at
activation, each clipboard request with its size, outcome and timing, dropped streams,
ignored instance files, and the reason a discovered candidate was rejected. Background
noise goes here rather than interrupting; every *action* failure is a notification
carrying the server's own sentence.

## The theme

The board in the panel follows your VS Code theme, so the panel is not a dark rectangle
inside a light IDE. What travels and what deliberately does not is [theme
mapping](theme.md); the setting is [`aboard.theme`](commands-and-settings.md#settings).

## See also

- [Commands and settings](commands-and-settings.md) — the same surfaces as manifest data.
- [The board contract](board-contract.md) — what each surface reads and writes.
- [Why a native TreeView](../explanation/why-a-native-treeview.md).
