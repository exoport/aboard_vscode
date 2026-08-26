// activate(): discover the boards in this workspace, put their tabs in the
// sidebar, and wire the human's actions to the writes the board already permits
// from a human.
//
// Everything with a rule worth arguing about lives in board.ts / model.ts /
// launch.ts / messages.ts, none of which import `vscode`. What is left here is
// adapter: VS Code objects in, those functions called, notifications out.

import * as vscode from 'vscode';

import {
  Board,
  BoardError,
  findAllInstances,
  findProjectRoot,
  verify,
  type Capabilities,
  type Edit,
  type Subscription,
} from './board';
import { chooseStartCommand, isOnPath } from './launch';
import {
  approveRemoval,
  denyRemoval,
  dismissChange,
  referenceFor,
  renameTab,
  schemaMismatch,
  setNote,
} from './model';
import { BoardPanel } from './panel';
import { BoardTreeProvider, type BoardEntry, type Node } from './tree';

const VIEW_ID = 'aboard.tabs';

/**
 * How many times a board's shell may be unreadable before the `?chrome=` probe
 * gives up on it for this window.
 *
 * Three, and then silence: a board that answers `/health` and `/aboard.json` but
 * not `/` is not a shape anybody has seen, and re-fetching a whole page on every
 * write to chase it would cost more than the sentence it might produce.
 */
const CHROME_PROBE_TRIES = 3;

class Controller implements vscode.Disposable {
  private readonly provider: BoardTreeProvider;
  private readonly view: vscode.TreeView<Node>;
  private readonly status: vscode.StatusBarItem;
  private readonly output: vscode.OutputChannel;

