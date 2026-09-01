# Explanation

Explanation answers "why", and the "how does this actually work" that is asked in order
to understand rather than in order to act. Unlike [Tutorials](../tutorials/index.md) and
[How-to guides](../how-to/index.md) it is not action-oriented; unlike
[Reference](../reference/index.md) it is not exhaustive description. It is discursive.

Several of these pages record **closed** decisions, each with a plausible opposite that
somebody will propose again. They are here so that the reason is found before the
proposal is re-derived. A rule with a reason outlives a rewrite; a rule that reads as
taste does not.

## Available explanation

- [what-this-extension-is.md](what-this-extension-is.md) — a viewer and nothing else; the three hard rules about writing; and why this is a separate repository from aboard rather than a directory inside it.
- [the-failure-mode-is-silence.md](the-failure-mode-is-silence.md) — the defects, in order, with how each was found. Every one of consequence was found by a human looking at a screen, and not one was visible to `node --test`. The pattern is the point: the mechanism worked and the thing on screen said nothing.
- [why-a-native-treeview.md](why-a-native-treeview.md) — a `WebviewView` reusing the board's stylesheet buys pixel-identical colour and costs keyboard navigation, type-to-filter, collapse state, the badge, context menus and `reveal`. What the native tree pays instead is two SVGs.
- [why-the-shell-is-probed.md](why-the-shell-is-probed.md) — `?chrome=notabs` is silently ignored by an older board, `/capabilities` has no field that describes it, and testing the feature beats testing a proxy for it.
- [why-the-project-picks-the-start-command.md](why-the-project-picks-the-start-command.md) — when both `aboard` and `ape aboard` work, an `_apex/` directory decides. This reverses an earlier call, and the reversal is the interesting part.
- [why-the-host-copies-images.md](why-the-host-copies-images.md) — Chromium's permissions policy, VS Code's missing permission field, and why a program on the extension host is the only route left. Includes the `xclip` fork bug, which looked like the opposite of itself.
- [why-the-theme-splits-neutrals-from-voices.md](why-the-theme-splits-neutrals-from-voices.md) — depth is an ORDER and the voices are a SET, VS Code guarantees neither, and both failures were built from individually valid colours.
- [duplication-and-drift.md](duplication-and-drift.md) — the rule is not "never duplicate", it is "never duplicate without a test that breaks when the copy goes stale". Two copies live here and both are held to it.
- [why-not-a-marketplace-listing.md](why-not-a-marketplace-listing.md) — to a stranger this extension installs, finds nothing and does nothing, which is a bad thing to put in a store people browse.

## Planned explanation

- **Why the tree is never re-sorted.** The order is the human's; the reasoning is stated in a sentence in [what it does](../reference/what-it-does.md) and has not yet been argued against the obvious proposal (sort by attention).
- **Why the extension has no state of its own.** No cache, no settings beyond `aboard.theme`, nothing written anywhere. It is implied by [what this extension is](what-this-extension-is.md) and worth its own page if anything ever proposes a cache.

## Writing explanation

- Take a position. If an alternative was considered and rejected, name it and say why.
- Discuss; do not instruct.
- Set context generously: "before we had X, things looked like Y" belongs here.
- **Record the mistake that produced the rule.** Half of these pages exist because a defect was invisible to every test, and the story is the part that survives.
- Link to [Reference](../reference/index.md) for facts and [How-to](../how-to/index.md) for action.

See the [Diátaxis explanation rubric](https://diataxis.fr/explanation/).
