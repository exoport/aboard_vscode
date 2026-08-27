// A stand-in for the `vscode` module, so the adapter half of this extension can
// be run by `node --test`.
//
// **Why this exists at all.** `src/extension.ts` and `src/tree.ts` are the only
// two files that import `vscode`, and until now nothing executed them: the pure
// half was well covered and the adapter was reasoned about. The first real run
// found a defect that lived neither in the pure half nor in the adapter — the
// dot SVGs were not well-formed XML — and the only way to *rule out* the adapter
// while hunting it was to run it. Ruling something out is worth a test.
//
// **What it is not.** It is not a VS Code emulator and must never grow into one.
// It models exactly the contract the extension depends on:
//
//   * `EventEmitter` fires listeners synchronously;
//   * a TreeView subscribes to `onDidChangeTreeData` and, when it fires, walks
//     `getChildren`/`getTreeItem` again — which is the behaviour the whole "does
//     the tree refresh on an SSE frame" question is about;
//   * `commands.executeCommand('setContext', k, v)` records the context key;
//   * notifications are recorded rather than shown;
//   * the clipboard records what was written to it;
//   * a rendered row keeps the NODE it was drawn from, because that object is
//     exactly what VS Code hands a `view/item/context` command as its argument —
//     so a test can press a context-menu item the way a human does.
//
// Anything a test wants to look at afterwards is on `__probe`. This file is NOT
// named `*.test.ts`, so `node --test out/test/*.test.js` does not run it.

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as path from 'node:path';

export class Uri {
  private constructor(
    readonly scheme: string,
    private readonly _path: string,
    private readonly _raw?: string,
  ) {}

  static file(p: string): Uri {
    return new Uri('file', p);
  }

  static parse(value: string): Uri {
    return new Uri('http', value, value);
  }

  static joinPath(base: Uri, ...parts: string[]): Uri {
    return new Uri(base.scheme, path.join(base.fsPath, ...parts));
  }

  get fsPath(): string {
    return this._path;
  }

  get path(): string {
    return this._path;
  }

  toString(): string {
    return this._raw ?? `${this.scheme}://${this._path}`;
  }
}

export class EventEmitter<T> {
  private listeners: Array<(value: T) => void> = [];

  get event(): (fn: (value: T) => void) => { dispose(): void } {
    return (fn) => {
      this.listeners.push(fn);
      return { dispose: () => (this.listeners = this.listeners.filter((l) => l !== fn)) };
    };
  }

  fire(value: T): void {
    for (const listener of [...this.listeners]) {
      listener(value);
    }
  }

  dispose(): void {
    this.listeners = [];
  }
}

export const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 } as const;
export const StatusBarAlignment = { Left: 1, Right: 2 } as const;
export const ViewColumn = { Active: -1, One: 1 } as const;

export class TreeItem {
  id?: string;
  description?: string;
  tooltip?: unknown;
  contextValue?: string;
  iconPath?: unknown;
  command?: unknown;

  constructor(
    readonly label: string,
    readonly collapsibleState: number,
  ) {}
}

export class ThemeIcon {
  constructor(readonly id: string) {}
}

export class MarkdownString {
  constructor(readonly value: string) {}
}

export class Disposable {
  constructor(readonly dispose: () => void = () => {}) {}
}

/** One rendered row, as VS Code would have drawn it. */
export interface RenderedRow {
  label: string;
  description?: string;
  contextValue?: string;
  /** The light icon's fsPath, or undefined when the row has no file icon. */
  iconPath?: string;
  /** A codicon id, for the rows that use one instead of a file. */
  themeIcon?: string;
  nested: boolean;
  /** The provider's own node for this row: what a context-menu command receives. */
  node: unknown;
}

export const probe = {
  log: [] as string[],
  notifications: [] as Array<{ level: 'info' | 'warning' | 'error'; message: string }>,
  contexts: new Map<string, unknown>(),
  commands: new Map<string, (...args: any[]) => unknown>(),
  rows: [] as RenderedRow[],
  renders: 0,
  badge: undefined as { value: number; tooltip?: string } | undefined,
  /** Everything `env.clipboard.writeText` was given, newest last. */
  clipboard: [] as string[],
  /** The status-bar item as it currently reads, or undefined while hidden. */
  status: undefined as { text: string; tooltip: string } | undefined,
  /** Workspace settings, keyed `section.key` — see `workspace.getConfiguration`. */
  settings: new Map<string, unknown>(),
  colorThemeListeners: [] as Array<(theme: { kind: number }) => void>,
  configListeners: [] as Array<(e: { affectsConfiguration(section: string): boolean }) => void>,
  reset(): void {
    this.log = [];
    this.notifications = [];
    this.contexts = new Map();
    this.commands = new Map();
    this.rows = [];
    this.renders = 0;
    this.badge = undefined;
    this.clipboard = [];
    this.status = undefined;
    this.settings = new Map();
    this.colorThemeListeners = [];
    this.configListeners = [];
  },
};

