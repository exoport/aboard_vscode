// What `package.json` contributes — the half of both 2026-08-26 defects that no
// runtime test can see.
//
// The bell fix is mostly a manifest change: a context key is worthless unless two
// `view/title` entries read it, and a menu entry takes its icon and its tooltip
// from its COMMAND, so the lit and unlit bells have to be two command ids with
// two icons. Nothing in `node --test` renders a title bar, so the contributions
// are asserted as data. The commands they name are pressed for real in
// `notify.test.ts` and `copy.test.ts`; this file is the other half — that the
// human can reach them, and that they read as different things.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';

interface Contribution {
  command: string;
  title?: string;
  icon?: string;
  when?: string;
  group?: string;
}

const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'),
) as {
  activationEvents: string[];
  contributes: {
    commands: Contribution[];
    menus: Record<string, Contribution[]>;
    configuration?: {
      title?: string;
      properties?: Record<
        string,
        {
          type?: string;
          enum?: string[];
          enumDescriptions?: string[];
          default?: unknown;
          markdownDescription?: string;
        }
      >;
    };
  };
};

const commands = manifest.contributes.commands;
const byId = (id: string): Contribution => {
  const found = commands.find((c) => c.command === id);
  assert.ok(found, `no command contributes ${id}`);
  return found;
};
const menu = (where: string, id: string): Contribution[] =>
  (manifest.contributes.menus[where] ?? []).filter((m) => m.command === id);

