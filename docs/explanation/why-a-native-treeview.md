# Why a native TreeView

The obvious alternative is a `WebviewView` in the sidebar, reusing the board's own
stylesheet. It buys pixel-identical colour: the sidebar and the panel would be the same
product drawn by the same CSS, and nothing in [theme mapping](../reference/theme.md)
would need to exist for the sidebar at all.

It costs everything a native tree gets for free, and the list is long:

- keyboard navigation
- type-to-filter
- collapse state, remembered across reloads
- `TreeView.badge`
- context menus, including the inline actions on a row
- `reveal`, which is what makes `]` inside the panel move the sidebar highlight
- following the user's own VS Code theme, without a single line of colour code

Every one of those is behaviour a person already knows from every other view in their
editor, and every one would have to be rebuilt, worse, in a webview. A sidebar that does
not answer the arrow keys is a sidebar people stop using.

## What the native tree pays instead

**Colour fidelity, in exactly one place: the two status dots.** A `TreeItem` icon is an
image, so a periwinkle "an agent changed this" dot and a red "removal requested" dot
cannot be drawn from the board's live tokens. They are two 16×16 SVGs carrying the board's
own values, `#a7adf4` and `#ff0066`.

That is a copy of something the aboard repository owns, and it is held to the rule that
governs every copy here: `src/tokens.ts` is the one place either hex appears in code, and
`test/tokens.test.ts` fails when an SVG drifts from it. See [duplication and
drift](duplication-and-drift.md).

The trade is a good one because the dots are the only place the sidebar needs a colour
the editor cannot supply. Everything else — the label, the description, the tooltip, the
badge, the selection — is the editor's own vocabulary, and using it is the feature.

## The panel is the other half of the same decision

The board itself *is* a web page, so the panel is a webview and frames the real thing.
Nothing is reimplemented there either. The split is not "native where possible" but
"native for the parts VS Code already knows how to draw, and the board's own shell for
the parts only the board knows how to draw" — which is the same rule as [what this
extension is](what-this-extension-is.md), applied to two surfaces.

## See also

- [What it does](../reference/what-it-does.md) — the tree's labels, dots and badge.
- [Repository layout](../reference/layout.md) — `tree.ts` as a translation of `model.ts`, and why `panel.ts` is deliberately uncovered.