function iconOf(item: TreeItem): { file?: string; theme?: string } {
  const icon = item.iconPath as { light?: Uri; dark?: Uri } | Uri | ThemeIcon | undefined;
  if (!icon) {
    return {};
  }
  if (icon instanceof ThemeIcon) {
    // VS Code themes its own icons, which is exactly why the two status dots are
    // files instead. Kept apart here so a test cannot mistake one for the other.
    return { theme: icon.id };
  }
  if (icon instanceof Uri) {
    return { file: icon.fsPath };
  }
  // VS Code picks `dark` under a dark theme and `light` otherwise. This extension
  // sends the same Uri for both, and a test that only ever looked at one would
  // not notice if that stopped being true.
  const light = icon.light instanceof Uri ? icon.light.fsPath : undefined;
  const dark = icon.dark instanceof Uri ? icon.dark.fsPath : undefined;
  if (light === undefined || dark === undefined || light !== dark) {
    throw new Error(`iconPath is not a {light, dark} pair of matching Uris: ${JSON.stringify(icon)}`);
  }
  return { file: light };
}

function makeTreeView(id: string, options: any): any {
  const provider = options.treeDataProvider;
  const walk = () => {
    probe.renders += 1;
    const rows: RenderedRow[] = [];
    const push = (node: unknown, nested: boolean) => {
      const item: TreeItem = provider.getTreeItem(node);
      const icon = iconOf(item);
      rows.push({
        label: item.label,
        description: item.description,
        contextValue: item.contextValue,
        iconPath: icon.file,
        themeIcon: icon.theme,
        nested,
        node,
      });
      if (item.collapsibleState === TreeItemCollapsibleState.Expanded) {
        for (const child of provider.getChildren(node) ?? []) {
          push(child, true);
        }
      }
    };
    for (const child of provider.getChildren(undefined) ?? []) {
      push(child, false);
    }
    probe.rows = rows;
  };
  provider.onDidChangeTreeData(() => walk());
  walk();
  return {
    id,
    visible: true,
    selection: [],
    set badge(value: { value: number; tooltip?: string } | undefined) {
      probe.badge = value;
    },
    get badge(): { value: number; tooltip?: string } | undefined {
      return probe.badge;
    },
    reveal: async () => {},
    onDidChangeVisibility: () => new Disposable(),
    dispose() {},
  };
}

export const window = {
  createOutputChannel: () => ({
    appendLine: (line: string) => probe.log.push(line),
    dispose() {},
  }),
  createTreeView: makeTreeView,
  createStatusBarItem: () => ({
    text: '',
    tooltip: '',
    command: '',
    show(this: { text: string; tooltip: string }) {
      probe.status = { text: this.text, tooltip: this.tooltip };
    },
    hide() {
      probe.status = undefined;
    },
    dispose() {},
  }),
  showInformationMessage: (message: string) => {
    probe.notifications.push({ level: 'info', message });
    return Promise.resolve(undefined);
  },
  showWarningMessage: (message: string) => {
    probe.notifications.push({ level: 'warning', message });
    return Promise.resolve(undefined);
  },
  showErrorMessage: (message: string) => {
    probe.notifications.push({ level: 'error', message });
    return Promise.resolve(undefined);
  },
  showInputBox: () => Promise.resolve(undefined),
  showQuickPick: () => Promise.resolve(undefined),
  showWorkspaceFolderPick: () => Promise.resolve(undefined),
  setStatusBarMessage: () => new Disposable(),
  createTerminal: () => ({ show() {}, sendText() {}, dispose() {} }),
  createWebviewPanel: () => {
    throw new Error('the stub has no webview: the panel is one of the two things only a real VS Code can show');
  },
  // `activate()` subscribes to this so an open panel can be told to read the
  // editor's colours again. There is no panel here — `createWebviewPanel`
  // throws on purpose — so the emitter exists to be subscribed to and fired,
  // not to carry a payload: `ColorTheme` has a `kind` and no values.
  onDidChangeActiveColorTheme: (fn: (theme: { kind: number }) => void) => {
    probe.colorThemeListeners.push(fn);
    return new Disposable(() => {
      probe.colorThemeListeners = probe.colorThemeListeners.filter((l) => l !== fn);
    });
  },
};

export const workspace = {
  workspaceFolders: [] as Array<{ uri: { scheme: string; fsPath: string } }>,
  onDidChangeWorkspaceFolders: () => new Disposable(),
  // Settings, as a plain map on the probe. Only `aboard.theme` is read today,
  // and the fallback is what VS Code does with an absent value: hand back the
  // default the caller passed, or undefined.
  getConfiguration: (section: string) => ({
    get: <T>(key: string, fallback?: T): T | undefined =>
      (probe.settings.get(`${section}.${key}`) as T | undefined) ?? fallback,
  }),
  onDidChangeConfiguration: (fn: (e: { affectsConfiguration(section: string): boolean }) => void) => {
    probe.configListeners.push(fn);
    return new Disposable(() => {
      probe.configListeners = probe.configListeners.filter((l) => l !== fn);
    });
  },
  createFileSystemWatcher: () => ({
    onDidCreate: () => new Disposable(),
    onDidChange: () => new Disposable(),
    onDidDelete: () => new Disposable(),
    dispose() {},
  }),
};

export const commands = {
  registerCommand: (id: string, fn: (...args: any[]) => unknown) => {
    probe.commands.set(id, fn);
    return new Disposable();
  },
  executeCommand: async (id: string, key?: string, value?: unknown) => {
    if (id === 'setContext' && key !== undefined) {
      probe.contexts.set(key, value);
    }
    return undefined;
  },
};

export const env = {
  clipboard: {
    writeText: async (value: string) => {
      probe.clipboard.push(value);
    },
  },
  asExternalUri: async (uri: Uri) => uri,
};
