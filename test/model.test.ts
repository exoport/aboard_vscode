import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import type { Capabilities, Doc } from '../src/board';
import {
  approveRemoval,
  badgeCount,
  denyRemoval,
  dismissChange,
  dotFor,
  frameSrc,
  referenceFor,
  renameTab,
  schemaMismatch,
  setNote,
  tabItems,
  typeLabels,
} from '../src/model';

const caps: Capabilities = {
  app: 'aboard',
  schema: 3,
  types: [
    { type: 'kanban', label: 'Kanban' },
    { type: 'dag', label: 'Plan' },
  ],
};

const doc = (): Doc => ({
  version: 3,
  rev: 41,
  nextId: 200,
  tabs: [
    { id: 'bb71', name: 'Build queue', type: 'kanban', note: 'where work lands' },
    { id: 'bb1', name: '', type: 'dag', touched: { by: 'agent-1', at: '2026-08-25T10:00:00Z', note: 'added a node' } },
    { id: 'bb9', name: 'Old', type: 'markup', pendingRemoval: { by: 'agent-2', at: 'now', reason: 'superseded' } },
    {
      id: 'bb12',
      name: 'Both',
      type: 'kanban',
      touched: { by: 'agent-1', at: 'now' },
      pendingRemoval: { by: 'agent-1', at: 'now' },
    },
  ],
});

describe('tabItems', () => {
  it('keeps document order — the order is the human’s', () => {
    assert.deepEqual(
      tabItems(doc(), typeLabels(caps)).map((i) => i.id),
      ['bb71', 'bb1', 'bb9', 'bb12'],
    );
  });

  it('labels an unnamed tab the way the board does, and shows the id as the description', () => {
    const items = tabItems(doc(), typeLabels(caps));
    assert.equal(items[1]!.label, '(unnamed)');
    assert.equal(items[1]!.description, 'bb1');
  });

  it('takes the type label from /capabilities and falls back to the raw type', () => {
    const items = tabItems(doc(), typeLabels(caps));
    assert.match(items[0]!.tooltip, /`bb71` · Kanban/);
    // `markup` is not in this manifest: a sixteenth renderer must need no change
    // here, so an unknown type shows its own name rather than nothing.
    assert.match(items[2]!.tooltip, /`bb9` · markup/);
  });

  it('puts the note in the tooltip verbatim', () => {
    assert.match(tabItems(doc(), typeLabels(caps))[0]!.tooltip, /where work lands/);
  });

  it('names who touched a tab, and why a removal was asked for', () => {
    const items = tabItems(doc(), typeLabels(caps));
    assert.match(items[1]!.tooltip, /Changed by `agent-1`/);
    assert.match(items[2]!.tooltip, /\*\*Removal requested\*\* by `agent-2`: superseded/);
  });
});

describe('dotFor', () => {
  it('is undefined for an untouched tab', () => {
    assert.equal(dotFor(doc().tabs[0]!), undefined);
  });

  it('is a change dot for a touched tab', () => {
    assert.equal(dotFor(doc().tabs[1]!), 'change');
  });

  it('is a removal dot for a removal request', () => {
    assert.equal(dotFor(doc().tabs[2]!), 'removal');
  });

  it('lets removal win when a tab has both', () => {
    // A removal request is a question; a change is a notification. Hiding the
    // question behind the notification would be exactly backwards.
    assert.equal(dotFor(doc().tabs[3]!), 'removal');
  });
});

describe('contextValue', () => {
  it('carries both facts, so the menu can key off either', () => {
    const items = tabItems(doc(), typeLabels(caps));
    assert.equal(items[0]!.contextValue, 'tab');
    assert.equal(items[1]!.contextValue, 'tab.touched');
    assert.equal(items[2]!.contextValue, 'tab.removal');
    assert.equal(items[3]!.contextValue, 'tab.removal.touched');
  });
});

describe('badgeCount', () => {
  it('counts touched tabs only', () => {
    assert.equal(badgeCount(doc()), 2);
  });

  it('is zero for a board nobody has touched', () => {
    assert.equal(badgeCount({ tabs: [{ id: 'bb1', type: 'dag' }] }), 0);
  });
});

describe('schemaMismatch', () => {
  it('says nothing when the document and the server agree', () => {
    assert.equal(schemaMismatch(doc(), caps), undefined);
  });

  it('says something visible when they do not', () => {
    const drift = schemaMismatch({ ...doc(), version: 2 }, caps);
    assert.match(String(drift), /schema v2/);
    assert.match(String(drift), /v3/);
  });

  it('stays quiet when either side is unknown, rather than guessing', () => {
    assert.equal(schemaMismatch({ tabs: [] }, caps), undefined);
    assert.equal(schemaMismatch(doc(), {}), undefined);
  });
});

