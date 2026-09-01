import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { chooseStartCommand, hasApeAboard, isApexProject, isOnPath } from '../src/launch';

const ABOARD = { ok: true, command: 'aboard', args: ['serve'], display: 'aboard serve' };
const APE = { ok: true, command: 'ape', args: ['aboard', 'serve'], display: 'ape aboard serve' };

describe('chooseStartCommand', () => {
  it('offers aboard serve when the dedicated binary is the only one', () => {
    assert.deepEqual(chooseStartCommand({ aboard: true, apeAboard: false, apexProject: false }), ABOARD);
  });

  it('offers ape aboard serve when it is the only one', () => {
    assert.deepEqual(chooseStartCommand({ aboard: false, apeAboard: true, apexProject: false }), APE);
  });

  it('errors naming both when neither is available', () => {
    const choice = chooseStartCommand({ aboard: false, apeAboard: false, apexProject: true });
    assert.equal(choice.ok, false);
    const { message } = choice as { message: string };
    assert.match(message, /aboard serve/);
    assert.match(message, /ape aboard serve/);
  });

  describe('when both are usable, the PROJECT decides', () => {
    // Both hosts drive the same .aboard/, so the tie-break is about which
    // toolchain the project already standardises on. Recorded in
    // `docs/reference/discovery-and-start.md`, "Starting a board".
    it('prefers ape aboard in an _apex project', () => {
      assert.deepEqual(chooseStartCommand({ aboard: true, apeAboard: true, apexProject: true }), APE);
    });

    it('prefers aboard when there is no _apex', () => {
      assert.deepEqual(chooseStartCommand({ aboard: true, apeAboard: true, apexProject: false }), ABOARD);
    });
  });

  describe('_apex breaks a tie; it never conjures a binary', () => {
    // The rule that matters most, because getting it wrong offers a command the
    // machine cannot run — which is the defect the capability probe exists for.
    it('does not offer ape in an _apex project when ape has no mount', () => {
      assert.deepEqual(chooseStartCommand({ aboard: true, apeAboard: false, apexProject: true }), ABOARD);
    });

    it('still offers ape outside an _apex project when it is all there is', () => {
      assert.deepEqual(chooseStartCommand({ aboard: false, apeAboard: true, apexProject: false }), APE);
    });
  });
});

describe('hasApeAboard', () => {
  // Presence on PATH was the old test and it was wrong: ape only grew the mount
  // in v0.0.55, so an older one is on PATH, is real, and has no `aboard`
  // subcommand — the extension then offered a command that does not exist and
  // reported a 10s timeout instead of the cause.
  it('is true when the subcommand answers', () => {
    assert.equal(hasApeAboard(() => undefined), true);
  });

  it('is false when it does not', () => {
    assert.equal(
      hasApeAboard(() => {
        throw new Error('unknown command "aboard" for "ape"');
      }),
      false,
    );
  });

  it('asks the cheapest thing that can only work if the mount is there', () => {
    let asked: [string, string[]] | undefined;
    hasApeAboard((cmd, args) => {
      asked = [cmd, args];
    });
    assert.deepEqual(asked, ['ape', ['aboard', '--version']]);
  });
});

describe('isApexProject', () => {
  const io = (dirs: string[]) => ({ isDirectory: (p: string) => dirs.includes(p) });

  it('is true when the project root holds _apex', () => {
    assert.equal(isApexProject('/w/proj', io([path.join('/w/proj', '_apex')])), true);
  });

  it('is false when it does not', () => {
    assert.equal(isApexProject('/w/proj', io([])), false);
  });

  // No walk-up, deliberately: the board is started IN this directory, and a rule
  // the human cannot check by looking at the folder they opened surprises them.
  it('does not climb to a parent', () => {
    assert.equal(isApexProject('/w/proj/sub', io([path.join('/w/proj', '_apex')])), false);
  });

  it('is false rather than throwing when the path cannot be read', () => {
    assert.equal(
      isApexProject('/w/proj', {
        isDirectory() {
          throw new Error('EACCES');
        },
      }),
      false,
    );
  });
});

describe('isOnPath', () => {
  const executables = new Set([path.posix.join('/opt/bin', 'aboard'), path.posix.join('/usr/bin', 'ape')]);
  const exists = (p: string) => executables.has(p);

  it('finds an executable anywhere on PATH', () => {
    assert.equal(isOnPath('aboard', { PATH: '/usr/bin:/opt/bin' }, exists, 'linux'), true);
    assert.equal(isOnPath('ape', { PATH: '/usr/bin:/opt/bin' }, exists, 'linux'), true);
  });

  it('is false when it is not there, and when PATH is empty', () => {
    assert.equal(isOnPath('aboard', { PATH: '/usr/bin' }, exists, 'linux'), false);
    assert.equal(isOnPath('aboard', {}, exists, 'linux'), false);
  });
});
