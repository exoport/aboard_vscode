# How to publish a release

A release is a **GitHub Release with a `.vsix` attached**. Nothing is published to a
marketplace — see [why not a marketplace
listing](../explanation/why-not-a-marketplace-listing.md).

## Before you tag

1. **Install the build and use it.** Not F5 — an installed `.vsix`, in a normal window, on a project with a board. It is the only run with no debugger attached and from the packaged file list, and it has found defects no other run did. See [how to run it in a development host](run-in-a-dev-host.md) for what the two runs each catch.
2. **Work any open rows that this release touches** in [observed in a real editor](../reference/observed-in-a-real-editor.md), and record what you watched, with the date. That page is the honest half of every status claim; a release that leaves it stale is a release that starts lying quietly.
3. **Write the CHANGELOG entry.** One section per version, newest first, saying what changed and why — including what was *rejected*, where the alternative is one somebody will propose again.
4. **Bump `version` in `package.json`.** The tag and `package.json` must agree, and the release workflow fails the build when they do not: a `.vsix` on the Releases page carrying a version nobody can match to the tag they downloaded it from is the same ambiguity that cost a day on 2026-08-28.

## Tag it

```sh
git tag v0.1.4
git push origin v0.1.4
```

The **Release** workflow runs on `v[0-9]+.[0-9]+.[0-9]+` tags with no `-` in them (so an
`-rc` tag is guarded out). It installs a real `aboard` with
`go install github.com/exoport/aboard/cmd/aboard@latest` — because the integration suite
skips loudly without one, and CI must not read a skip as a pass — then checks the tag
against `package.json`, runs `npm run typecheck`, `npm test` and `npm run package`, and
creates the release with `gh`, attaching the `.vsix`.

It needs no third-party action and no credential of its own: `gh` is preinstalled on
GitHub-hosted runners and authenticates with the workflow's own token.

## Packaging by hand

```sh
npm run package   # → aboard-vscode-<version>.vsix
```

`package` removes the previous `.vsix` first, so the `aboard-vscode-*.vsix` glob always
matches exactly one file, and it runs `vscode:prepublish` → `npm run build`, so the bundle
in the archive is always built from the tree it was packaged from.

Read vsce's file list — `npx vsce ls` prints it without building anything. It should be
eleven files: `dist/extension.js`, the four things in `media/`, `package.json`,
`readme.md`, `changelog.md`, `LICENSE.txt` and the two archive manifests. **A
`.vscodeignore` that stops matching is silent**, which is why CI packages on every push
rather than only at a tag.

The manifest already carries everything `vsce` demands — `name`, `publisher`, `version`,
`engines.vscode`, `main`, `contributes`, `activationEvents`, plus `README.md` and a
`LICENSE` (it complains without one).

## The rung above: Open VSX

**If and only if somebody outside this pairing wants it.** It needs an Eclipse Foundation
account with the Publisher Agreement signed, a namespace, and a token:

```sh
npx ovsx create-namespace exoport -p "$OVSX_TOKEN"
npx ovsx publish aboard-vscode-*.vsix -p "$OVSX_TOKEN"   # one file: package removes the last one
```

Doing this from CI means the token lives here as a secret, which is a cost worth paying
only once somebody is actually installing from a registry.

## See also

- [How to install it](install.md) — what a person does with the artifact you just published.
- [Edge cases and their status](../reference/edge-cases.md) — the list a public listing would have to clear.
