import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { chooseStartCommand, isOnPath } from '../src/launch';

describe('chooseStartCommand', () => {
  it('offers aboard serve when the dedicated binary is there', () => {
    assert.deepEqual(chooseStartCommand({ aboard: true, ape: false }), {
      ok: true,
      command: 'aboard',
      args: ['serve'],
      display: 'aboard serve',
    });
  });

  it('offers ape aboard serve when only ape is there', () => {
    assert.deepEqual(chooseStartCommand({ aboard: false, ape: true }), {
      ok: true,
      command: 'ape',
      args: ['aboard', 'serve'],
      display: 'ape aboard serve',
    });
  });

  it('prefers aboard when both are there', () => {
    // Recorded in docs/handoff.md §6: plan-1 states no preference, so this is
    // the extension's call and it is a call, not an accident of ordering.
    assert.equal((chooseStartCommand({ aboard: true, ape: true }) as { display: string }).display, 'aboard serve');
  });

  it('names both commands when neither is there, rather than doing nothing', () => {
    const choice = chooseStartCommand({ aboard: false, ape: false });
    assert.equal(choice.ok, false);
    const { message } = choice as { message: string };
    assert.match(message, /aboard serve/);
    assert.match(message, /ape aboard serve/);
  });
});

describe('isOnPath', () => {
  const executables = new Set([path.posix.join('/opt/bin', 'aboard'), path.posix.join('/usr/bin', 'ape')]);
  const exists = (p: string) => executables.has(p);

  it('finds a binary in any PATH entry', () => {
    assert.equal(isOnPath('aboard', { PATH: '/usr/bin:/opt/bin' }, exists, 'linux'), true);
    assert.equal(isOnPath('ape', { PATH: '/usr/bin:/opt/bin' }, exists, 'linux'), true);
  });

  it('says no when it is not there', () => {
    assert.equal(isOnPath('aboard', { PATH: '/usr/bin' }, exists, 'linux'), false);
    assert.equal(isOnPath('aboard', {}, exists, 'linux'), false);
  });

  it('tries the PATHEXT suffixes on Windows', () => {
    const win = new Set(['C:\\tools\\aboard.EXE']);
    assert.equal(isOnPath('aboard', { PATH: 'C:\\tools', PATHEXT: '.COM;.EXE' }, (p) => win.has(p), 'win32'), true);
    assert.equal(isOnPath('aboard', { PATH: 'C:\\tools', PATHEXT: '.COM' }, (p) => win.has(p), 'win32'), false);
  });
});
