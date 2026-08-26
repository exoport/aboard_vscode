// The icon files, checked for the one thing that was wrong with them.
//
// On 2026-08-26 the sidebar listed every tab and drew no dots, on a board where
// every tab carried a `touched` mark. Nothing in this extension was at fault: the
// document was refetched, the model returned `dot: 'change'`, and `getTreeItem`
// handed VS Code an `iconPath` naming a file that existed. The file simply would
// not parse.
//
// Both dot SVGs opened with `<!-- --agent, copied from … -->`. XML forbids the
// string `--` INSIDE a comment, so the document is not well-formed, and a browser
// — which is what the VS Code workbench is — refuses it outright rather than
// recovering the way an HTML parser would. `background-image` then resolves to
// nothing and the row has no icon, with no error anywhere a human would look.
// `media/activity.svg` was fine, which is why the activity-bar icon showed up and
// the dots did not: one comment happened to contain no double hyphen.
//
// The trap is that the CSS custom properties these files are copied from are
// SPELLED with two leading hyphens (`--agent`, `--danger`), so naming the source
// accurately is exactly what breaks the file.
//
// **Why a hand-rolled check.** Node has no XML parser and this repo has no
// runtime dependencies and wants none. This is not a general validator and does
// not pretend to be: it checks the comment rule that broke, plus that a comment
// is closed and that what is left is an `<svg>` document. Say what a check
// covers; a check that oversells itself is how the next gap gets missed.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';

const media = path.join(__dirname, '..', '..', 'media');
/** The three that exist today, asserted by name below so a rename cannot pass. */
const EXPECTED = ['dot-change.svg', 'dot-removal.svg', 'activity.svg'];
// Read the directory rather than the list: a hardcoded list checks three
// filenames, and the rule is about SVGs. The next icon added to media/ would
// otherwise be the one nobody checked — which is how the first two got here.
const svgs = fs
  .readdirSync(media)
  .filter((f) => f.endsWith('.svg'))
  .sort();

/**
 * The XML comment rule, from the spec's `Comment` production:
 *
 *   `<!--` ((Char - '-') | ('-' (Char - '-')))* `-->`
 *
 * which is the long way of saying: the content may not contain `--`, and may not
 * end with `-`. Returns the problem, or undefined.
 */
export function commentProblem(source: string): string | undefined {
  let at = 0;
  for (;;) {
    const open = source.indexOf('<!--', at);
    if (open === -1) {
      return undefined;
    }
    const close = source.indexOf('-->', open + 4);
    if (close === -1) {
      return `an unterminated comment at offset ${open}`;
    }
    const body = source.slice(open + 4, close);
    if (body.includes('--')) {
      const line = source.slice(0, open).split('\n').length;
      return `a double hyphen inside the comment on line ${line} — XML forbids "--" in a comment, so the whole file fails to parse and the icon silently never renders`;
    }
    if (body.endsWith('-')) {
      return `the comment at offset ${open} ends with a hyphen, which XML forbids`;
    }
    at = close + 3;
  }
}

function withoutComments(source: string): string {
  return source.replace(/<!--[\s\S]*?-->/g, '').trim();
}

describe('the media SVGs', () => {
  for (const file of svgs) {
    it(`${file} is well-formed enough for a browser to draw`, () => {
      const source = fs.readFileSync(path.join(media, file), 'utf8');
      const problem = commentProblem(source);
      assert.equal(problem, undefined, `${file}: ${problem}`);
      const body = withoutComments(source);
      assert.ok(body.startsWith('<svg'), `${file}: the document does not start with <svg>`);
      assert.ok(body.endsWith('</svg>'), `${file}: the document does not end with </svg>`);
    });
  }

  // The check itself has to be wrong-proof: it was written to catch one exact
  // shape, and a checker that cannot be seen failing is a checker nobody trusts.
  it('catches the comment that actually shipped', () => {
    const shipped = '<!-- --agent, copied from pkg/aboard/web/app.css -->\n<svg/>';
    assert.match(commentProblem(shipped) ?? '', /double hyphen/);
    assert.equal(commentProblem('<!-- the agent token -->\n<svg/>'), undefined);
    assert.match(commentProblem('<!-- never closed') ?? '', /unterminated/);
    // `<!--x--->`: the comment body is `x-`, which XML also forbids.
    assert.match(commentProblem('<!--x--->') ?? '', /ends with a hyphen/);
  });

  it('covers every SVG in media/, and the three that must be there are', () => {
    assert.ok(svgs.length >= EXPECTED.length, 'media/ lost an SVG');
    for (const name of EXPECTED) {
      assert.ok(svgs.includes(name), `media/${name} is gone or was renamed`);
    }
  });

  it('are where tree.ts and panel.ts look for them', () => {
    // `tree.ts` builds `Uri.joinPath(extensionUri, 'media', <name>)` and
    // `panel.ts` uses `media/activity.svg` for the editor-tab icon. A rename that
    // missed one of those is a missing icon and nothing else — the same silent
    // failure this file exists for.
    for (const file of [...EXPECTED, 'panel.html']) {
      assert.ok(fs.existsSync(path.join(media, file)), `media/${file} is gone`);
    }
  });
});
