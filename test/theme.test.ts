// The mapping from a VS Code theme to the board's palette.
//
// The whole feature is one pure function and a bridge, and this file covers the
// function: which tokens come out, which are deliberately left out, what happens
// to a high-contrast theme, and the contrast guard — the one rule here that can
// make the board LOOK worse if it is wrong, because an unreadable colour is
// still a colour and nothing on any console complains about it.

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AAA,
  BOARD_TOKENS,
  boardKind,
  contrast,
  depthRamp,
  mapVscodeTheme,
  parseColor,
  themeKindFromBodyClass,
  VSCODE_VARS,
} from '../src/theme';

/**
 * VS Code's own Dark+ (Dark Modern), as a webview root actually carries it.
 *
 * Real values on purpose: the contrast guard's behaviour on the DEFAULT theme is
 * the single most important thing about it, and a made-up palette would not have
 * told us that `descriptionForeground` misses AAA there by a whole point.
 */
const DARK_PLUS: Record<string, string> = {
  '--vscode-editor-background': '#1f1f1f',
  '--vscode-editor-foreground': '#cccccc',
  '--vscode-foreground': '#cccccc',
  '--vscode-descriptionForeground': '#9d9d9d',
  '--vscode-sideBar-background': '#181818',
  '--vscode-input-background': '#313131',
  '--vscode-button-background': '#0078d4',
  '--vscode-button-foreground': '#ffffff',
  '--vscode-button-secondaryBackground': '#313131',
  '--vscode-focusBorder': '#0078d4',
  '--vscode-panel-border': '#2b2b2b',
  '--vscode-widget-border': '#313131',
  '--vscode-errorForeground': '#f85149',
  '--vscode-textLink-foreground': '#4daafc',
  '--vscode-editorLineNumber-foreground': '#6e7681',
  '--vscode-list-dropBackground': '#383b3d',
  '--vscode-charts-lines': '#63666a',
  '--vscode-editorWarning-foreground': '#cca700',
};

/** A palette generous enough that the whole text hierarchy reaches AAA. */
const READABLE: Record<string, string> = {
  '--vscode-editor-background': '#ffffff',
  '--vscode-editor-foreground': '#111111',
  '--vscode-foreground': '#222222',
  '--vscode-descriptionForeground': '#444444',
};

describe('parseColor and contrast', () => {
  it('reads the forms VS Code actually uses', () => {
    assert.deepEqual(parseColor('#fff'), { r: 255, g: 255, b: 255, a: 1 });
    assert.deepEqual(parseColor('#1f1f1f'), { r: 31, g: 31, b: 31, a: 1 });
    assert.deepEqual(parseColor('#00000080')?.a, 128 / 255);
    assert.deepEqual(parseColor('rgba(255, 0, 0, 0.5)'), { r: 255, g: 0, b: 0, a: 0.5 });
    assert.deepEqual(parseColor('rgb(0 128 255 / 25%)'), { r: 0, g: 128, b: 255, a: 0.25 });
  });

  it('returns undefined for anything it cannot read, so the guard fails closed', () => {
    assert.equal(parseColor('rebeccapurple'), undefined);
    assert.equal(parseColor('color-mix(in srgb, red, blue)'), undefined);
    assert.equal(parseColor(''), undefined);
    assert.equal(contrast('nonsense', '#ffffff'), undefined);
  });

  it('agrees with WCAG on the two ends', () => {
    assert.equal(contrast('#000000', '#ffffff'), 21);
    assert.equal(contrast('#123456', '#123456'), 1);
    // A semi-transparent ink is judged as it will LOOK: black at 50% over white
    // is a mid grey, not black.
    const half = contrast('rgba(0, 0, 0, 0.5)', '#ffffff')!;
    assert.ok(half > 3 && half < 6, `half-alpha black on white came out at ${half}`);
  });
});