  private entries: BoardEntry[] = [];
  private streams = new Map<string, Subscription>();
  private panels = new Map<string, BoardPanel>();
  private caps = new Map<string, Capabilities>();
  private waiting = new Map<string, number>();
  private warnedSchema = new Set<string>();
  /**
   * Boards whose `?chrome=` answer is settled, or being asked for right now.
   *
   * Two states, and the `busy` one is the whole point: the probe is an await, so
   * a guard set on its far side lets every reload that lands in the meantime
   * start a probe of its own. See checkChromeContract.
   */
  private chromeProbe = new Map<string, 'busy' | 'done'>();
  /** How many times a board's shell could not be read at all. */
  private chromeUnreadable = new Map<string, number>();
  private reloadTimers = new Map<string, NodeJS.Timeout>();
  private discovering = false;
  private discoverAgain = false;
  private disposed = false;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.output = vscode.window.createOutputChannel('Aboard');
    this.provider = new BoardTreeProvider(context.extensionUri);
    this.view = vscode.window.createTreeView<Node>(VIEW_ID, {
      treeDataProvider: this.provider,
      showCollapseAll: false,
    });
    this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
    this.status.command = 'aboard.notify';
    context.subscriptions.push(this.output, this.view, this.status, this.provider);
  }

  /* ------------------------------------------------------------ discovery */

  async discover(): Promise<void> {
    if (this.disposed) {
      return;
    }
    if (this.discovering) {
      // A watcher event that lands mid-discovery used to be dropped on the
      // floor, and the event it drops is the interesting one: `serve` writes
      // the instance record while the previous discovery is still waiting on
      // /health for a board that has just died. Remembered and re-run once
      // instead — coalesced, so a burst is still one extra pass.
      this.discoverAgain = true;
      return;
    }
    this.discovering = true;
    try {
      const folders = (vscode.workspace.workspaceFolders ?? [])
        .filter((f) => f.uri.scheme === 'file')
        .map((f) => f.uri.fsPath);
      const candidates = findAllInstances(folders);
      const next: BoardEntry[] = [];
      for (const candidate of candidates) {
        const { board, reason } = await verify(candidate);
        if (board) {
          next.push({ board });
        } else {
          this.log(`ignoring ${candidate.instanceFile}: ${reason}`);
        }
      }

      // Drop streams for boards that are gone; open one for each new board.
      for (const [key, sub] of [...this.streams]) {
        if (!next.some((e) => e.board.instanceFile === key)) {
          sub.dispose();
          this.streams.delete(key);
          this.waiting.delete(key);
          // And the `?chrome=` verdict: a board that stopped is the one case
          // where the binary behind that key can change without a Refresh, so
          // keeping the answer would silently suppress the warning for a board
          // that came back on an OLDER binary.
          this.chromeProbe.delete(key);
          this.chromeUnreadable.delete(key);
          this.panels.get(key)?.dispose();
        }
      }
      for (const entry of next) {
        if (!this.streams.has(entry.board.instanceFile)) {
          this.streams.set(entry.board.instanceFile, this.subscribe(entry.board));
        }
      }

      this.entries = next;
      // Render BEFORE the reads. `reloadAll()` iterates the entries, so with
      // zero boards it did nothing at all and `setEntries` was never called —
      // a board that stopped left its tabs sitting in the sidebar, clickable,
      // with the badge still counting them and the welcome view unable to
      // appear because the tree still had children.
      this.render();
      // Two keys, not one. "No board is running" and "this workspace has nothing
      // to do with aboard" are different situations and deserve different words:
      // one is worth offering to fix, the other is the ordinary case for every
      // other project on the machine. See contributes.viewsWelcome.
      const roots = folders.map((f) => findProjectRoot(f)).filter((r): r is string => r !== undefined);
      await vscode.commands.executeCommand('setContext', 'aboard.hasBoard', next.length > 0);
      await vscode.commands.executeCommand('setContext', 'aboard.hasProject', roots.length > 0);
      await this.reloadAll();
    } finally {
      this.discovering = false;
    }
    if (this.discoverAgain && !this.disposed) {
      this.discoverAgain = false;
      await this.discover();
    }
  }

  private subscribe(board: Board): Subscription {
    return board.events({
      onState: () => this.scheduleReload(board),
      onWaiters: (count) => {
        this.waiting.set(board.instanceFile, count);
        this.renderStatus();
      },
      onStatus: (connected, detail) => {
        if (!connected) {
          this.log(`event stream for ${board.title} dropped: ${detail ?? 'unknown'} — reconnecting`);
        }
      },
    });
  }

  /**
   * Coalesce a burst of writes into one read.
   *
   * An `aboard apply` that touches several tabs, or an agent looping, produces a
   * frame each; refetching the whole document per frame would be a request storm
   * for one tree that ends up identical.
   */
  private scheduleReload(board: Board): void {
    const key = board.instanceFile;
    clearTimeout(this.reloadTimers.get(key));
    this.reloadTimers.set(
      key,
      setTimeout(() => {
        this.reloadTimers.delete(key);
        void this.reload(board);
      }, 120),
    );
  }

  private async reloadAll(): Promise<void> {
    await Promise.all(this.entries.map((entry) => this.reload(entry.board)));
  }

  private async reload(board: Board): Promise<void> {
    const entry = this.entries.find((e) => e.board.instanceFile === board.instanceFile);
    if (!entry) {
      return;
    }
    try {
      if (!this.caps.has(board.instanceFile)) {
        this.caps.set(board.instanceFile, await board.capabilities());
      }
      entry.caps = this.caps.get(board.instanceFile);
      entry.doc = await board.state();
      entry.problem = undefined;
      // The `waiters` frame is only sent when the count CHANGES, so a session
      // that parked on `aboard wait` before this window opened was invisible:
      // the status bar said "nothing to notify" while somebody was blocked on
      // exactly that button. Seeded here, then kept current by the frames.
      try {
        this.waiting.set(board.instanceFile, (await board.waiters()).waiting);
      } catch (err) {
        this.log(`${board.title}: could not read the waiter count: ${messageOf(err)}`);
      }
      const drift = schemaMismatch(entry.doc, entry.caps);
      if (drift) {
        // The row says so for as long as it is true; the notification fires
        // once. Tying both to the same guard meant the marker vanished on the
        // next refresh while the mismatch was still there — degrading visibly
        // for one frame is not degrading visibly.
        entry.problem = 'schema mismatch';
        if (!this.warnedSchema.has(board.instanceFile + drift)) {
          this.warnedSchema.add(board.instanceFile + drift);
          void vscode.window.showWarningMessage(drift);
        }
      }
    } catch (err) {
      entry.doc = undefined;
      entry.problem = messageOf(err);
      this.log(`${board.title}: ${entry.problem}`);
    }
    this.render();
    // Deliberately NOT awaited, and deliberately outside the try above: it is a
    // background probe that ends in a notification, not something the tree has
    // any reason to wait for, and a throw inside it must never be reported as
    // "this board would not hand over its document".
    void this.checkChromeContract(board);
  }

  /**
   * Say so, once, when the board is older than the `?chrome=` contract.
   *
   * The first real run of this extension showed the board's own tab strip inside
   * the panel, under the sidebar tree — two tab lists, one above the other. The
   * cause was not this extension: the board was served by a binary built before
   * `?chrome=` landed, and an unknown query parameter is silently ignored, so
   * nothing anywhere said why. This is the sentence that says why.
   *
   * A warning, not an error: everything still works, it is just ugly. Once per
   * board per window, and cleared by Refresh — which is what the human presses
   * after updating the binary and restarting `aboard serve`.
   */
  private async checkChromeContract(board: Board): Promise<void> {
    const key = board.instanceFile;
    // Claimed BEFORE the await, not after. `reload()` runs on every SSE frame,
    // and the guard used to be set on the far side of `supportsChrome()` — so an
    // agent writing while the probe was in flight drove a second reload, which
    // passed the guard and started a second probe. Measured against a shell that
    // took 600ms to answer: THREE notifications for one board, from the one
    // check in this extension whose entire contract is the word "once". Whoever
    // gets here first owns the answer; everyone else is already covered by it.
    if (this.chromeProbe.has(key)) {
      return;
    }
    this.chromeProbe.set(key, 'busy');
    const supported = await board.supportsChrome();
    if (this.disposed) {
      return;
    }
    if (supported === undefined) {
      // Could not tell. Saying nothing beats guessing at the board's age — but
      // the claim has to come back off, or a shell that was unreadable for one
      // moment is never asked again. Bounded, because the alternative is a fetch
      // of the whole shell on every write for the life of the window.
      const tries = (this.chromeUnreadable.get(key) ?? 0) + 1;
      this.chromeUnreadable.set(key, tries);
      if (tries < CHROME_PROBE_TRIES) {
        this.chromeProbe.delete(key);
        return;
      }
      this.chromeProbe.set(key, 'done');
      this.log(`${board.title}: could not read the board's shell to check ?chrome= after ${tries} tries — not asking again`);
      return;
    }
    this.chromeProbe.set(key, 'done');
    if (supported) {
      return;
    }
    const message =
      `The board serving ${board.title} (${board.instance.app} ${board.instance.version ?? 'of unknown version'}) ` +
      'predates the `?chrome=` contract this extension asks for, so it will draw its own tab strip inside the ' +
      'panel as well as here in the sidebar. Everything works; it is just doubled. Update the aboard binary and ' +
      'restart the board, then press Refresh.';
    this.log(`${board.title}: the board's shell does not understand ?chrome= — the tab strip will show in the panel`);
    void vscode.window.showWarningMessage(message);
  }

  private render(): void {
    this.provider.setEntries(this.entries);
    const badge = this.provider.badge;
    this.view.badge = badge > 0 ? { value: badge, tooltip: `${badge} tab${badge === 1 ? '' : 's'} changed` } : undefined;
    this.renderStatus();
  }

  private renderStatus(): void {
    if (this.entries.length === 0) {
      this.status.hide();
      return;
    }
    const waiting = [...this.waiting.values()].reduce((a, b) => a + b, 0);
    const version = this.entries[0]!.board.instance.version ?? '';
    this.status.text = waiting > 0 ? `$(bell-dot) aboard · notify ${waiting}` : `$(circuit-board) aboard ${version}`;
    this.status.tooltip =
      waiting > 0
        ? `${waiting} session${waiting === 1 ? '' : 's'} parked on \`aboard wait\` — click to release`
        : 'No session is waiting. The board is not listening; nothing to notify.';
    this.status.show();
  }

  /* -------------------------------------------------------------- helpers */

  private log(line: string): void {
    this.output.appendLine(`[${new Date().toISOString()}] ${line}`);
  }

  /** When two boards are open, an action from the palette has to ask which. */
  private async pickBoard(): Promise<Board | undefined> {
    if (this.entries.length === 0) {
      void vscode.window.showErrorMessage('No board is running for this workspace.');
      return undefined;
    }
    if (this.entries.length === 1) {
      return this.entries[0]!.board;
    }
    const picked = await vscode.window.showQuickPick(
      this.entries.map((e) => ({ label: e.board.title, description: `port ${e.board.port}`, board: e.board })),
      { placeHolder: 'Which board?' },
    );
    return picked?.board;
  }

  private async applyEdit(board: Board, edit: Edit, what: string): Promise<void> {
    try {
      const result = await board.write(edit);
      if (result.skipped) {
        this.log(`${what}: nothing to do`);
      }
      await this.reload(board);
    } catch (err) {
      const message = messageOf(err);
      this.log(`${what} failed: ${message}`);
      void vscode.window.showErrorMessage(`${what}: ${message}`);
    }
  }

  /* ------------------------------------------------------------- commands */

  async openPanel(board?: Board): Promise<BoardPanel | undefined> {
    const target = board ?? (await this.pickBoard());
    if (!target) {
      return undefined;
    }
    const existing = this.panels.get(target.instanceFile);
    if (existing) {
      existing.reveal();
      return existing;
    }
    const panel = await BoardPanel.create(target, this.context.extensionUri, {
      onActive: (tab) => this.revealTab(target, tab),
      onDispose: () => this.panels.delete(target.instanceFile),
    });
    this.panels.set(target.instanceFile, panel);
    return panel;
  }

  async openTab(node: Node): Promise<void> {
    if (node.kind !== 'tab') {
      return;
    }
    const panel = await this.openPanel(node.entry.board);
    await panel?.goto(node.item.id);
  }

  /**
   * The board told us it switched tabs. Move the highlight, and do not answer.
   *
   * Guarded twice: `reveal` does not run an item's `command`, so it cannot loop
   * back into a `goto` on its own, and the panel remembers the tab it was told
   * about so a later reveal has nothing to say.
   */
  private revealTab(board: Board, tabId: string): void {
    const node = this.provider.nodeFor(board, tabId);
    if (!node || !this.view.visible) {
      return;
    }
    void this.view.reveal(node, { select: true, focus: false }).then(undefined, () => {
      // A reveal races a refresh: the node can be gone by the time it runs.
      // Nothing to tell the human about.
    });
  }

  async notify(): Promise<void> {
    const board = await this.pickBoard();
    if (!board) {
      return;
    }
    try {
      const { waiting } = await board.waiters();
      if (waiting === 0) {
        // Saying so is the honest answer. A board with nothing waiting is
        // simply not listening, and a button that pretends otherwise is worse
        // than one that admits it.
        void vscode.window.showInformationMessage('No session is waiting on this board.');
        return;
      }
      const released = await board.poke();
      void vscode.window.showInformationMessage(`Released ${released} waiting session${released === 1 ? '' : 's'}.`);
    } catch (err) {
      void vscode.window.showErrorMessage(`Notify failed: ${messageOf(err)}`);
    }
  }

  async start(): Promise<void> {
    const choice = chooseStartCommand({ aboard: isOnPath('aboard'), ape: isOnPath('ape') });
    if (!choice.ok) {
      void vscode.window.showErrorMessage(choice.message);
      return;
    }
    const folders = (vscode.workspace.workspaceFolders ?? []).filter((f) => f.uri.scheme === 'file');
    if (folders.length === 0) {
      void vscode.window.showErrorMessage('Open a folder first: a board belongs to a project directory.');
      return;
    }
    const folder = folders.length === 1 ? folders[0] : await vscode.window.showWorkspaceFolderPick();
    if (!folder) {
      return;
    }
    const cwd = findProjectRoot(folder.uri.fsPath) ?? folder.uri.fsPath;
    const terminal = vscode.window.createTerminal({ name: 'aboard', cwd });
    terminal.show(true);
    terminal.sendText(choice.display);

    // Poll rather than assume. An empty tree with no explanation is the worst
    // version of this, and `serve` refuses to start beside an existing board —
    // so "it did not come up" is a real outcome worth naming.
    for (let attempt = 0; attempt < 20; attempt++) {
      await delay(500);
      await this.discover();
      if (this.entries.length > 0) {
        return;
      }
    }
    void vscode.window.showWarningMessage(
      `Started \`${choice.display}\` in a terminal, but no board answered within 10s — check the terminal output.`,
    );
  }

  async dismiss(node: Node): Promise<void> {
    if (node.kind !== 'tab') {
      return;
    }
    await this.applyEdit(node.entry.board, dismissChange(node.item.id), `Dismiss ${node.item.label}`);
  }

  async approve(node: Node): Promise<void> {
    if (node.kind !== 'tab') {
      return;
    }
    const answer = await vscode.window.showWarningMessage(
      `Delete “${node.item.label}” (${node.item.id})? This is the removal an agent asked for.`,
      { modal: true },
      'Delete',
    );
    if (answer !== 'Delete') {
      return;
    }
    await this.applyEdit(node.entry.board, approveRemoval(node.item.id), `Delete ${node.item.label}`);
  }

  async deny(node: Node): Promise<void> {
    if (node.kind !== 'tab') {
      return;
    }
    await this.applyEdit(node.entry.board, denyRemoval(node.item.id), `Keep ${node.item.label}`);
  }

  async rename(node: Node): Promise<void> {
    if (node.kind !== 'tab') {
      return;
    }
    const name = await vscode.window.showInputBox({
      title: `Rename ${node.item.id}`,
      value: node.item.label === '(unnamed)' ? '' : node.item.label,
      prompt: 'What the human sees on the tab.',
    });
    if (name === undefined) {
      return;
    }
    await this.applyEdit(node.entry.board, renameTab(node.item.id, name), `Rename ${node.item.id}`);
  }

  async note(node: Node): Promise<void> {
    if (node.kind !== 'tab') {
      return;
    }
    const doc = node.entry.doc;
    const current = doc?.tabs.find((t) => t.id === node.item.id)?.note ?? '';
    const note = await vscode.window.showInputBox({
      title: `Note for ${node.item.id}`,
      value: current,
      prompt: 'What this tab is FOR, in your words. Agents read it before acting on the tab. Empty clears it.',
    });
    if (note === undefined) {
      return;
    }
    await this.applyEdit(node.entry.board, setNote(node.item.id, note), `Set note on ${node.item.id}`);
  }

  async copyId(node: Node): Promise<void> {
    if (node.kind !== 'tab') {
      return;
    }
    await vscode.env.clipboard.writeText(node.item.id);
    void vscode.window.setStatusBarMessage(`Copied ${node.item.id}`, 2000);
  }

  async copyReference(node: Node): Promise<void> {
    if (node.kind !== 'tab') {
      return;
    }
    const url = referenceFor(node.entry.board.boardUrl, node.item.id);
    await vscode.env.clipboard.writeText(url);
    void vscode.window.setStatusBarMessage(`Copied ${url}`, 2000);
  }

  async refresh(): Promise<void> {
    // Discovery, not just a re-read: "refresh" is what the human presses after a
    // restart, and a restart can change the port.
    this.caps.clear();
    this.chromeProbe.clear();
    this.chromeUnreadable.clear();
    await this.discover();
  }

  dispose(): void {
    this.disposed = true;
    for (const t of this.reloadTimers.values()) {
      clearTimeout(t);
    }
    for (const sub of this.streams.values()) {
      sub.dispose();
    }
    for (const panel of this.panels.values()) {
      panel.dispose();
    }
  }
}