describe('the notify bell', () => {
  it('has an unlit and a lit command, with different icons', () => {
    // `$(bell)` in both states is the defect: "the poke in the terminal exited
    // ok, the notification icon was not lit".
    assert.equal(byId('aboard.notifyIdle').icon, '$(bell)');
    assert.equal(byId('aboard.notifyWaiting').icon, '$(bell-dot)');
  });

  it('says which state it is in, because the title IS the tooltip', () => {
    assert.match(byId('aboard.notifyIdle').title!, /no session is waiting/i);
    // No backticks: VS Code renders a command title as plain text wherever it
    // appears — the palette, the button's tooltip — so markdown there is just
    // two stray characters on screen.
    assert.match(byId('aboard.notifyWaiting').title!, /parked on aboard wait/);
    assert.doesNotMatch(byId('aboard.notifyWaiting').title!, /`/);
  });

  it('shows exactly one of them at a time, on aboard.waiting', () => {
    const idle = menu('view/title', 'aboard.notifyIdle');
    const lit = menu('view/title', 'aboard.notifyWaiting');
    assert.equal(idle.length, 1);
    assert.equal(lit.length, 1);
    assert.equal(idle[0]!.when, 'view == aboard.tabs && !aboard.waiting');
    assert.equal(lit[0]!.when, 'view == aboard.tabs && aboard.waiting');
    // Same slot, so the bell does not move sideways when it lights.
    assert.equal(idle[0]!.group, lit[0]!.group);
    // And the generic id is not ALSO in the title bar, or there would be two
    // bells whenever the key is false.
    assert.deepEqual(menu('view/title', 'aboard.notify'), []);
  });

  it('keeps one plain entry in the command palette, and hides the two bells', () => {
    // Three ids for one action would be three palette entries saying almost the
    // same thing; the two decorated ones exist only to carry an icon.
    const hidden = (id: string) => {
      const entries = menu('commandPalette', id);
      assert.equal(entries.length, 1, `${id} should have exactly one commandPalette rule`);
      assert.equal(entries[0]!.when, 'false');
    };
    hidden('aboard.notifyIdle');
    hidden('aboard.notifyWaiting');
    assert.deepEqual(menu('commandPalette', 'aboard.notify'), [], 'the palette entry is the plain one');
    assert.equal(byId('aboard.notify').title, 'Notify Waiting Session');
  });

  it('activates on every one of them', () => {
    for (const id of ['aboard.notify', 'aboard.notifyIdle', 'aboard.notifyWaiting']) {
      assert.ok(
        manifest.activationEvents.includes(`onCommand:${id}`),
        `${id} can be pressed before the extension is awake`,
      );
    }
  });
});

describe('the two copy commands', () => {
  it('offers a reference AND a link, named as two different things', () => {
    // The defect: `aboard.copyReference` was titled "Copy Link to This Tab", so
    // the sidebar had two ways to copy an address and none to copy a reference.
    assert.equal(byId('aboard.copyReference').title, 'Copy Reference');
    assert.equal(byId('aboard.copyLink').title, 'Copy Link to This Tab');
  });

  it('puts both on a tab’s context menu, beside Copy Id', () => {
    const group = (id: string) => {
      const entries = menu('view/item/context', id);
      assert.equal(entries.length, 1, `${id} should appear once on a tab’s menu`);
      assert.match(entries[0]!.when!, /viewItem =~/);
      return entries[0]!.group!;
    };
    // One group, in one order: id, reference, link — narrowest to widest.
    assert.match(group('aboard.copyId'), /^3_copy@1$/);
    assert.match(group('aboard.copyReference'), /^3_copy@2$/);
    assert.match(group('aboard.copyLink'), /^3_copy@3$/);
  });
});

describe('the aboard.theme setting', () => {
  // A setting that exists only in code is a setting nobody can find: VS Code
  // builds the Settings UI from `contributes.configuration` and nothing else,
  // and `getConfiguration('aboard').get('theme')` returns undefined for a
  // property that was never contributed — which reads exactly like `follow`,
  // so the default would work and the switch would not.
  const setting = manifest.contributes.configuration?.properties?.['aboard.theme'];

  it('is contributed, with the two values the extension understands', () => {
    assert.ok(setting, 'package.json contributes no aboard.theme setting');
    assert.equal(setting.type, 'string');
    assert.deepEqual(setting.enum, ['follow', 'board']);
    assert.equal(setting.default, 'follow');
    assert.equal(setting.enumDescriptions?.length, setting.enum?.length);
  });

  it('says what the contrast guard does, because that is the surprising half', () => {
    // Following the theme and then NOT taking its text colours looks like a bug
    // if nobody says why — and it is the common case: VS Code's own Dark+ misses
    // the board's 7:1 pin on `descriptionForeground`.
    assert.match(setting!.markdownDescription!, /7:1|AAA/);
  });

  it('is read by src/extension.ts under exactly that name', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'extension.ts'), 'utf8');
    assert.match(source, /getConfiguration\('aboard'\)/);
    assert.match(source, /affectsConfiguration\('aboard\.theme'\)/);
  });
});

describe('every contributed command', () => {
  it('is registered by activate()', () => {
    // A menu item bound to an unregistered command is a row that does nothing
    // when pressed, with an error in a console the human is not reading.
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'extension.ts'), 'utf8');
    for (const contribution of commands) {
      assert.ok(
        source.includes(`on('${contribution.command}'`),
        `${contribution.command} is contributed but never registered`,
      );
    }
  });

  it('is reachable from somewhere', () => {
    // The palette shows it, or a menu does, or a tree row runs it on click —
    // `aboard.openTab` is only ever the third, which is why the check has to
    // know about that case rather than calling it dead. A command contributed
    // and reachable from nowhere is dead weight nobody can press.
    const menus = Object.values(manifest.contributes.menus).flat();
    const tree = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'tree.ts'), 'utf8');
    for (const contribution of commands) {
      const hiddenFromPalette = menus.some(
        (m) => m.command === contribution.command && m.when === 'false',
      );
      const shown =
        menus.some((m) => m.command === contribution.command && m.when !== 'false') ||
        tree.includes(`'${contribution.command}'`);
      assert.ok(shown || !hiddenFromPalette, `${contribution.command} is hidden everywhere`);
    }
  });
});
