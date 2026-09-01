# What this extension is

It is a **viewer**.

No rendering, no state and no schema knowledge live here, and none should ever be added.
Everything it shows comes from the running `aboard` (or `ape aboard`) server over plain
HTTP, the same way any other client reads it. When aboard grows a sixteenth renderer this
extension needs zero changes — if it ever does, something here is wrong.

That is not modesty about the amount of code. It is the constraint that decides most of
the arguments in these pages: the **New Tab** button asks the board to draw its own sheet
rather than drawing one, the tooltips read their type labels from `/capabilities` rather
than naming them, the schema number is compared rather than hardcoded, and the panel
frames the board's own shell rather than reimplementing any part of it.

## Three hard rules

Each has a plausible opposite that somebody will propose again.

### Never touch `.aboard/aboard.json` on disk

Every write goes through `POST /aboard.json` with compare-and-set — the mechanism that
stops a concurrent agent's work from being destroyed with no error. The file is *right
there* in the workspace, which is exactly why the rule needs writing down: editing it
directly would work, would be simpler, and would silently discard whatever an agent wrote
in the same second.

### Never assume you should launch a new server

Check the instance record and `/health` first. A second `aboard serve` on a project that
already has one is two servers on two ports for one board, which is confusing for no
benefit.

### Write as `__by: "human"`, because a human clicked

Never `agent-*`. Deleting a tab, dismissing a change marker and answering a removal
request are gestures the server *refuses* from an agent — by carrying the old value
forward, with a `200`. Offering them here is not a liberty this extension takes; it is
the point of being the human's client.

Get the field wrong and every one of them becomes a **silent no-op**: a `200`, no error,
no notification, and a sidebar that looks exactly like one where nothing needed doing.
That failure mode is the subject of [its own page](the-failure-mode-is-silence.md).

## A separate repository, deliberately

aboard is Go, with an embedded web tree and a dependency-light build. Dropping
`package.json`, `node_modules`, TypeScript and esbuild into that tree would quietly repeal
that choice. This extension also versions on a different clock and has a different
audience: an aboard release every time a VS Code API moves is a cost with no
corresponding benefit.

What remains between them is a **contract, not a shared file** — [the board
contract](../reference/board-contract.md), whose authority is
`docs/reference/http-api.md` in the aboard repository. Nothing is generated from one repo
into the other and no file is vendored. That is what lets either side move without the
other, and it is why the two things this extension needed from the board could ship
whenever the board was ready: both were coded for here from the start, because each was
free to send and would only ever have cost a change here later.

The price of a contract is drift, and drift is paid for with tests rather than with
discipline — see [duplication and drift](duplication-and-drift.md).

## What it is not

- **Not an editor for the board's content.** The renderers live in the board; the panel frames them.
- **Not a second source of truth.** It caches nothing, writes nothing to disk, and holds no state a reload would not rebuild. The theme it computes is applied to one viewer and stored nowhere.
- **Not an agent.** Nothing in it starts a session. The one button that reaches outside the board's HTTP surface is **Start the Board**, which runs a *server* in a terminal where the human can see it. The board may ask for a human; a session may choose to listen. That rule belongs to aboard and is argued in its own docs (`docs/explanation/why-nothing-in-the-ui-starts-a-session.md`).

## See also

- [What it does](../reference/what-it-does.md) — the surfaces, described neutrally.
- [Why a native TreeView](why-a-native-treeview.md) — the same constraint applied to the sidebar.
- [Why not a marketplace listing](why-not-a-marketplace-listing.md) — what being a viewer for one specific server means for distribution.