function messageOf(err: unknown): string {
  if (err instanceof BoardError || err instanceof Error) {
    return err.message;
  }
  return String(err);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function activate(context: vscode.ExtensionContext): void {
  const controller = new Controller(context);
  context.subscriptions.push(controller);

  const on = (id: string, run: (...args: never[]) => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, run as (...args: unknown[]) => unknown));

  on('aboard.open', () => controller.openPanel());
  on('aboard.refresh', () => controller.refresh());
  on('aboard.start', () => controller.start());
  on('aboard.notify', () => controller.notify());
  on('aboard.openTab', (node: Node) => controller.openTab(node));
  on('aboard.dismissChange', (node: Node) => controller.dismiss(node));
  on('aboard.approveRemoval', (node: Node) => controller.approve(node));
  on('aboard.denyRemoval', (node: Node) => controller.deny(node));
  on('aboard.rename', (node: Node) => controller.rename(node));
  on('aboard.setNote', (node: Node) => controller.note(node));
  on('aboard.copyId', (node: Node) => controller.copyId(node));
  on('aboard.copyReference', (node: Node) => controller.copyReference(node));

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => void controller.discover()),
  );

  // A board appearing or going away is a file event: `serve` writes the instance
  // record at startup and removes it on exit. Watching it beats polling, and it
  // is how a board started AFTER this extension activated ever shows up.
  const watcher = vscode.workspace.createFileSystemWatcher('**/.aboard/run/instance*.json');
  watcher.onDidCreate(() => void controller.discover());
  watcher.onDidChange(() => void controller.discover());
  watcher.onDidDelete(() => void controller.discover());
  context.subscriptions.push(watcher);

  void controller.discover();
}

export function deactivate(): void {
  // Everything is in context.subscriptions.
}
