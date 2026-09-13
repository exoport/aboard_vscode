# How to make the board match your editor theme

It already does. `aboard.theme` defaults to `follow`, and the panel takes the editor's
colours so it is not a dark rectangle inside a light IDE.

This page is for the two cases where you want something else, and for the one case where
what you get is not what you expected.

## Turn it off

```jsonc
// settings.json
"aboard.theme": "board"
```

The extension then sends no colours at all, and the board's own `.aboard/theme.json` and
its dark/light switch decide. **This is the right setting if you deliberately keep the
board in the other variant from your editor** — a light board beside a dark editor, say.

Set it back to `follow` to resume. Nothing was written anywhere in either direction, so
there is nothing to clean up: the colours are applied to your viewer only, never to the
board document and never to `localStorage`. Two people can look at one board in the same
second and disagree about colour while agreeing about content.

## Give the board a house style instead

If what you want is for *everyone* looking at this board to see your colours, that is the
board's job, not the extension's: `.aboard/theme.json`, documented in the aboard
repository under `docs/how-to/give-a-project-a-house-style.md`. Under `follow` your editor
still overrides it for you and nobody else.

## "It followed the backgrounds but not the text"

That is the contrast guard, working.

The board pins its type to **WCAG AAA (7:1)** because most of it is small. `--text`,
`--muted` and `--dim` are measured against every ground the mapping produced, and if any
pair misses AAA, **none of the three is sent** — a hierarchy assembled from two palettes
is not a hierarchy.

This fires on VS Code's own **Dark+**, where `descriptionForeground` is about 6.1:1 on the
editor background. The backgrounds still follow your editor and the board keeps type it
can prove is readable. **A panel whose text went grey-on-grey would be the guard failing,
not the theme arriving.**

## "It followed the greys but the accents are still the board's"

Also working, and deliberate. Neutrals follow the editor; the board's **voices** —
`--accent`, `--mark`, `--agent`, `--focus`, `--danger`, `--drop` and the three
`--status-*` — do not.

Depth is an ORDER and the voices are a SET chosen so no two can be confused, and a host
theme guarantees neither. On one real theme the old mapping rendered five mark swatches as
three usable colours, one a repeat and one invisible. The measurements are in [why the
theme splits neutrals from voices](../explanation/why-the-theme-splits-neutrals-from-voices.md).

Periwinkle means an agent said it and orange means the human asked for it, in the panel
exactly as in a browser tab, because those are sentences the board's own docs teach every
agent.

## "The panel opens dark for a moment, then turns light"

That is a board older than **aboard v0.2.0**. The extension asks for your editor's
variant in the frame's URL (`&theme=light`) so the board paints it from the first frame,
and an older board ignores the parameter — so it paints its default dark and waits for the
colours to arrive after the page has loaded. Update the aboard binary and restart the
board.

On a current board you may still see a much smaller step as the panel opens: the board's
own light ground giving way to your editor's. That is the rest of the palette arriving,
which can only happen after load. See [the first frame](../reference/theme.md#the-first-frame).

## "I changed theme and the panel kept the old colours"

It should not: the mapping re-reads on four separate signals, including a
`MutationObserver` on the root's inline style, which is the one that catches two themes of
the same kind differing only in their values.

If it happens, reopen the panel and file it — that is a real defect, and the row it would
sit under in [the verification log](../reference/observed-in-a-real-editor.md) is one a
human has watched pass.

**One exception with a known cause:** the panel flips back to the other variant the moment
someone edits the project's `.aboard/theme.json`. That is a board older than **aboard
v0.2.1**, which forgot the variant your editor last sent and re-decided it from the one
the panel opened with. Update the aboard binary and restart the board; until then,
switching your editor theme once more puts it right.

## See also

- [Theme mapping](../reference/theme.md) — the tokens, the ramp, the guard, and who may set the palette.
- [Commands and settings](../reference/commands-and-settings.md#settings).