describe('themeKindFromBodyClass', () => {
  it('reads the class VS Code puts on the webview body', () => {
    assert.equal(themeKindFromBodyClass('vscode-dark'), 'dark');
    assert.equal(themeKindFromBodyClass('vscode-light'), 'light');
    assert.equal(themeKindFromBodyClass('vscode-high-contrast'), 'high-contrast');
  });

  it('tests the light high-contrast class FIRST, because a HC light body carries both', () => {
    // `vscode-high-contrast vscode-high-contrast-light` is what VS Code writes.
    // Matching `vscode-high-contrast` first would read every HC light theme as
    // dark, and the board would come up black inside a white editor — the exact
    // failure this whole item exists to remove.
    assert.equal(themeKindFromBodyClass('vscode-high-contrast vscode-high-contrast-light'), 'high-contrast-light');
    assert.equal(boardKind(themeKindFromBodyClass('vscode-high-contrast vscode-high-contrast-light')), 'light');
    assert.equal(boardKind(themeKindFromBodyClass('vscode-high-contrast')), 'dark');
  });

  it('falls back to dark, which is the board’s own default', () => {
    assert.equal(themeKindFromBodyClass(''), 'dark');
    assert.equal(themeKindFromBodyClass('some-other-class'), 'dark');
  });
});

