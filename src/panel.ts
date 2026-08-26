// The webview panel: one iframe pointed at the running board, and a bridge.
//
// It renders nothing. Every pixel inside the frame is the board serving itself,
// which is what keeps this extension free of schema and renderer knowledge — a
// sixteenth renderer needs no change here.

import * as fs from 'node:fs';
import * as vscode from 'vscode';

import type { Board } from './board';
import { frameSrc } from './model';
import { parseWebviewMessage } from './messages';

function makeNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) {
    out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return out;
}

function originOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '';
  }
}

export class BoardPanel {
  static readonly viewType = 'aboard.panel';

  private disposables: vscode.Disposable[] = [];
  private disposed = false;
  private ready = false;
  private pending: string | undefined;
  private nonceCounter = 0;
  private activeTab: string | undefined;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly board: Board,
    private readonly boardUrl: string,
    private readonly onActive: (tab: string) => void,
    private readonly onDispose: () => void,
  ) {
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (raw: unknown) => {
        const message = parseWebviewMessage(raw);
        if (!message) {
          return;
        }
        if (message.type === 'ready') {
          this.ready = true;
          if (this.pending) {
            const tab = this.pending;
            this.pending = undefined;
            void this.goto(tab);
          }
          return;
        }
        // The board switched tabs on its own. Remember it so a reveal in the
        // tree does not bounce straight back out as another goto.
        this.activeTab = message.tab;
        this.onActive(message.tab);
      },
      null,
      this.disposables,
    );
  }

  static async create(
    board: Board,
    extensionUri: vscode.Uri,
    handlers: { onActive: (tab: string) => void; onDispose: () => void },
    column: vscode.ViewColumn = vscode.ViewColumn.Active,
  ): Promise<BoardPanel> {
    const panel = vscode.window.createWebviewPanel(BoardPanel.viewType, `Aboard · ${board.title}`, column, {
      enableScripts: true,
      // Without this, hiding the panel destroys the page and rebuilds it on
      // reveal. The board rehydrates from its state file, but the human's zoom,
      // scroll position and half-typed chat message do not.
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      // So the same code works over Remote SSH and Codespaces, where the board
      // is on the REMOTE loopback and the webview is not.
      portMapping: [{ webviewPort: board.port, extensionHostPort: board.port }],
    });

    const external = await vscode.env.asExternalUri(vscode.Uri.parse(board.boardUrl));
    const boardUrl = external.toString();
    panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'activity.svg');
    const created = new BoardPanel(panel, board, boardUrl, handlers.onActive, handlers.onDispose);
    created.render(extensionUri);
    return created;
  }

  private render(extensionUri: vscode.Uri): void {
    const file = vscode.Uri.joinPath(extensionUri, 'media', 'panel.html').fsPath;
    const nonce = makeNonce();
    // Both loopback spellings plus whatever asExternalUri produced. On a local
    // window they are the same host; on a remote they are not, and listing all
    // three is cheaper than working out which one this window is.
    const frameOrigins = [
      originOf(this.boardUrl),
      `http://localhost:${this.board.port}`,
      `http://127.0.0.1:${this.board.port}`,
    ]
      .filter((o, i, all) => o !== '' && all.indexOf(o) === i)
      .join(' ');
    const csp = [
      "default-src 'none'",
      `frame-src ${frameOrigins}`,
      `script-src 'nonce-${nonce}'`,
      "style-src 'unsafe-inline'",
    ].join('; ');

    const html = fs
      .readFileSync(file, 'utf8')
      .replace('__CSP__', csp)
      .replace('__NONCE__', nonce)
      .replace('__SRC__', frameSrc(this.boardUrl, undefined, 0));
    this.panel.webview.html = html;
  }

  get currentTab(): string | undefined {
    return this.activeTab;
  }

  reveal(column: vscode.ViewColumn = vscode.ViewColumn.Active): void {
    this.panel.reveal(column, true);
  }

  /** Point the frame at a tab. Fragment-only navigation: the page does not reload. */
  async goto(tabId: string): Promise<void> {
    if (!this.ready) {
      // The click that opened the panel arrives before the page's script runs.
      this.pending = tabId;
      return;
    }
    this.activeTab = tabId;
    this.nonceCounter += 1;
    await this.panel.webview.postMessage({
      type: 'goto',
      tab: tabId,
      src: frameSrc(this.boardUrl, tabId, this.nonceCounter),
    });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const d of this.disposables.splice(0)) {
      d.dispose();
    }
    // Idempotent, and reached from both directions: the human closing the editor
    // tab fires onDidDispose into here, and the extension deactivating calls
    // here to close the editor tab.
    this.panel.dispose();
    this.onDispose();
  }
}