describe('referenceFor', () => {
  it('builds the same deep link the board’s own menu copies', () => {
    assert.equal(referenceFor('http://127.0.0.1:41234/', 'bb71'), 'http://127.0.0.1:41234/#tab=bb71');
    assert.equal(referenceFor('http://127.0.0.1:41234/b/', 'bb71', 'bb9'), 'http://127.0.0.1:41234/b/#tab=bb71&node=bb9');
  });
});

describe('frameSrc', () => {
  it('asks for the tab strip to be hidden', () => {
    assert.match(frameSrc('http://127.0.0.1:41234/', 'bb71', 1), /\?chrome=notabs/);
  });

  it('changes on every call, or the fragment fires no hashchange', () => {
    const a = frameSrc('http://127.0.0.1:41234/', 'bb71', 1);
    const b = frameSrc('http://127.0.0.1:41234/', 'bb71', 2);
    assert.notEqual(a, b);
    assert.match(a, /#tab=bb71&r=1$/);
  });

  it('has no fragment at all before a tab is chosen', () => {
    assert.equal(frameSrc('http://127.0.0.1:41234/', undefined, 0), 'http://127.0.0.1:41234/?chrome=notabs');
  });
});

describe('the edits', () => {
  it('dismiss drops the marker, and reports nothing to do when there is none', () => {
    const d = doc();
    assert.equal(dismissChange('bb1')(d), true);
    assert.equal('touched' in d.tabs[1]!, false);
    assert.equal(dismissChange('bb71')(doc()), false);
    assert.equal(dismissChange('nope')(doc()), false);
  });

  it('approve removes the tab', () => {
    const d = doc();
    assert.equal(approveRemoval('bb9')(d), true);
    assert.deepEqual(
      d.tabs.map((t) => t.id),
      ['bb71', 'bb1', 'bb12'],
    );
    assert.equal(approveRemoval('bb9')(d), false);
  });

  it('deny keeps the tab and drops the request', () => {
    const d = doc();
    assert.equal(denyRemoval('bb9')(d), true);
    assert.equal(d.tabs.length, 4);
    assert.equal('pendingRemoval' in d.tabs[2]!, false);
    assert.equal(denyRemoval('bb71')(doc()), false);
  });

  it('rename sets the name and skips a no-op', () => {
    const d = doc();
    assert.equal(renameTab('bb71', 'Queue')(d), true);
    assert.equal(d.tabs[0]!.name, 'Queue');
    assert.equal(renameTab('bb71', 'Build queue')(doc()), false);
  });

  it('a note is trimmed, and an empty one removes the field rather than storing ""', () => {
    const d = doc();
    assert.equal(setNote('bb71', '  read me  ')(d), true);
    assert.equal(d.tabs[0]!.note, 'read me');
    assert.equal(setNote('bb71', '')(d), true);
    assert.equal('note' in d.tabs[0]!, false);
    assert.equal(setNote('bb71', '')(d), false);
  });
});

describe('the frameSrc prefix invariant', () => {
  // media/panel.html accepts a `goto` only when the src it was handed starts
  // with the one the frame was rendered with — the page's only navigation, and
  // the board's own html tabs are sandboxed frames that can reach window.top.
  // The check is worth nothing if this stops being true, and panel.html is a
  // file no unit test can load, so the invariant is asserted here instead.
  it('every tab src starts with the src the frame was rendered with', () => {
    for (const url of ['http://127.0.0.1:41234/', 'http://127.0.0.1:41234/brd/', 'https://x-41234.app.github.dev/']) {
      const initial = frameSrc(url, undefined, 0);
      for (const tab of ['bb1', 'bb71', 'bb999']) {
        for (const n of [1, 2, 17]) {
          assert.ok(
            frameSrc(url, tab, n).startsWith(initial),
            `${frameSrc(url, tab, n)} does not start with ${initial}`,
          );
        }
      }
    }
  });

  it('and panel.html actually performs that check', () => {
    const page = readFileSync(join(__dirname, '..', '..', 'media', 'panel.html'), 'utf8');
    assert.match(page, /ALLOWED/);
    assert.match(page, /e\.data\.src\.indexOf\(ALLOWED\) === 0/);
  });
});