describe('mapVscodeTheme', () => {
  it('only ever emits names the board declares', () => {
    // The mechanism is the compiler, not this test: `SOURCES` is keyed by
    // `BoardToken`, a union derived from the list below, so a row naming a token
    // the board renamed does not build. What is left for a test is that the list
    // itself is the right SHAPE — 21 distinct names — and that nothing else
    // sneaks into the payload on the way out.
    const { tokens } = mapVscodeTheme(DARK_PLUS, 'dark');
    for (const name of Object.keys(tokens)) {
      assert.ok((BOARD_TOKENS as readonly string[]).includes(name), `${name} is not one of the board's 21 tokens`);
    }
    assert.equal(new Set(BOARD_TOKENS).size, 21);
  });

  it('maps the roles a real theme has', () => {
    const { kind, tokens } = mapVscodeTheme(DARK_PLUS, 'dark');
    assert.equal(kind, 'dark');
    assert.equal(tokens['--bg'], '#1f1f1f');
    // The three layers are DERIVED from the ground, not read off the theme.
    // #1f1f1f is 31, so +10 / +21 / +32 — the board's own dark steps, applied to
    // the editor's ground instead of to black. Dark+ would otherwise have said
    // sideBar #181818 for --surface (BELOW the ground) and, for --raised,
    // button.secondaryBackground #3a3d41 — a mid grey that made every icon
    // button in the panel a light pill.
    assert.equal(tokens['--sunken'], '#292929');
    assert.equal(tokens['--surface'], '#343434');
    assert.equal(tokens['--raised'], '#3f3f3f');
    assert.equal(tokens['--accent'], '#0078d4');
    assert.equal(tokens['--accent-ink'], '#ffffff');
    assert.equal(tokens['--danger'], '#f85149');
    assert.equal(tokens['--agent'], '#4daafc');
    assert.equal(tokens['--line'], '#2b2b2b');
  });

  it('leaves a token OUT when every source for it is absent', () => {
    // Nothing here says what `--danger` or `--agent` should be, and the honest
    // answer is to say nothing: the board's own value stands, which is a colour
    // somebody chose against a palette somebody checked.
    const { tokens } = mapVscodeTheme({ '--vscode-editor-background': '#101010' }, 'dark');
    assert.equal(tokens['--bg'], '#101010');
    assert.ok(!('--danger' in tokens));
    assert.ok(!('--agent' in tokens));
    assert.ok(!('--accent' in tokens));
  });

  it('falls through to the next source, and skips an empty one', () => {
    // `--line` reads panel.border, then widget.border, then editorGroup.border.
    // An empty string is what getPropertyValue returns for a variable this
    // window does not have. (This used to be spelt with `--surface`, which no
    // longer has sources at all — it is derived from `--bg`.)
    const tokens = mapVscodeTheme(
      { '--vscode-panel-border': '', '--vscode-widget-border': '#202020' },
      'dark',
    ).tokens;
    assert.equal(tokens['--line'], '#202020');
  });

  it('drops a value the board itself would refuse, rather than sending it to be dropped there', () => {
    // The board validates what arrives and warns on ITS console, which is not a
    // console anybody working in VS Code is looking at.
    const tokens = mapVscodeTheme(
      { '--vscode-editor-background': '#fff; background: url(x)', '--vscode-button-background': '#181818' },
      'dark',
    ).tokens;
    assert.ok(!('--bg' in tokens));
    assert.equal(tokens['--accent'], '#181818');
    // And with no ground there is no ramp either: the three layers are a
    // function of `--bg`, so a rejected ground takes them with it and the board
    // keeps its own complete set of four rather than three derived from nothing.
    for (const layer of ['--sunken', '--surface', '--raised']) {
      assert.ok(!(layer in tokens), `${layer} was derived from a ground that was refused`);
    }
  });

  it('covers every variable it asks the page for', () => {
    // VSCODE_VARS is what `media/panel.html` is told to read. A name in it that
    // maps to nothing is a variable read for no reason; a source missing from it
    // is a token that can never resolve in a real window, and no unit test that
    // hands `mapVscodeTheme` a literal would ever notice.
    //
    // The fixture has to be READABLE, not merely complete — the same lesson as
    // the note below, learned twice. Black on black is a legal palette that
    // resolves every token and then loses three of them to the contrast guard,
    // so this probe would read "--text, --muted and --dim map to nothing" while
    // the guard was doing its job perfectly. Every source that feeds one of the
    // three GROUND tokens is white here; everything else is black.
    const GROUNDS = [
      '--vscode-editor-background',
      '--vscode-input-background',
      '--vscode-editorWidget-background',
      '--vscode-sideBar-background',
      '--vscode-panel-background',
    ];
    const vars: Record<string, string> = {};
    for (const name of VSCODE_VARS) {
      vars[name] = GROUNDS.includes(name) ? '#ffffff' : '#000000';
    }
    const { tokens } = mapVscodeTheme(vars, 'dark');
    assert.deepEqual(Object.keys(tokens).sort(), [...BOARD_TOKENS].sort());

    // One variable at a time, over a ground so the contrast guard is not the
    // thing under test here. (It was, on the first run of this assertion: with
    // no `--bg` to measure against, `editor.foreground` alone mapped to nothing
    // and this read as a dead variable name. The guard was right; the probe was
    // asking the wrong question.)
    for (const name of VSCODE_VARS) {
      const alone = mapVscodeTheme({ '--vscode-editor-background': '#ffffff', [name]: '#123456' }, 'dark').tokens;
      const least = name === '--vscode-editor-background' ? 1 : 2;
      assert.ok(Object.keys(alone).length >= least, `${name} is read from the page and maps to nothing`);
    }
  });
});

