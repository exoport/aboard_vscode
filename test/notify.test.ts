// The nudge button in the view title, and the context key that lights it.
//
// **The defect this file exists for**, from the human's §11 run on 2026-08-26:
// *"the poke in the terminal exited ok, the notification icon was not lit"*. The
// release worked. The INDICATOR did not: only the status-bar item changed, and
// the view-title button — the one thing on screen whose whole job is to say
// *somebody is blocked on you* — was one static icon in both states.
//
// So what is asserted here is the transition, not the poke: `aboard.waiting`
// goes true when a session parks, and false again when it is released. VS Code
// draws the two states from it (`view/title` in package.json), and a context key
// is the only part of that a test outside a real host can see — which is exactly
// why the stub records `setContext`.
//
// The two sources are covered separately because they fail separately: the
// `waiters` frame is only sent when the count CHANGES, so a session that parked
// BEFORE this window opened is invisible to it, and the `/waiters` read on
// reload is the only thing that catches it.

import * as assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { runExtension, sleep, startFakeBoard, until, type FakeBoard } from './fakeboard';

let board: FakeBoard;

before(async () => {
  board = await startFakeBoard();
});

after(async () => {
  await board.stop();
});

/** The key as VS Code would evaluate it in a `when` clause. */
function waitingKey(vscode: typeof import('./vscode-stub')): unknown {
  return vscode.probe.contexts.get('aboard.waiting');
}

