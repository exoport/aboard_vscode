// The sidebar tree. A translation of `model.ts` into TreeItems and nothing more
// — every rule it applies (order, icon precedence, tooltip, badge) is decided
// and tested there.

import * as vscode from 'vscode';

import type { Board, Capabilities, Doc } from './board';
import { badgeCount, tabItems, typeLabels, type TabItemModel, type TypeLabels } from './model';

export interface BoardEntry {
  board: Board;
  doc?: Doc;
  caps?: Capabilities;
  /** Why this board has nothing to show, when it has nothing to show. */
  problem?: string;
}

export type Node =
  | { kind: 'board'; key: string; entry: BoardEntry }
  | { kind: 'tab'; key: string; entry: BoardEntry; item: TabItemModel };

export class BoardTreeProvider implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  private entries: BoardEntry[] = [];
  /**
   * Node identity has to be stable across a refresh or `reveal` cannot find the
   * item it was handed — VS Code matches by object, not by id.
   */
  private nodes = new Map<string, Node>();

  constructor(private readonly extensionUri: vscode.Uri) {}

  setEntries(entries: BoardEntry[]): void {
    this.entries = entries;
    const live = new Set<string>();
    for (const entry of entries) {
      live.add(entry.board.instanceFile);
      for (const item of this.itemsOf(entry)) {
        live.add(`${entry.board.instanceFile}::${item.id}`);
      }
    }
    for (const key of [...this.nodes.keys()]) {
      if (!live.has(key)) {
        this.nodes.delete(key);
      }
    }
    this.changed.fire(undefined);
  }

  get boards(): Board[] {
    return this.entries.map((e) => e.board);
  }

  /** The one board, when there is exactly one — most workspaces. */
  get soleBoard(): Board | undefined {
    return this.entries.length === 1 ? this.entries[0]!.board : undefined;
  }

  entryFor(board: Board): BoardEntry | undefined {
    return this.entries.find((e) => e.board.instanceFile === board.instanceFile);
  }

  /** Total across every board in the workspace, which is what one badge can say. */
  get badge(): number {
    return this.entries.reduce((sum, e) => sum + (e.doc ? badgeCount(e.doc) : 0), 0);
  }

  nodeFor(board: Board, tabId: string): Node | undefined {
    return this.nodes.get(`${board.instanceFile}::${tabId}`);
  }

  private labelsOf(entry: BoardEntry): TypeLabels {
    return typeLabels(entry.caps);
  }

  private itemsOf(entry: BoardEntry): TabItemModel[] {
    return entry.doc ? tabItems(entry.doc, this.labelsOf(entry)) : [];
  }

  private tabNodes(entry: BoardEntry): Node[] {
    return this.itemsOf(entry).map((item) => {
      const key = `${entry.board.instanceFile}::${item.id}`;
      const existing = this.nodes.get(key);
      if (existing && existing.kind === 'tab') {
        existing.item = item;
        existing.entry = entry;
        return existing;
      }
      const node: Node = { kind: 'tab', key, entry, item };
      this.nodes.set(key, node);
      return node;
    });
  }

  private boardNode(entry: BoardEntry): Node {
    const key = entry.board.instanceFile;
    const existing = this.nodes.get(key);
    if (existing && existing.kind === 'board') {
      existing.entry = entry;
      return existing;
    }
    const node: Node = { kind: 'board', key, entry };
    this.nodes.set(key, node);
    return node;
  }

  getChildren(element?: Node): Node[] {
    if (!element) {
      // One board: its tabs sit at the top level, because a single always-open
      // parent row is a wasted line. Two or more: a row each, so the tree says
      // WHICH board a tab belongs to rather than merging two projects into one
      // undifferentiated list.
      if (this.entries.length === 1) {
        const only = this.entries[0]!;
        // One board: its tabs sit at the top level, because a single
        // always-open parent row is a wasted line. UNLESS there is nothing to
        // put there — a board that answered /health and then failed to hand
        // over its document produced an EMPTY sidebar, with the welcome view
        // suppressed (a board IS running) and the reason only in the output
        // channel. An empty tree with no explanation is the worst version of
        // this, so when the tabs are missing the board's own row is the
        // message.
        if (only.doc) {
          return this.tabNodes(only);
        }
        return [this.boardNode(only)];
      }
      return this.entries.map((entry) => this.boardNode(entry));
    }
    if (element.kind === 'board') {
      return this.tabNodes(element.entry);
    }
    return [];
  }

  getParent(element: Node): Node | undefined {
    if (element.kind === 'tab' && this.entries.length > 1) {
      return this.boardNode(element.entry);
    }
    return undefined;
  }

  getTreeItem(element: Node): vscode.TreeItem {
    if (element.kind === 'board') {
      const item = new vscode.TreeItem(
        element.entry.board.title,
        // Nothing to expand into: an arrow that opens onto nothing reads as a
        // tree that is still loading.
        element.entry.doc
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.None,
      );
      item.description = element.entry.problem ?? `port ${element.entry.board.port}`;
      item.tooltip = new vscode.MarkdownString(
        [
          `\`${element.entry.board.projectRoot}\``,
          '',
          `${element.entry.board.instance.app} ${element.entry.board.instance.version ?? ''} · port ${element.entry.board.port}`,
          ...(element.entry.problem ? ['', element.entry.problem] : []),
        ].join('\n'),
      );
      item.contextValue = 'board';
      item.iconPath = new vscode.ThemeIcon('server-process');
      return item;
    }

    const { item: model } = element;
    const treeItem = new vscode.TreeItem(model.label, vscode.TreeItemCollapsibleState.None);
    treeItem.id = `${element.entry.board.instanceFile}::${model.id}`;
    treeItem.description = model.description;
    treeItem.tooltip = new vscode.MarkdownString(model.tooltip);
    treeItem.contextValue = model.contextValue;
    if (model.dot) {
      // The one place a board colour is duplicated — see src/tokens.ts. A
      // ThemeIcon cannot carry it: VS Code themes its own icons.
      const file = model.dot === 'removal' ? 'dot-removal.svg' : 'dot-change.svg';
      const uri = vscode.Uri.joinPath(this.extensionUri, 'media', file);
      treeItem.iconPath = { light: uri, dark: uri };
    }
    treeItem.command = {
      command: 'aboard.openTab',
      title: 'Show Tab in Panel',
      arguments: [element],
    };
    return treeItem;
  }

  dispose(): void {
    this.changed.dispose();
  }
}