describe('the depth ramp', () => {
  // The property the old mapping could not hold, and the whole reason the ramp
  // is derived: `bg → sunken → surface → raised` is an ORDER. VS Code's
  // registered colours have no ordering relationship to each other — they answer
  // different questions — so borrowing three of them produced a "ramp" whose
  // steps could sit in any sequence, and on FireFly Pro two of them did.
  const grounds = ['#000000', '#0a0f17', '#1f1f1f', '#101010', '#2b2b2b', '#ffffff', '#f8f8f8', '#e0e4ea'];

  it('runs away from the ground, in the direction the variant demands', () => {
    for (const kind of ['dark', 'light'] as const) {
      for (const bg of grounds) {
        const ramp = depthRamp(bg, kind);
        const lum = (hex: string) => {
          const c = parseColor(hex)!;
          return c.r + c.g + c.b;
        };
        const steps = [bg, ramp['--sunken']!, ramp['--surface']!, ramp['--raised']!];
        for (let i = 1; i < steps.length; i++) {
          const moved = lum(steps[i]!) - lum(steps[i - 1]!);
          // Clamping at the ends of the range can flatten a step to zero — a
          // dark ramp from #ffffff has nowhere to go — but it must never
          // REVERSE, which is the failure that put --sunken below --bg.
          if (kind === 'dark') {
            assert.ok(moved >= 0, `${kind} ramp from ${bg} went down at step ${i}: ${steps.join(' → ')}`);
          } else {
            assert.ok(moved <= 0, `${kind} ramp from ${bg} went up at step ${i}: ${steps.join(' → ')}`);
          }
        }
      }
    }
  });

  it('reproduces the board’s own palette when the ground is the board’s own', () => {
    // The steps are not invented here: they are app.css's, so a panel on a board
    // -coloured editor is the board. This is the assertion that says the numbers
    // in RAMP still mean what their comment claims.
    assert.deepEqual(depthRamp('#000000', 'dark'), {
      '--sunken': '#0a0a0a',
      '--surface': '#151515',
      '--raised': '#202020',
    });
  });

  it('keeps the ground’s hue rather than greying it', () => {
    // FireFly Pro's ground is a blue-black. A layer that neutralised it would
    // read as a grey card floating on a blue page — which is what borrowing
    // button.secondaryBackground did.
    const ramp = depthRamp('#0a0f17', 'dark');
    assert.deepEqual(ramp, { '--sunken': '#141921', '--surface': '#1f242c', '--raised': '#2a2f37' });
    for (const hex of Object.values(ramp)) {
      const { r, g, b } = parseColor(hex)!;
      assert.ok(b > g && g > r, `${hex} lost the ground’s blue tint`);
    }
  });

  it('sends nothing at all when the ground cannot be read', () => {
    assert.deepEqual(depthRamp('Canvas', 'dark'), {});
    assert.deepEqual(depthRamp('', 'light'), {});
  });
});