describe('the nudge indicator', { timeout: 30_000 }, () => {
  it('lights from a waiters frame, and goes out when the session is released', async () => {
    board.waiting = 0;
    const { vscode, dispose } = runExtension(board.projectDir);
    try {
      await until('the tree to list the board’s tabs', 10_000, () =>
        vscode.probe.rows.some((r) => r.description === 'ab71'),
      );
      // Nobody waiting: the key is explicitly false, not merely absent. An
      // absent key evaluates false in a `when` clause too, but only a set one
      // survives the moment it has to go back DOWN.
      assert.equal(waitingKey(vscode), false, 'an idle board should say so out loud');

      // A session parks on `aboard wait`. The server announces the new count.
      board.waiting = 1;
      board.pushWaiters();
      await until('the button to light', 5000, () => waitingKey(vscode) === true);

      // And the status bar, which was the ONLY thing that used to change.
      assert.match(vscode.probe.status?.text ?? '', /nudge 1/);
      assert.match(vscode.probe.status?.tooltip ?? '', /parked on `aboard wait`/);

      // The human presses the button. Either of the two view-title commands is the
      // same handler; this is the one the status bar is wired to.
      const notify = vscode.probe.commands.get('aboard.nudge');
      assert.ok(notify, 'aboard.nudge is not registered');
      await notify();

      assert.equal(board.pokes.length, 1, 'the button did not poke the board');
      assert.equal(board.pokes[0]!.by, 'human', 'a poke from the sidebar is the human pressing it');
      assert.equal(waitingKey(vscode), false, 'the button stayed lit after the session was released');
      assert.ok(
        vscode.probe.notifications.some((n) => n.level === 'info' && /Released 1 waiting session\./.test(n.message)),
        `expected a "released" notice, got ${JSON.stringify(vscode.probe.notifications)}`,
      );
    } finally {
      dispose();
    }
  });

  it('lights for a session that parked before the window opened', async () => {
    // The `waiters` frame is only sent on a CHANGE, so this session announces
    // itself to nobody: `GET /waiters` on the first reload is the only thing
    // that can find it. Without that read the sidebar says "nothing to notify"
    // while somebody is blocked on exactly that button.
    board.waiting = 2;
    board.pokes.length = 0;
    const { vscode, dispose } = runExtension(board.projectDir);
    try {
      await until('the button to light from the /waiters read', 10_000, () => waitingKey(vscode) === true);
      assert.match(vscode.probe.status?.text ?? '', /nudge 2/);
      // No frame was ever pushed. Proving the negative matters here: if a frame
      // had arrived, this test would pass for the wrong reason and the seeding
      // read could be deleted without anything going red.
      assert.deepEqual(board.pokes, []);
    } finally {
      dispose();
    }
  });

  it('puts the button out when the board goes away', async () => {
    board.waiting = 1;
    const { vscode, dispose } = runExtension(board.projectDir);
    try {
      await until('the button to light', 10_000, () => waitingKey(vscode) === true);

      // The workspace loses its folder: discovery finds nothing, and a lit button
      // must not outlive the board that justified it.
      vscode.workspace.workspaceFolders = [];
      const refresh = vscode.probe.commands.get('aboard.refresh');
      assert.ok(refresh, 'aboard.refresh is not registered');
      await refresh();
      await until('the button to go out', 5000, () => waitingKey(vscode) === false);
      assert.equal(vscode.probe.status, undefined, 'the status item should be hidden with no board');
    } finally {
      dispose();
    }
  });

  it('registers a command for each state, and they do the same thing', async () => {
    // Two commands rather than one, because a `view/title` entry takes its icon
    // AND its tooltip from the command — there is no per-entry override — so the
    // lit and unlit states cannot be the same id. They must not be able to drift
    // into doing different things.
    board.waiting = 1;
    board.pokes.length = 0;
    const { vscode, dispose } = runExtension(board.projectDir);
    try {
      await until('the button to light', 10_000, () => waitingKey(vscode) === true);
      const lit = vscode.probe.commands.get('aboard.nudgeWaiting');
      assert.ok(lit, 'aboard.nudgeWaiting is not registered — the lit button would do nothing');
      await lit();
      assert.equal(board.pokes.length, 1, 'the lit button did not poke');
      assert.equal(waitingKey(vscode), false);

      board.waiting = 0;
      const idle = vscode.probe.commands.get('aboard.nudgeIdle');
      assert.ok(idle, 'aboard.nudgeIdle is not registered — the unlit button would do nothing');
      await idle();
      // An honest answer rather than a poke nobody is listening for.
      assert.equal(board.pokes.length, 1, 'pressing the unlit button poked a board with nobody on it');
      assert.ok(
        vscode.probe.notifications.some((n) => /No agent is waiting/.test(n.message)),
        'the unlit button should say that nobody is waiting',
      );
    } finally {
      dispose();
    }
  });

  it('follows the count down to zero from a frame alone', async () => {
    // A waiter that times out or hangs up releases itself; the server
    // broadcasts the new count and nothing else happens. The button has to follow.
    board.waiting = 1;
    const { vscode, dispose } = runExtension(board.projectDir);
    try {
      await until('the button to light', 10_000, () => waitingKey(vscode) === true);
      board.waiting = 0;
      board.pushWaiters();
      await until('the button to go out', 5000, () => waitingKey(vscode) === false);
      await sleep(50);
      assert.match(vscode.probe.status?.text ?? '', /aboard 93ba033/, 'the status bar should go back to the version');
    } finally {
      dispose();
    }
  });
  it('puts the button out when the board turns out to have nobody on it', async () => {
    // The count the sidebar holds can be stale, and the server drops a `waiters`
    // frame rather than queueing it for a client that is not keeping up
    // (`fanout` in pkg/aboard/server.go is a non-blocking send with a
    // `default:`). So the button can be lit over a board with nobody on it — and
    // the ONE moment the extension is certain of the truth is when it has just
    // asked. Pressing the button used to say "No session is waiting" and leave it
    // lit with the status bar reading `nudge 1` behind the notice: the
    // message and the screen contradicting each other is the same defect this
    // whole item is about, wearing the other sign.
    board.waiting = 1;
    board.pokes.length = 0;
    const { vscode, dispose } = runExtension(board.projectDir);
    try {
      await until('the button to light', 10_000, () => waitingKey(vscode) === true);
      // The waiter goes away and the frame announcing it never arrives.
      board.waiting = 0;
      const notify = vscode.probe.commands.get('aboard.nudge');
      assert.ok(notify);
      await notify();
      assert.deepEqual(board.pokes, [], 'there was nobody to poke');
      assert.ok(
        vscode.probe.notifications.some((n) => /No agent is waiting/.test(n.message)),
        'the honest answer is still the honest answer',
      );
      assert.equal(waitingKey(vscode), false, 'the button contradicted the notice it had just shown');
      assert.match(vscode.probe.status?.text ?? '', /aboard 93ba033/);
    } finally {
      dispose();
    }
  });

  it('re-reads the count when the event stream comes back', async () => {
    // Every frame sent while the stream was down is lost, and the waiter count
    // is the one piece of state here with no other refresh path: the tree is
    // re-read on a `state` frame, but a session parking during the gap produces
    // no state change at all. Without this the button stays dark until something
    // unrelated writes to the board, or the human presses Refresh — and the
    // human presses Refresh because the button is dark.
    board.waiting = 0;
    const { vscode, dispose } = runExtension(board.projectDir);
    try {
      await until('the tree to list the board’s tabs', 10_000, () =>
        vscode.probe.rows.some((r) => r.description === 'ab71'),
      );
      assert.equal(waitingKey(vscode), false);

      // A session parks while the stream is down, so its frame reaches nobody.
      board.waiting = 3;
      board.dropStreams();

      // The reconnect is what has to notice. `backoffDelay(1)` is 1s.
      await until('the button to light after the reconnect', 15_000, () => waitingKey(vscode) === true);
      assert.match(vscode.probe.status?.text ?? '', /nudge 3/);
    } finally {
      dispose();
    }
  });
});