describe('the contrast guard', () => {
  it('keeps the text hierarchy when the theme earns it', () => {
    const { tokens } = mapVscodeTheme(READABLE, 'light');
    assert.equal(tokens['--text'], '#111111');
    assert.equal(tokens['--muted'], '#222222');
    assert.equal(tokens['--dim'], '#444444');
  });

  it('drops all three when ONE of them misses AAA', () => {
    // The hierarchy travels as a group. The host's `--text` above the board's
    // `--dim` is two palettes stacked, and the reader cannot tell which of the
    // three greys is meant to be the quiet one.
    const tokens = mapVscodeTheme({ ...READABLE, '--vscode-descriptionForeground': '#999999' }, 'light').tokens;
    assert.ok(contrast('#999999', '#ffffff')! < AAA);
    assert.ok(!('--text' in tokens), 'the readable --text went too, because the group did');
    assert.ok(!('--muted' in tokens));
    assert.ok(!('--dim' in tokens));
    // And the backgrounds still travel: the board belongs in the window, it just
    // keeps its own type.
    assert.equal(tokens['--bg'], '#ffffff');
  });

  it('fires on VS Code’s own Dark+, and that is the honest answer', () => {
    // `descriptionForeground` #9d9d9d on `editor.background` #1f1f1f is ~6.1:1.
    // The board pins its type to 7:1 because most of it is small — `--dim`
    // carries hints at 0.83rem — so the default theme does not get to set it.
    const ratio = contrast(DARK_PLUS['--vscode-descriptionForeground']!, DARK_PLUS['--vscode-editor-background']!)!;
    assert.ok(ratio > 5 && ratio < AAA, `Dark+ description contrast came out at ${ratio}`);
    const { tokens } = mapVscodeTheme(DARK_PLUS, 'dark');
    assert.ok(!('--text' in tokens));
    assert.ok(!('--dim' in tokens));
    assert.equal(tokens['--bg'], '#1f1f1f');
    assert.equal(tokens['--accent'], '#0078d4');
  });

  it('measures every ground it is sending, not just the page ground', () => {
    // `docs/reference/theme.md`: text is pinned "on the page ground, `--sunken`
    // and `--surface`" — three grounds. A guard that reads only `--bg` passes
    // text that misses the pin exactly where most of the board's small type
    // sits: on panels and cards.
    //
    // Since the ramp became derived this is STRICTER, and deliberately: the two
    // lower grounds are now always present whenever `--bg` is, so there is no
    // longer a case where the guard has only the page ground to go on. It
    // measures what will actually be painted. Measured, not invented: #545454 is
    // 7.57:1 on white and 6.76:1 on the `--surface` derived from it.
    const vars = {
      '--vscode-editor-background': '#ffffff',
      '--vscode-editor-foreground': '#545454',
      '--vscode-foreground': '#545454',
      '--vscode-descriptionForeground': '#545454',
    };
    assert.ok(contrast('#545454', '#ffffff')! >= AAA, 'the ground alone would have passed this');
    assert.ok(contrast('#545454', '#f2f2f2')! < AAA);

    const { tokens } = mapVscodeTheme(vars, 'light');
    assert.ok(!('--text' in tokens), 'text passed on --bg and failed on --surface, and was sent anyway');
    assert.ok(!('--muted' in tokens));
    assert.ok(!('--dim' in tokens));
    // The surfaces still travel: this is the same trade as everywhere else here.
    assert.equal(tokens['--bg'], '#ffffff');
    assert.equal(tokens['--surface'], '#f2f2f2');
  });

  it('derives grounds the contrast maths can always read', () => {
    // This replaces a test that fed `input.background: Canvas` — a keyword the
    // board accepts and the contrast maths cannot read — and asserted the guard
    // failed closed on it. `--sunken` has no source any more, so that case is
    // unreachable through it: a derived ground is `#rrggbb` by construction.
    //
    // Which is worth pinning rather than just deleting, because it is the reason
    // the guard's remaining unreadable-ground case is `--bg` alone (the next
    // test). A ground that arrives as a keyword can no longer poison the three
    // layers under it.
    const { tokens } = mapVscodeTheme({ ...READABLE, '--vscode-input-background': 'Canvas' }, 'light');
    for (const layer of ['--sunken', '--surface', '--raised']) {
      assert.match(tokens[layer]!, /^#[0-9a-f]{6}$/, `${layer} is not a readable colour`);
    }
    assert.ok(!Object.values(tokens).includes('Canvas'), 'a keyword reached the payload as a ground');
  });

  it('fails closed when the ground is missing or unreadable', () => {
    // No `--bg` means nothing to measure against. Sending text colours anyway
    // would be trading readability for fidelity on a guess.
    const noGround = mapVscodeTheme({ '--vscode-editor-foreground': '#111111' }, 'light').tokens;
    assert.ok(!('--text' in noGround));

    const badGround = mapVscodeTheme(
      { '--vscode-editor-background': 'canvas', '--vscode-editor-foreground': '#111111' },
      'light',
    ).tokens;
    assert.ok(!('--text' in badGround));
  });

  it('lets a high-contrast theme through, which is the point of one', () => {
    const hc = {
      '--vscode-editor-background': '#000000',
      '--vscode-editor-foreground': '#ffffff',
      '--vscode-foreground': '#ffffff',
      '--vscode-descriptionForeground': '#ffffff',
      '--vscode-contrastBorder': '#6fc3df',
    };
    const { kind, tokens } = mapVscodeTheme(hc, 'high-contrast');
    assert.equal(kind, 'dark');
    assert.equal(tokens['--text'], '#ffffff');
    assert.equal(tokens['--line-strong'], '#6fc3df');
    assert.equal(tokens['--status-done'], '#6fc3df');
  });
});
